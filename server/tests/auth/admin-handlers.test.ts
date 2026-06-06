import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import adminRoutes, { validateSession, __clearSessions, __seedSession } from "../../routes/admin.js";
import { setupDB, encryptPassword, ensureCrypto } from "./helpers.js";

function createApp() {
  const app = new Hono();
  app.use("*", cors());
  adminRoutes(app);
  return app;
}

beforeEach(() => {
  __clearSessions();
  setupDB();
  ensureCrypto();
});

// ─── POST /api/admin/auth (login) ───

describe("POST /api/admin/auth", () => {
  it("returns 400 when username is missing", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: encryptPassword("admin123") }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is missing", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 for wrong username", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "wrong", password: encryptPassword("admin123") }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong password", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: encryptPassword("wrong") }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 + token for correct credentials", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: encryptPassword("admin123") }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.token).toBeTypeOf("string");
    expect(data.token).toHaveLength(64); // randomBytes(32).toString("hex")
  });

  it("returned token is valid for validateSession", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: encryptPassword("admin123") }),
    });
    const data = await res.json();
    expect(validateSession(data.token)).toBe(true);
  });

  it("returns 500 for non-RSA-encrypted password", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "plaintext-not-encrypted" }),
    });
    // decryptWithPrivateKey will throw on invalid ciphertext → 500
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/admin/logout ───

describe("POST /api/admin/logout", () => {
  it("returns 200 even without a token (idempotent)", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/logout", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("invalidates the session token", async () => {
    const app = createApp();
    const token = __seedSession();
    const res = await app.request("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(validateSession(token)).toBe(false);
  });

  it("only invalidates the specified token, not others", async () => {
    const app = createApp();
    const token1 = __seedSession();
    const token2 = __seedSession();
    await app.request("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}` },
    });
    expect(validateSession(token1)).toBe(false);
    expect(validateSession(token2)).toBe(true);
  });
});

// ─── GET /api/admin/profile ───

describe("GET /api/admin/profile", () => {
  it("returns 401 without Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/profile");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/profile", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with expired token", async () => {
    const app = createApp();
    const token = __seedSession(Date.now() - 25 * 60 * 60 * 1000);
    const res = await app.request("/api/admin/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with username for valid token", async () => {
    const app = createApp();
    const token = __seedSession();
    const res = await app.request("/api/admin/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.username).toBe("admin");
  });
});

// ─── POST /api/admin/update ───

describe("POST /api/admin/update", () => {
  it("returns 401 without valid session", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "newadmin", password: encryptPassword("newpass") }),
    });
    expect(res.status).toBe(401);
  });

  it("clears ALL sessions after update", async () => {
    const app = createApp();
    const token1 = __seedSession();
    const token2 = __seedSession();
    const res = await app.request("/api/admin/update", {
      method: "POST",
      headers: { Authorization: `Bearer ${token1}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "newadmin", password: encryptPassword("newpass") }),
    });
    expect(res.status).toBe(200);
    expect(validateSession(token1)).toBe(false);
    expect(validateSession(token2)).toBe(false);
  });
});
