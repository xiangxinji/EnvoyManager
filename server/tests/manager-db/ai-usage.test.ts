import { describe, it, expect, beforeEach } from "vitest";
import type Database from "better-sqlite3";
import { recordUsage, queryUsage, __setDb } from "../../manager-db.js";
import { createManagerDB, seedAdmin } from "../helpers/manager-db.js";

let db: Database.Database;

beforeEach(() => {
  db = createManagerDB();
  __setDb(db);
  seedAdmin(db);
});

describe("recordUsage", () => {
  it("inserts a usage record", () => {
    recordUsage({ team: "alpha", username: "user1", scene: "agent", presetId: "p1", promptTokens: 100, completionTokens: 50 });
    const rows = db.prepare("SELECT * FROM ai_usage").all() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].team).toBe("alpha");
    expect(rows[0].username).toBe("user1");
    expect(rows[0].scene).toBe("agent");
    expect(rows[0].prompt_tokens).toBe(100);
    expect(rows[0].completion_tokens).toBe(50);
  });

  it("silently catches errors", () => {
    // Force an error by dropping the table
    db.exec("DROP TABLE ai_usage");
    expect(() => recordUsage({ team: "a", username: "b", scene: "c", presetId: "d", promptTokens: 1, completionTokens: 1 })).not.toThrow();
  });
});

describe("queryUsage", () => {
  function seed() {
    const now = Date.now();
    const stmt = db.prepare("INSERT INTO ai_usage (team, username, scene, preset_id, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    stmt.run("alpha", "user1", "agent", "p1", 100, 50, now - 2000);
    stmt.run("alpha", "user1", "chat",  "p1", 200, 100, now - 1000);
    stmt.run("beta",  "user2", "agent", "p2", 300, 150, now);
    stmt.run("beta",  "user2", "task",  "p2", 400, 200, now + 1000);
  }

  it("returns total usage without group", () => {
    seed();
    const result = queryUsage();
    expect(result.total.promptTokens).toBe(1000);
    expect(result.total.completionTokens).toBe(500);
    expect(result.total.calls).toBe(4);
    expect(result.breakdown).toHaveLength(0);
  });

  it("returns empty for no data", () => {
    const result = queryUsage();
    expect(result.total.promptTokens).toBe(0);
    expect(result.total.calls).toBe(0);
  });

  it("filters by team", () => {
    seed();
    const result = queryUsage({ team: "alpha" });
    expect(result.total.calls).toBe(2);
    expect(result.total.promptTokens).toBe(300);
  });

  it("filters by username", () => {
    seed();
    const result = queryUsage({ username: "user2" });
    expect(result.total.calls).toBe(2);
    expect(result.total.promptTokens).toBe(700);
  });

  it("filters by scene", () => {
    seed();
    const result = queryUsage({ scene: "agent" });
    expect(result.total.calls).toBe(2);
  });

  it("filters by time range", () => {
    seed();
    const now = Date.now();
    const result = queryUsage({ from: now - 1500, to: now + 2000 });
    // Should include alpha/chat (now-1000), beta/agent (now), beta/task (now+1000)
    expect(result.total.calls).toBe(3);
  });

  it("groups by team", () => {
    seed();
    const result = queryUsage({ group: "team" });
    expect(result.breakdown).toHaveLength(2);
    // beta has more tokens (700+350=1050 vs 300+150=450)
    expect(result.breakdown[0].key).toBe("beta");
    expect(result.breakdown[0].calls).toBe(2);
  });

  it("groups by username", () => {
    seed();
    const result = queryUsage({ group: "username" });
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[0].key).toBe("user2");
  });

  it("groups by scene", () => {
    seed();
    const result = queryUsage({ group: "scene" });
    expect(result.breakdown).toHaveLength(3);
  });

  it("groups by day", () => {
    seed();
    const result = queryUsage({ group: "day" });
    // All records are within the same day
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].calls).toBe(4);
  });

  it("combines filters with group", () => {
    seed();
    const result = queryUsage({ team: "alpha", group: "scene" });
    expect(result.total.calls).toBe(2);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown.map(b => b.key).sort()).toEqual(["agent", "chat"]);
  });
});
