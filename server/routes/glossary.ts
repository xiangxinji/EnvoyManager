import type { Hono, Context, Next } from "hono";
import type { Team } from "../../../envoy/packages/teams/team.js";
import { validateSession } from "./admin.js";
import { validateClientToken } from "./users.js";
import {
  listGlossary,
  createGlossaryEntry,
  updateGlossaryEntry,
  deleteGlossaryEntry,
} from "../manager-db.js";
import {
  listTeamGlossary,
  createTeamGlossaryEntry,
  updateTeamGlossaryEntry,
  deleteTeamGlossaryEntry,
} from "../db.js";
import type { GlossaryEntry } from "../manager-db.js";

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

export default function glossaryRoutes(app: Hono, teams: Map<string, Team>) {
  // ─── Client-authenticated: Agent fetches combined glossary ───

  app.get("/api/glossary", clientAuth, async (c) => {
    const teamName = c.req.query("team");
    const globalEntries = listGlossary();
    let teamEntries: GlossaryEntry[] = [];
    if (teamName && teams.has(teamName)) {
      teamEntries = listTeamGlossary(teamName);
    }
    // Merge: team entries override global on same term name
    const merged = new Map<string, GlossaryEntry>();
    for (const e of globalEntries) merged.set(e.term, e);
    for (const e of teamEntries) merged.set(e.term, e);
    return c.json(Array.from(merged.values()));
  });

  // ─── Admin-only: Global glossary CRUD ───

  app.use("/api/glossary/global/*", adminAuth);
  app.use("/api/glossary/global", adminAuth);

  app.get("/api/glossary/global", (c) => {
    return c.json(listGlossary());
  });

  app.post("/api/glossary/global", async (c) => {
    try {
      const body = await c.req.json() as { term?: string; definition?: string };
      if (!body.term?.trim() || !body.definition?.trim()) {
        return c.json({ error: "术语和释义不能为空" }, 400);
      }
      const entry = createGlossaryEntry(body.term.trim(), body.definition.trim());
      return c.json(entry, 201);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return c.json({ error: msg }, 400);
    }
  });

  app.put("/api/glossary/global/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json() as { term?: string; definition?: string };
      if (!body.term?.trim() || !body.definition?.trim()) {
        return c.json({ error: "术语和释义不能为空" }, 400);
      }
      const entry = updateGlossaryEntry(id, body.term.trim(), body.definition.trim());
      return c.json(entry);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return c.json({ error: msg }, 400);
    }
  });

  app.delete("/api/glossary/global/:id", async (c) => {
    try {
      const id = c.req.param("id");
      deleteGlossaryEntry(id);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return c.json({ error: msg }, 400);
    }
  });

  // ─── Admin-only: Team glossary CRUD ───

  app.use("/api/glossary/team/*", adminAuth);
  app.use("/api/glossary/team", adminAuth);

  app.get("/api/glossary/team", (c) => {
    const teamName = c.req.query("team");
    if (!teamName || !teams.has(teamName)) {
      return c.json({ error: "团队不存在" }, 400);
    }
    return c.json(listTeamGlossary(teamName));
  });

  app.post("/api/glossary/team", async (c) => {
    try {
      const teamName = c.req.query("team");
      if (!teamName || !teams.has(teamName)) {
        return c.json({ error: "团队不存在" }, 400);
      }
      const body = await c.req.json() as { term?: string; definition?: string };
      if (!body.term?.trim() || !body.definition?.trim()) {
        return c.json({ error: "术语和释义不能为空" }, 400);
      }
      const entry = createTeamGlossaryEntry(teamName, body.term.trim(), body.definition.trim());
      return c.json(entry, 201);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "创建失败";
      return c.json({ error: msg }, 400);
    }
  });

  app.put("/api/glossary/team/:id", async (c) => {
    try {
      const teamName = c.req.query("team");
      if (!teamName || !teams.has(teamName)) {
        return c.json({ error: "团队不存在" }, 400);
      }
      const id = c.req.param("id");
      const body = await c.req.json() as { term?: string; definition?: string };
      if (!body.term?.trim() || !body.definition?.trim()) {
        return c.json({ error: "术语和释义不能为空" }, 400);
      }
      const entry = updateTeamGlossaryEntry(teamName, id, body.term.trim(), body.definition.trim());
      return c.json(entry);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "更新失败";
      return c.json({ error: msg }, 400);
    }
  });

  app.delete("/api/glossary/team/:id", async (c) => {
    try {
      const teamName = c.req.query("team");
      if (!teamName || !teams.has(teamName)) {
        return c.json({ error: "团队不存在" }, 400);
      }
      const id = c.req.param("id");
      deleteTeamGlossaryEntry(teamName, id);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "删除失败";
      return c.json({ error: msg }, 400);
    }
  });
}
