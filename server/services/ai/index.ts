import { Hono } from "hono";
import type { AIConfig, SceneType } from "../../../../shared/types/ai.js";
import type { ResolvedScene } from "../../settings.js";
import { PROVIDERS } from "./constants.js";
import { handleChatStream, handleChatGenerate } from "./chat.js";
import { handleTaskGenerate } from "./task.js";
import { handleAnalyze } from "./analyze.js";

export interface AIRouterOptions {
  getConfig: () => AIConfig;
  resolveForScene: (scene: SceneType) => ResolvedScene;
}

export function createAIRoutes(options: AIRouterOptions) {
  const router = new Hono();

  // ─── Chat ───

  router.post("/chat/stream", async (c) => {
    try {
      const resolved = options.resolveForScene("chat");
      return handleChatStream(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  router.post("/chat/generate", async (c) => {
    try {
      const resolved = options.resolveForScene("chat");
      return handleChatGenerate(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  // ─── Task ───

  router.post("/task/generate", async (c) => {
    try {
      const resolved = options.resolveForScene("task");
      return handleTaskGenerate(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  router.post("/task/analyze", async (c) => {
    try {
      const resolved = options.resolveForScene("analyze");
      return handleAnalyze(c, resolved);
    } catch {
      return c.json({ error: "AI not configured" }, 503);
    }
  });

  // ─── Models ───

  router.get("/models", (c) => {
    return c.json(PROVIDERS);
  });

  return router;
}
