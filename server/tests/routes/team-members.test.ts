import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type Database from "better-sqlite3";
import teamRoutes from "../../routes/teams.js";
import adminRoutes, { __clearSessions, __seedSession } from "../../routes/admin.js";
import { setupDB, seedUser } from "../auth/helpers.js";
import { saveMeta, deleteTeamDir, type TeamMeta } from "../../team-registry.js";

function createApp() {
  const app = new Hono();
  app.use("*", cors());
  adminRoutes(app);
  teamRoutes(app, new Map());
  return app;
}

const TEST_TEAM = "test-team";
const LEADER = "leader1";
const MEMBER = "member1";

let db: Database.Database;
let adminToken: string;

async function seedTeam() {
  const meta: TeamMeta = {
    name: TEST_TEAM,
    port: 9999,
    createdAt: Date.now(),
    leader: LEADER,
    members: [],
  };
  await saveMeta(meta);
}

beforeEach(() => {
  __clearSessions();
  db = setupDB();
  adminToken = __seedSession();
  seedUser(db, LEADER, "pass123", "leader");
  seedUser(db, MEMBER, "pass123", "member");
});

afterEach(async () => {
  await deleteTeamDir(TEST_TEAM).catch(() => {});
});

describe("PUT /api/teams/:name/members/:username", () => {
  it("adds an existing user as member", async () => {
    await seedTeam();
    const app = createApp();
    const res = await app.request(`/api/teams/${TEST_TEAM}/members/${MEMBER}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("rejects non-existent user", async () => {
    await seedTeam();
    const app = createApp();
    const res = await app.request(`/api/teams/${TEST_TEAM}/members/ghost`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("user not found");
  });

  it("rejects adding leader as member", async () => {
    await seedTeam();
    const app = createApp();
    const res = await app.request(`/api/teams/${TEST_TEAM}/members/${LEADER}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("leader");
  });

  it("rejects duplicate member", async () => {
    await seedTeam();
    const app = createApp();
    // First add succeeds
    await app.request(`/api/teams/${TEST_TEAM}/members/${MEMBER}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Second add fails
    const res = await app.request(`/api/teams/${TEST_TEAM}/members/${MEMBER}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already in team");
  });

  it("rejects without admin token", async () => {
    await seedTeam();
    const app = createApp();
    const res = await app.request(`/api/teams/${TEST_TEAM}/members/${MEMBER}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent team", async () => {
    const app = createApp();
    const res = await app.request(`/api/teams/no-such-team/members/${MEMBER}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
