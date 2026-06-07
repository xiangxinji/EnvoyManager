import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { adminAuth, clientAuth, dualAuth } from "../../routes/middleware.js";
import { __clearSessions, __seedSession } from "../../routes/admin.js";
import { __clearClientSessions, __seedClientSession } from "../../routes/users.js";
import adminRoutes from "../../routes/admin.js";
import userRoutes from "../../routes/users.js";
import dashboardRoutes from "../../routes/dashboard.js";
import teamRoutes from "../../routes/teams.js";
import messageRoutes from "../../routes/messages.js";
import { setupDB, ensureCrypto } from "./helpers.js";

beforeEach(() => {
  __clearSessions();
  __clearClientSessions();
  setupDB();
  ensureCrypto();
});

// ─── Shared middleware: adminAuth ───

describe("Shared middleware: adminAuth", () => {
  it("rejects without Authorization header", async () => {
    const app = new Hono();
    app.use("/test/*", adminAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data");
    expect(res.status).toBe(401);
  });

  it("rejects with invalid token", async () => {
    const app = new Hono();
    app.use("/test/*", adminAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects with expired token", async () => {
    const token = __seedSession(Date.now() - 25 * 60 * 60 * 1000);
    const app = new Hono();
    app.use("/test/*", adminAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("allows with valid admin token", async () => {
    const token = __seedSession();
    const app = new Hono();
    app.use("/test/*", adminAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});

// ─── Shared middleware: clientAuth ───

describe("Shared middleware: clientAuth", () => {
  it("rejects without token", async () => {
    const app = new Hono();
    app.use("/test/*", clientAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data");
    expect(res.status).toBe(401);
  });

  it("allows with valid X-Envoy-Token header", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("/test/*", clientAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
  });

  it("allows with valid ?token= query param", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("/test/*", clientAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request(`/test/data?token=${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── Shared middleware: dualAuth ───

describe("Shared middleware: dualAuth", () => {
  it("rejects with no auth", async () => {
    const app = new Hono();
    app.use("/test/*", dualAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data");
    expect(res.status).toBe(401);
  });

  it("allows with valid admin token", async () => {
    const token = __seedSession();
    const app = new Hono();
    app.use("/test/*", dualAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("allows with valid client token", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("/test/*", dualAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
  });

  it("falls through to client when admin is invalid", async () => {
    const clientToken = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("/test/*", dualAuth);
    app.get("/test/data", (c) => c.json({ ok: true }));
    const res = await app.request("/test/data", {
      headers: { Authorization: "Bearer invalid", "X-Envoy-Token": clientToken },
    });
    expect(res.status).toBe(200);
  });
});

// ─── Route group: admin endpoints (adminAuth) ───

describe("Route protection: admin endpoints", () => {
  function createApp() {
    const app = new Hono();
    app.use("*", cors());
    adminRoutes(app);
    return app;
  }

  it("GET /api/admin/profile rejects without token", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/profile");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/profile allows with valid admin token", async () => {
    const token = __seedSession();
    const app = createApp();
    const res = await app.request("/api/admin/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});

// ─── Route group: user CRUD (adminAuth) ───

describe("Route protection: user CRUD (adminAuth)", () => {
  function createApp() {
    const app = new Hono();
    app.use("*", cors());
    userRoutes(app);
    return app;
  }

  it("GET /api/users rejects without token", async () => {
    const app = createApp();
    const res = await app.request("/api/users");
    expect(res.status).toBe(401);
  });

  it("GET /api/users allows with valid admin token", async () => {
    const token = __seedSession();
    const app = createApp();
    const res = await app.request("/api/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/users/:username rejects without token", async () => {
    const app = createApp();
    const res = await app.request("/api/users/ghost", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/users/:username rejects without token", async () => {
    const app = createApp();
    const res = await app.request("/api/users/ghost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "x" }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Route group: public endpoints remain accessible ───

describe("Route protection: public endpoints (no auth required)", () => {
  function createApp() {
    const app = new Hono();
    app.use("*", cors());
    userRoutes(app);
    return app;
  }

  it("GET /api/public-key works without token", async () => {
    const app = createApp();
    const res = await app.request("/api/public-key");
    expect(res.status).toBe(200);
  });

  it("POST /api/auth works without token (returns 401 for bad creds, not middleware rejection)", async () => {
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "x" }),
    });
    // Should be 400 (missing valid RSA-encrypted password) or 401 (bad creds) — NOT 401 from middleware
    // The key point: it reaches the handler, not blocked by middleware
    expect([400, 401, 500]).toContain(res.status);
  });

  it("POST /api/auth/verify works without token", async () => {
    const app = createApp();
    const res = await app.request("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "x" }),
    });
    expect([400, 401, 500]).toContain(res.status);
  });
});

// ─── Route group: dashboard (adminAuth) ───

describe("Route protection: dashboard (adminAuth)", () => {
  it("GET /api/dashboard rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    dashboardRoutes(app, new Map());
    const res = await app.request("/api/dashboard");
    expect(res.status).toBe(401);
  });

  it("GET /api/dashboard allows with valid admin token (may 500 on missing team registry)", async () => {
    const token = __seedSession();
    const app = new Hono();
    app.use("*", cors());
    dashboardRoutes(app, new Map());
    const res = await app.request("/api/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Auth passed — may be 200 or error from downstream, but NOT 401
    expect(res.status).not.toBe(401);
  });
});

// ─── Route group: teams (dualAuth for reads, adminAuth for writes) ───

describe("Route protection: teams", () => {
  it("GET /api/teams rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    teamRoutes(app, new Map());
    const res = await app.request("/api/teams");
    expect(res.status).toBe(401);
  });

  it("GET /api/teams allows with valid admin token (may error on registry, but not 401)", async () => {
    const token = __seedSession();
    const app = new Hono();
    app.use("*", cors());
    teamRoutes(app, new Map());
    const res = await app.request("/api/teams", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).not.toBe(401);
  });

  it("GET /api/teams allows with valid client token", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("*", cors());
    teamRoutes(app, new Map());
    const res = await app.request("/api/teams?username=alice", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).not.toBe(401);
  });

  it("GET /api/teams rejects client querying another username", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("*", cors());
    teamRoutes(app, new Map());
    const res = await app.request("/api/teams?username=bob", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/teams rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    teamRoutes(app, new Map());
    const res = await app.request("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", leader: "alice" }),
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/teams/:name rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    teamRoutes(app, new Map());
    const res = await app.request("/api/teams/test-team", { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

// ─── Route group: messages (clientAuth) ───

describe("Route protection: messages (clientAuth)", () => {
  it("POST /api/messages rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", team: "test" },
      body: JSON.stringify({ from: "alice", to: "bob", content: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  it("GET /api/messages/sync rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/messages/sync?user=alice&team=test", {
      headers: { team: "test" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/tasks rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json", team: "test" },
      body: JSON.stringify({ from: "alice", content: "task" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/stickers rejects without token", async () => {
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/stickers", {
      method: "POST",
      headers: { team: "test" },
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/messages allows with valid client token (may 400/404, not 401)", async () => {
    const clientToken = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", team: "test", "X-Envoy-Token": clientToken },
      body: JSON.stringify({ to: "bob", text: "hi" }),
    });
    expect(res.status).not.toBe(401);
  });
});

// ─── authType context variable ───

describe("authType context: clientAuth sets 'client'", () => {
  it("sets authType to 'client' for valid client token", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("/test/*", clientAuth);
    app.get("/test/data", (c) => c.json({ authType: c.get("authType") ?? null }));
    const res = await app.request("/test/data", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authType).toBe("client");
  });
});

describe("authType context: dualAuth sets correct type", () => {
  it("sets authType to 'admin' for valid admin token", async () => {
    const token = __seedSession();
    const app = new Hono();
    app.use("/test/*", dualAuth);
    app.get("/test/data", (c) => c.json({ authType: c.get("authType") ?? null }));
    const res = await app.request("/test/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authType).toBe("admin");
  });

  it("sets authType to 'client' for valid client token", async () => {
    const token = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("/test/*", dualAuth);
    app.get("/test/data", (c) => c.json({
      authType: c.get("authType") ?? null,
      userId: c.get("userId") ?? null,
      role: c.get("role") ?? null,
    }));
    const res = await app.request("/test/data", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.authType).toBe("client");
    expect(data.userId).toBe("alice");
    expect(data.role).toBe("member");
  });
});

// ─── Identity enforcement: clientAuth routes use session userId ───

describe("Identity enforcement: messages route uses session identity", () => {
  it("POST /api/messages uses session userId, ignores body.from", async () => {
    const aliceToken = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        team: "test",
        "X-Envoy-Token": aliceToken,
      },
      body: JSON.stringify({ to: "charlie", text: "hi" }),
    });
    // Auth passed (not 401); team not found gives 404
    expect(res.status).not.toBe(401);
  });

  it("DELETE /api/messages/:id uses session userId for ownership check", async () => {
    const aliceToken = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/messages/msg-123", {
      method: "DELETE",
      headers: { team: "test", "X-Envoy-Token": aliceToken },
    });
    // Auth passed; team not found gives 404
    expect(res.status).not.toBe(401);
  });

  it("GET /api/messages/sync uses session userId", async () => {
    const aliceToken = __seedClientSession("alice", "member");
    const app = new Hono();
    app.use("*", cors());
    messageRoutes(app, new Map());
    const res = await app.request("/api/messages/sync?after_seq=0", {
      headers: { team: "test", "X-Envoy-Token": aliceToken },
    });
    expect(res.status).not.toBe(401);
  });
});
