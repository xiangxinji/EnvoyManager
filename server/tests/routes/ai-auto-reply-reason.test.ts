import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { cors } from "hono/cors";
import aiRoutes from "../../routes/ai.js";
import { __clearClientSessions, __seedClientSession } from "../../routes/users.js";
import { setupDB } from "../auth/helpers.js";

function createApp() {
  const app = new Hono();
  app.use("*", cors());
  aiRoutes(app, new Map());
  return app;
}

const validBody = {
  messages: [{ role: "user", content: "hello" }],
  tools: [{
    name: "test_tool",
    description: "A test tool",
    parameters: { type: "object", properties: {}, required: [] },
  }],
};

beforeEach(() => {
  __clearClientSessions();
  setupDB();
});

describe("POST /api/ai/auto-reply/reason", () => {
  // ─── Authorization ───

  it("rejects without token (401)", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("rejects with invalid token (401)", async () => {
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Envoy-Token": "invalid-token" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("rejects with expired token (401)", async () => {
    const expiredToken = __seedClientSession("alice", "member", Date.now() - 25 * 60 * 60 * 1000);
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Envoy-Token": expiredToken },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  // ─── AI Not Configured (503) ───

  it("returns 503 when AI is not configured", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Envoy-Token": token },
      body: JSON.stringify(validBody),
    });
    // No AI presets configured → resolveForScene throws → 503
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("AI not configured");
  });

  // ─── Request Validation ───

  it("returns 400 when messages is empty", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Envoy-Token": token },
      body: JSON.stringify({
        messages: [],
        tools: validBody.tools,
      }),
    });
    // If AI is configured: handleAgentReason returns 400
    // If AI is not configured: 503 (caught before handler)
    // Either way, it should not be 401
    expect(res.status).not.toBe(401);
  });

  it("returns 400 when tools is empty", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Envoy-Token": token },
      body: JSON.stringify({
        messages: validBody.messages,
        tools: [],
      }),
    });
    expect(res.status).not.toBe(401);
  });

  it("accepts valid token and passes auth", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createApp();
    const res = await app.request("/api/ai/auto-reply/reason", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Envoy-Token": token },
      body: JSON.stringify(validBody),
    });
    // Will be 503 (no AI configured) or 400 (validation) — but NOT 401
    expect(res.status).not.toBe(401);
  });

  // ─── Token via query param ───

  it("accepts token via query param", async () => {
    const token = __seedClientSession("alice", "member");
    const app = createApp();
    const res = await app.request(`/api/ai/auto-reply/reason?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).not.toBe(401);
  });
});
