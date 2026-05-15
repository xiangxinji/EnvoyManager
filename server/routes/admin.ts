import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { verifyAdmin, updateAdmin, getAdminConfig } from "../settings.js";
import { decryptWithPrivateKey } from "../crypto.js";

const sessions = new Map<string, { createdAt: number }>();

export default function adminRoutes(app: Hono) {
  app.post("/api/admin/auth", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();
    const username = body.username?.trim();
    const encryptedPassword = body.password;
    if (!username || !encryptedPassword) return c.json({ error: "username and password are required" }, 400);

    const password = decryptWithPrivateKey(encryptedPassword);
    const valid = await verifyAdmin(username, password);
    if (!valid) return c.json({ error: "invalid credentials" }, 401);

    const token = randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now() });
    return c.json({ ok: true, token });
  });

  app.post("/api/admin/logout", async (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token) sessions.delete(token);
    return c.json({ ok: true });
  });

  app.get("/api/admin/profile", async (c) => {
    const admin = getAdminConfig();
    return c.json({ username: admin.username });
  });

  app.post("/api/admin/update", async (c) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (!token || !validateSession(token)) return c.json({ error: "unauthorized" }, 401);

    const body = await c.req.json<{ username?: string; password?: string }>();
    const newUsername = body.username?.trim();
    const encryptedPassword = body.password;
    if (!newUsername || !encryptedPassword) return c.json({ error: "username and password are required" }, 400);

    const newPassword = decryptWithPrivateKey(encryptedPassword);
    await updateAdmin(newUsername, newPassword);

    // Invalidate all sessions after credential change
    sessions.clear();
    return c.json({ ok: true });
  });
}

export function validateSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  // 24h expiry
  if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return false;
  }
  return true;
}
