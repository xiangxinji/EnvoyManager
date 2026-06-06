import type { Hono } from "hono";
import { randomBytes, createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import sharp from "sharp";
import {
  loadUsers,
  upsertUser,
  deleteUser,
  authenticate,
  hashPassword,
  type UserRecord,
} from "../user-registry.js";
import { getPublicKey, decryptWithPrivateKey } from "../crypto.js";
import { AVATARS_DIR } from "../manager-db.js";
import { adminAuth } from "./middleware.js";

const clientSessions = new Map<string, { userId: string; role: string; createdAt: number }>();
const SESSION_TTL = 24 * 60 * 60 * 1000;

/** @internal Reset client sessions for testing */
export function __clearClientSessions() { clientSessions.clear(); }

/** @internal Seed a client session for testing. Returns the token. */
export function __seedClientSession(userId: string, role: string, createdAt?: number): string {
  const token = randomBytes(32).toString("hex");
  clientSessions.set(token, { userId, role, createdAt: createdAt ?? Date.now() });
  return token;
}

export function validateClientToken(token: string): boolean {
  const session = clientSessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    clientSessions.delete(token);
    return false;
  }
  return true;
}

/** Look up a client session by token. Returns userId/role or null if invalid/expired. */
export function lookupClientSession(token: string): { userId: string; role: string } | null {
  const session = clientSessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL) {
    clientSessions.delete(token);
    return null;
  }
  return { userId: session.userId, role: session.role };
}

export default function userRoutes(app: Hono) {
  // ─── Auth middleware for user CRUD (auth endpoints remain public) ───
  app.use("/api/users", adminAuth);
  app.use("/api/users/*", adminAuth);

  app.get("/api/public-key", (c) => {
    return c.json({ key: getPublicKey() });
  });

  app.get("/api/users", async (c) => {
    const users = await loadUsers();
    return c.json(users.map((u) => ({ username: u.username, role: u.role, responsibilities: u.responsibilities ?? "", capabilities: u.capabilities ?? "", nickname: u.nickname ?? null, avatar_url: u.avatar_url ?? null, createdAt: u.createdAt })));
  });

  app.post("/api/users", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string; role?: string; responsibilities?: string; capabilities?: string; nickname?: string }>();
    const username = body.username?.trim();
    const encryptedPassword = body.password;
    const role = body.role === "leader" ? "leader" : "member";
    const responsibilities = body.responsibilities?.trim() ?? "";
    const capabilities = body.capabilities?.trim() ?? "";
    const nickname = body.nickname?.trim() || null;
    if (!username || !encryptedPassword) return c.json({ error: "username and password are required" }, 400);

    const password = decryptWithPrivateKey(encryptedPassword);

    const users = await loadUsers();
    if (users.some((u) => u.username === username)) return c.json({ error: "user already exists" }, 409);

    const hashed = await hashPassword(password);
    const created = await upsertUser({ username, password: hashed, role, responsibilities, capabilities, nickname, avatar_url: null });
    console.log(`[user-created] ${username} (${role})`);
    return c.json({ username, role, responsibilities, capabilities, nickname, createdAt: created.createdAt }, 201);
  });

  app.patch("/api/users/:username", async (c) => {
    const username = c.req.param("username");
    const body = await c.req.json<{ responsibilities?: string; capabilities?: string; nickname?: string | null }>();
    const users = await loadUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return c.json({ error: "user not found" }, 404);

    const responsibilities = body.responsibilities !== undefined ? body.responsibilities.trim() : user.responsibilities;
    const capabilities = body.capabilities !== undefined ? body.capabilities.trim() : user.capabilities;
    const nickname = body.nickname !== undefined ? (body.nickname?.trim() || null) : user.nickname;
    await upsertUser({ username, password: user.password, role: user.role, responsibilities, capabilities, nickname, avatar_url: user.avatar_url, createdAt: user.createdAt });

    return c.json({ ok: true, responsibilities, capabilities, nickname });
  });

  // ─── Avatar upload ───

  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

  app.post("/api/users/:username/avatar", async (c) => {
    const username = c.req.param("username");
    const users = await loadUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return c.json({ error: "User not found" }, 404);

    const body = await c.req.parseBody();
    const file = body["avatar"];
    if (!file || !(file instanceof File)) return c.json({ error: "No file uploaded" }, 400);

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return c.json({ error: "Only image files are allowed" }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: "File too large (max 10MB)" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Compute hash of original file content for deduplication
    const contentHash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const destPath = join(AVATARS_DIR, `${contentHash}.webp`);

    // If avatar with same hash already exists, skip writing
    if (!existsSync(destPath)) {
      await sharp(buffer)
        .resize(512, 512, { fit: "cover" })
        .webp({ quality: 80 })
        .toFile(destPath);
    }

    // Delete old avatar file if it differs from the new one
    const oldAvatarUrl = user.avatar_url;
    if (oldAvatarUrl) {
      const oldMatch = oldAvatarUrl.match(/^\/avatars\/(.+\.webp)$/);
      if (oldMatch) {
        const oldFileName = oldMatch[1];
        if (oldFileName !== `${contentHash}.webp`) {
          const oldPath = join(AVATARS_DIR, oldFileName);
          try { unlinkSync(oldPath); } catch { /* ignore */ }
        }
      }
    }

    const avatarUrl = `/avatars/${contentHash}.webp`;
    await upsertUser({ username, password: user.password, role: user.role, responsibilities: user.responsibilities, capabilities: user.capabilities, nickname: user.nickname, avatar_url: avatarUrl, createdAt: user.createdAt });

    return c.json({ avatar_url: avatarUrl });
  });

  // ─── Profile batch query ───

  app.get("/api/users/profiles", async (c) => {
    const namesParam = c.req.query("names") ?? "";
    const names = namesParam ? namesParam.split(",").map((n) => n.trim()).filter(Boolean) : [];
    if (names.length === 0) return c.json([]);

    const users = await loadUsers();
    const result = users
      .filter((u) => names.includes(u.username))
      .map((u) => ({ username: u.username, nickname: u.nickname ?? null, avatar_url: u.avatar_url ?? null, responsibilities: u.responsibilities ?? "", capabilities: u.capabilities ?? "" }));
    return c.json(result);
  });

  // ─── Profile update ───

  app.patch("/api/users/:username/profile", async (c) => {
    const username = c.req.param("username");
    const body = await c.req.json<{ nickname?: string | null; responsibilities?: string; capabilities?: string }>();
    const users = await loadUsers();
    const user = users.find((u) => u.username === username);
    if (!user) return c.json({ error: "user not found" }, 404);

    const nickname = body.nickname !== undefined ? (body.nickname?.trim() || null) : user.nickname;
    const responsibilities = body.responsibilities !== undefined ? body.responsibilities.trim() : user.responsibilities;
    const capabilities = body.capabilities !== undefined ? body.capabilities.trim() : user.capabilities;
    await upsertUser({ username, password: user.password, role: user.role, responsibilities, capabilities, nickname, avatar_url: user.avatar_url, createdAt: user.createdAt });

    return c.json({ ok: true, nickname, avatar_url: user.avatar_url ?? null, responsibilities, capabilities });
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

  // Verify password without creating a session (used for unlock)
  app.post("/api/auth/verify", async (c) => {
    const body = await c.req.json<{ username?: string; password?: string }>();
    const username = body.username?.trim();
    const encryptedPassword = body.password;
    if (!username || !encryptedPassword) return c.json({ error: "username and password are required" }, 400);

    const password = decryptWithPrivateKey(encryptedPassword);
    const user = await authenticate(username, password);
    if (!user) return c.json({ error: "invalid credentials" }, 401);

    return c.json({ ok: true });
  });
}
