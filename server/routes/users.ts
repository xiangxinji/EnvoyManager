import type { Hono } from "hono";
import { randomBytes } from "node:crypto";
import {
  loadUsers,
  upsertUser,
  deleteUser,
  authenticate,
  hashPassword,
  type UserRecord,
} from "../user-registry.js";
import { getPublicKey, decryptWithPrivateKey } from "../crypto.js";

const clientSessions = new Map<string, { userId: string; role: string; createdAt: number }>();
const SESSION_TTL = 24 * 60 * 60 * 1000;

export function validateClientToken(token: string): boolean {
  const session = clientSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    clientSessions.delete(token);
    return false;
  }
  return true;
}

export default function userRoutes(app: Hono) {
  app.get("/api/public-key", (c) => {
    return c.json({ key: getPublicKey() });
  });

  app.get("/api/users", async (c) => {
    const users = await loadUsers();
    return c.json(users.map((u) => ({ username: u.username, role: u.role, responsibilities: u.responsibilities ?? "", capabilities: u.capabilities ?? "", createdAt: u.createdAt })));
  });

  app.post("/api/users", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string; role?: string; responsibilities?: string; capabilities?: string }>();
    const username = body.username?.trim();
    const encryptedPassword = body.password;
    const role = body.role === "leader" ? "leader" : "member";
    const responsibilities = body.responsibilities?.trim() ?? "";
    const capabilities = body.capabilities?.trim() ?? "";
    if (!username || !encryptedPassword) return c.json({ error: "username and password are required" }, 400);

    const password = decryptWithPrivateKey(encryptedPassword);

    const users = await loadUsers();
    if (users.some((u) => u.username === username)) return c.json({ error: "user already exists" }, 409);

    const hashed = await hashPassword(password);
    const created = await upsertUser({ username, password: hashed, role, responsibilities, capabilities });
    console.log(`[user-created] ${username} (${role})`);
    return c.json({ username, role, responsibilities, capabilities, createdAt: created.createdAt }, 201);
  });

  app.patch("/api/users/:username", async (c) => {
    const username = c.req.param("username");
    const body = await c.req.json<{ responsibilities?: string; capabilities?: string }>();
    const users = await loadUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return c.json({ error: "user not found" }, 404);

    const responsibilities = body.responsibilities !== undefined ? body.responsibilities.trim() : user.responsibilities;
    const capabilities = body.capabilities !== undefined ? body.capabilities.trim() : user.capabilities;
    await upsertUser({ username, password: user.password, role: user.role, responsibilities, capabilities, createdAt: user.createdAt });

    return c.json({ ok: true, responsibilities, capabilities });
  });

  app.delete("/api/users/:username", async (c) => {
    const username = c.req.param("username");
    const removed = deleteUser(username);
    if (!removed) return c.json({ error: "user not found" }, 404);
    console.log(`[user-deleted] ${username}`);
    return c.json({ ok: true });
  });

  app.post("/api/auth", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();
    const username = body.username?.trim();
    const encryptedPassword = body.password;
    if (!username || !encryptedPassword) return c.json({ error: "username and password are required" }, 400);

    const password = decryptWithPrivateKey(encryptedPassword);

    const user = await authenticate(username, password);
    if (!user) return c.json({ error: "invalid credentials" }, 401);

    const token = randomBytes(32).toString("hex");
    clientSessions.set(token, { userId: user.username, role: user.role, createdAt: Date.now() });

    return c.json({ ok: true, username: user.username, role: user.role, token });
  });
}
