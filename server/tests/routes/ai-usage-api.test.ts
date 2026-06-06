import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type Database from "better-sqlite3";
import aiRoutes from "../../routes/ai.js";
import adminRoutes, { __clearSessions, __seedSession } from "../../routes/admin.js";
import { setupDB } from "../auth/helpers.js";
import { recordUsage, __setDb } from "../../manager-db.js";

function createApp() {
  const app = new Hono();
  app.use("*", cors());
  adminRoutes(app);
  aiRoutes(app, new Map());
  return app;
}

let db: Database.Database;
let adminToken: string;

beforeEach(() => {
  __clearSessions();
  db = setupDB();
  __setDb(db);
  adminToken = __seedSession();

  // Seed usage data
  const now = Date.now();
  recordUsage({ team: "alpha", username: "user1", scene: "agent", presetId: "p1", promptTokens: 100, completionTokens: 50 });
  recordUsage({ team: "alpha", username: "user1", scene: "chat", presetId: "p1", promptTokens: 200, completionTokens: 100 });
  recordUsage({ team: "beta", username: "user2", scene: "agent", presetId: "p2", promptTokens: 300, completionTokens: 150 });
  recordUsage({ team: "beta", username: "user2", scene: "task", presetId: "p2", promptTokens: 400, completionTokens: 200 });
});

describe("GET /api/ai/usage", () => {
  it("rejects without admin token", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage");
    expect(res.status).toBe(401);
  });

  it("returns total usage", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total.promptTokens).toBe(1000);
    expect(data.total.completionTokens).toBe(500);
    expect(data.total.calls).toBe(4);
  });

  it("groups by team", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage?group=team", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.breakdown).toHaveLength(2);
    expect(data.breakdown[0].key).toBe("beta"); // more tokens
  });

  it("groups by username", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage?group=username", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.breakdown).toHaveLength(2);
  });

  it("groups by scene", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage?group=scene", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.breakdown).toHaveLength(3); // agent, chat, task
  });

  it("groups by day", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage?group=day", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.breakdown).toHaveLength(1); // all same day
    expect(data.breakdown[0].calls).toBe(4);
  });

  it("filters by team", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/usage?team=alpha&group=scene", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total.calls).toBe(2);
    expect(data.breakdown).toHaveLength(2);
  });

  it("filters by time range", async () => {
    const app = createApp();
    const now = Date.now();
    const res = await app.request(`/api/ai/usage?from=${now - 1000}&to=${now + 1000}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total.calls).toBe(4);
  });
});
