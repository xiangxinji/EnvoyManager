import type { Hono, Context, Next } from "hono";
import { validateSession } from "./admin.js";
import { validateClientToken } from "./users.js";
import {
  getAIConfig,
  resolveForScene,
  getDefaultPreset,
  createPreset,
  updatePreset,
  deletePreset,
  setDefaultPreset,
  getScenes,
  updateScenes,
} from "../settings.js";
import { createAIRoutes } from "../services/ai/index.js";
import { handleAgentReason } from "../services/ai/agent.js";
import { handleTaskDispatch } from "../services/ai/dispatch.js";
import { handleTaskReview } from "../services/ai/review.js";
import { PROVIDERS } from "../services/ai/constants.js";
import type { SceneType } from "../../../shared/types/ai.js";

async function adminAuth(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || !validateSession(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

async function clientAuth(c: Context, next: Next) {
  const token = c.req.header("X-Envoy-Token")
    || c.req.query("token");
  if (!token || !validateClientToken(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "****";
  return apiKey.slice(0, 4) + "****" + apiKey.slice(-4);
}

export default function aiRoutes(app: Hono) {
  // ─── Health check (public) ───

  app.get("/api/ai/health", (c) => {
    const ai = getAIConfig();
    const defaultPreset = getDefaultPreset();
    return c.json({
      configured: ai.presets.length > 0 && !!defaultPreset?.apiKey,
      provider: defaultPreset?.provider,
      model: defaultPreset?.model,
    });
  });

  // ─── Client-authenticated routes ───

  app.use("/api/ai/chat/*", clientAuth);
  app.use("/api/ai/task/generate", clientAuth);
  const router = createAIRoutes({ getConfig: getAIConfig, resolveForScene });
  app.route("/api/ai", router);

  // Agent reasoning
  app.post("/api/ai/agent/reason", clientAuth, async (c) => {
    try {
      const resolved = resolveForScene("agent" as SceneType);
      return handleAgentReason(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  // Task dispatch
  app.post("/api/ai/task/dispatch", clientAuth, async (c) => {
    try {
      const resolved = resolveForScene("dispatch" as SceneType);
      return handleTaskDispatch(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  // Task review
  app.post("/api/ai/task/review", clientAuth, async (c) => {
    try {
      const resolved = resolveForScene("review" as SceneType);
      return handleTaskReview(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  // ─── Admin-only routes ───

  // Config (read-only overview)
  app.use("/api/ai/config", adminAuth);

  app.get("/api/ai/config", (c) => {
    const ai = getAIConfig();
    const defaultPreset = getDefaultPreset();
    return c.json({
      presets: ai.presets.map((p) => ({
        id: p.id,
        name: p.name,
        provider: p.provider,
        model: p.model,
        baseURL: p.baseURL,
        apiKey: maskApiKey(p.apiKey),
        isDefault: p.isDefault,
      })),
      scenes: ai.scenes,
      configured: ai.presets.length > 0 && !!defaultPreset?.apiKey,
      defaultPreset: defaultPreset
        ? { id: defaultPreset.id, name: defaultPreset.name, provider: defaultPreset.provider, model: defaultPreset.model, isDefault: true }
        : undefined,
    });
  });

  // Preset CRUD
  app.use("/api/ai/presets/*", adminAuth);
  app.use("/api/ai/presets", adminAuth);

  app.get("/api/ai/presets", (c) => {
    const ai = getAIConfig();
    return c.json(
      ai.presets.map((p) => ({
        id: p.id,
        name: p.name,
        provider: p.provider,
        model: p.model,
        baseURL: p.baseURL,
        apiKey: maskApiKey(p.apiKey),
        isDefault: p.isDefault,
      }))
    );
  });

  app.post("/api/ai/presets", async (c) => {
    const body = await c.req.json();
    if (!body.name || !body.provider || !body.model) {
      return c.json({ error: "name, provider, and model are required" }, 400);
    }
    if (body.provider === "openai-compatible" && !body.baseURL) {
      return c.json({ error: "baseURL is required for openai-compatible provider" }, 400);
    }
    try {
      const preset = await createPreset({
        name: body.name,
        provider: body.provider,
        model: body.model,
        baseURL: body.baseURL,
        apiKey: body.apiKey ?? "",
      });
      return c.json({
        ...preset,
        apiKey: maskApiKey(preset.apiKey),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 400);
    }
  });

  app.put("/api/ai/presets/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    try {
      const preset = await updatePreset(id, {
        name: body.name,
        provider: body.provider,
        model: body.model,
        baseURL: body.baseURL,
        apiKey: body.apiKey,
      });
      return c.json({
        ...preset,
        apiKey: maskApiKey(preset.apiKey),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 404);
    }
  });

  app.put("/api/ai/presets/:id/default", async (c) => {
    const id = c.req.param("id");
    try {
      await setDefaultPreset(id);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 404);
    }
  });

  app.delete("/api/ai/presets/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await deletePreset(id);
      return c.json({ success: true });
    } catch (e: unknown) {
      const err = e as Error & { scenes?: string[] };
      if (err.scenes) {
        return c.json({ error: err.message, scenes: err.scenes }, 400);
      }
      return c.json({ error: err.message }, 404);
    }
  });

  // Scene configuration
  app.use("/api/ai/scenes", adminAuth);

  app.get("/api/ai/scenes", (c) => {
    const scenes = getScenes();
    const ai = getAIConfig();
    const enriched: Record<string, { presetId: string | null; presetName: string | null; temperature: number; maxTokens: number }> = {};
    for (const [scene, config] of Object.entries(scenes)) {
      const preset = config?.presetId ? ai.presets.find((p) => p.id === config.presetId) : undefined;
      enriched[scene] = {
        presetId: config?.presetId ?? null,
        presetName: preset?.name ?? null,
        temperature: config?.temperature ?? 0.7,
        maxTokens: config?.maxTokens ?? 4096,
      };
    }
    return c.json(enriched);
  });

  app.put("/api/ai/scenes", async (c) => {
    const body = await c.req.json();
    try {
      await updateScenes(body.scenes);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 400);
    }
  });

  // Models list
  app.get("/api/ai/models", adminAuth, (c) => {
    return c.json(PROVIDERS);
  });
}
