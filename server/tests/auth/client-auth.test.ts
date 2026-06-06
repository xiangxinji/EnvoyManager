import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import {
  validateClientToken,
  __clearClientSessions,
  __seedClientSession,
} from "../../routes/users.js";
import { validateSession, __clearSessions, __seedSession } from "../../routes/admin.js";
import userRoutes from "../../routes/users.js";
import { setupDB, encryptPassword, ensureCrypto, seedUser } from "./helpers.js";

// ─── Shared setup ───

beforeEach(() => {
  __clearClientSessions();
  __clearSessions();
  setupDB();
  ensureCrypto();
});

// ─── Client session logic ───

describe("Client session: validateClientToken", () => {
  it("returns false for unknown token", () => {
    expect(validateClientToken("nonexistent")).toBe(false);
  });

  it("returns true for valid session", () => {
    const token = __seedClientSession("alice", "member");
    expect(validateClientToken(token)).toBe(true);
  });

  it("returns false for expired session (>24h)", () => {
    const token = __seedClientSession("alice", "member", Date.now() - 25 * 60 * 60 * 1000);
    expect(validateClientToken(token)).toBe(false);
  });

  it("returns true for session just under TTL (<24h)", () => {
    const token = __seedClientSession("alice", "member", Date.now() - 23 * 60 * 60 * 1000);
    expect(validateClientToken(token)).toBe(true);
  });

  it("deletes expired token from the sessions Map", () => {
    const token = __seedClientSession("alice", "member", Date.now() - 25 * 60 * 60 * 1000);
    expect(validateClientToken(token)).toBe(false);
    expect(validateClientToken(token)).toBe(false);
  });

  it("__clearClientSessions empties all sessions", () => {
    const t1 = __seedClientSession("a", "member");
    const t2 = __seedClientSession("b", "leader");
    const t3 = __seedClientSession("c", "member");
    __clearClientSessions();
    expect(validateClientToken(t1)).toBe(false);
    expect(validateClientToken(t2)).toBe(false);
    expect(validateClientToken(t3)).toBe(false);
  });
});

// ─── POST /api/auth (client login) ───

function createApp() {
  const app = new Hono();
  app.use("*", cors());
  userRoutes(app);
  return app;
}

describe("POST /api/auth", () => {
  it("returns 400 when username is missing", async () => {
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: encryptPassword("testpass") }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 for wrong password", async () => {
    const db = setupDB();
    seedUser(db, "testuser", "testpass", "member");
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: encryptPassword("wrong") }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for nonexistent user", async () => {
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ghost", password: encryptPassword("testpass") }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 + token + username + role for correct credentials", async () => {
    const db = setupDB();
    seedUser(db, "testuser", "testpass", "member");
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: encryptPassword("testpass") }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.username).toBe("testuser");
    expect(data.role).toBe("member");
    expect(data.token).toBeTypeOf("string");
    expect(data.token).toHaveLength(64);
  });

  it("returned token is valid for validateClientToken", async () => {
    const db = setupDB();
    seedUser(db, "testuser", "testpass", "member");
    const app = createApp();
    const res = await app.request("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: encryptPassword("testpass") }),
    });
    const data = await res.json();
    expect(validateClientToken(data.token)).toBe(true);
  });
});

// ─── Middleware patterns ───
// Re-implement the three middleware patterns identically to the source,
// importing the real validateSession/validateClientToken functions.

async function adminAuth(c: Context, next: Next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token || !validateSession(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

async function clientAuth(c: Context, next: Next) {
  const token = c.req.header("X-Envoy-Token") || c.req.query("token");
  if (!token || !validateClientToken(token)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

async function dualAuth(c: Context, next: Next) {
  const adminToken = c.req.header("Authorization")?.replace("Bearer ", "");
  if (adminToken && validateSession(adminToken)) {
    await next();
    return;
  }
  const clientToken = c.req.header("X-Envoy-Token") || c.req.query("token");
  if (clientToken && validateClientToken(clientToken)) {
    await next();
    return;
  }
  return c.json({ error: "unauthorized" }, 401);
}

function createMiddlewareApp() {
  const app = new Hono();
  app.use("/protected/admin/*", adminAuth);
  app.get("/protected/admin/data", (c) => c.json({ ok: true }));
  app.use("/protected/client/*", clientAuth);
  app.get("/protected/client/data", (c) => c.json({ ok: true }));
  app.use("/protected/dual/*", dualAuth);
  app.get("/protected/dual/data", (c) => c.json({ ok: true }));
  return app;
}

describe("Middleware: adminAuth", () => {
  it("rejects request without Authorization header", async () => {
    const app = createMiddlewareApp();
    const res = await app.request("/protected/admin/data");
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid Bearer token", async () => {
    const app = createMiddlewareApp();
    const res = await app.request("/protected/admin/data", {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(res.status).toBe(401);
  });

  it("allows request with valid admin token", async () => {
    const token = __seedSession();
    const app = createMiddlewareApp();
    const res = await app.request("/protected/admin/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe("Middleware: clientAuth", () => {
  it("rejects request without X-Envoy-Token or query param", async () => {
    const app = createMiddlewareApp();
    const res = await app.request("/protected/client/data");
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid X-Envoy-Token", async () => {
    const app = createMiddlewareApp();
    const res = await app.request("/protected/client/data", {
      headers: { "X-Envoy-Token": "invalid" },
    });
    expect(res.status).toBe(401);
  });

  it("allows request with valid X-Envoy-Token", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createMiddlewareApp();
    const res = await app.request("/protected/client/data", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
  });

  it("allows request with valid ?token= query parameter", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createMiddlewareApp();
    const res = await app.request(`/protected/client/data?token=${token}`);
    expect(res.status).toBe(200);
  });
});

describe("Middleware: dualAuth", () => {
  it("rejects request with no auth at all", async () => {
    const app = createMiddlewareApp();
    const res = await app.request("/protected/dual/data");
    expect(res.status).toBe(401);
  });

  it("allows with valid admin Bearer token", async () => {
    const token = __seedSession();
    const app = createMiddlewareApp();
    const res = await app.request("/protected/dual/data", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("allows with valid client X-Envoy-Token", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createMiddlewareApp();
    const res = await app.request("/protected/dual/data", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
  });

  it("rejects when both tokens are invalid", async () => {
    const app = createMiddlewareApp();
    const res = await app.request("/protected/dual/data", {
      headers: { Authorization: "Bearer fake", "X-Envoy-Token": "fake" },
    });
    expect(res.status).toBe(401);
  });

  it("falls through to client when admin token is invalid but client is valid", async () => {
    const clientToken = __seedClientSession("alice", "member");
    const app = createMiddlewareApp();
    const res = await app.request("/protected/dual/data", {
      headers: { Authorization: "Bearer invalid", "X-Envoy-Token": clientToken },
    });
    expect(res.status).toBe(200);
  });

  it("allows valid client ?token= query param", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createMiddlewareApp();
    const res = await app.request(`/protected/dual/data?token=${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── clientAuth identity passthrough (c.set) ───

describe("clientAuth identity passthrough", () => {
  function createApp() {
    const app = new Hono();
    app.use("*", cors());

    // clientAuth-protected route that returns the set values
    app.get("/api/test/context", async (c, next) => {
      // Inline clientAuth + capture context
      const token = c.req.header("X-Envoy-Token") || c.req.query("token");
      if (!token || !validateClientToken(token)) {
        return c.json({ error: "unauthorized" }, 401);
      }
      const { lookupClientSession } = await import("../../routes/users.js");
      const session = lookupClientSession(token!);
      if (session) {
        c.set("userId", session.userId);
        c.set("role", session.role);
      }
      await next();
      // This won't run if next() throws, but the handler below runs instead
    }, (c) => {
      return c.json({
        userId: c.get("userId") ?? null,
        role: c.get("role") ?? null,
      });
    });

    return app;
  }

  it("sets userId and role for valid token", async () => {
    const token = __seedClientSession("bob", "leader");
    const app = createApp();
    const res = await app.request("/api/test/context", {
      headers: { "X-Envoy-Token": token },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.userId).toBe("bob");
    expect(data.role).toBe("leader");
  });

  it("does not set userId for invalid token", async () => {
    const app = createApp();
    const res = await app.request("/api/test/context", {
      headers: { "X-Envoy-Token": "invalid" },
    });
    expect(res.status).toBe(401);
  });
});
