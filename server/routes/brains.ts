import type { Hono, Context, Next } from "hono";
import type { Team } from "../../../envoy/packages/teams/team.js";
import { validateClientToken } from "./users.js";
import { validateSession } from "./admin.js";
import { mkdir, writeFile, readFile, rename, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, sep } from "node:path";

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

const META_FILE = "_meta.json";

interface FileEntry {
  mtime_ms: number;
  size: number;
}

type FileMeta = Record<string, FileEntry>;

async function loadMeta(userDir: string): Promise<FileMeta> {
  try {
    const raw = await readFile(join(userDir, META_FILE), "utf-8");
    return JSON.parse(raw) as FileMeta;
  } catch {
    return {};
  }
}

async function saveMeta(userDir: string, meta: FileMeta): Promise<void> {
  await mkdir(userDir, { recursive: true });
  await writeFile(join(userDir, META_FILE), JSON.stringify(meta, null, 2), "utf-8");
}

export default function brainsRoutes(app: Hono, teams: Map<string, Team>) {
  function resolveBrainsPath(teamName: string, username: string, ...segments: string[]): string {
    const brainsRoot = resolve(join(process.env.HOME || "", ".envoy", "teams", teamName, "brains"));
    const userDir = resolve(brainsRoot, username);
    const target = segments.length > 0 ? resolve(userDir, ...segments) : userDir;
    if (!target.startsWith(userDir + sep) && target !== userDir) {
      throw new Error("invalid path");
    }
    return target;
  }

  function getBrainsDir(teamName: string, username: string): string {
    return resolveBrainsPath(teamName, username);
  }

  // ─── POST /api/brains/sync — Batch upsert ───────────────────

  app.post("/api/brains/sync", dualAuth, async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);
    if (!teams.has(teamName)) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{
      username?: string;
      files?: Array<{ path: string; content: string; mtime_ms?: number; size?: number }>;
    }>();
    if (!body.username) return c.json({ error: "username is required" }, 400);
    if (!Array.isArray(body.files)) return c.json({ error: "files array is required" }, 400);

    const userDir = getBrainsDir(teamName, body.username);
    await mkdir(userDir, { recursive: true });
    const meta = await loadMeta(userDir);

    let synced = 0;
    for (const file of body.files) {
      if (!file.path || typeof file.content !== "string") continue;

      try {
        resolveBrainsPath(teamName, body.username, file.path);
      } catch {
        continue;
      }

      const fullPath = join(userDir, file.path);
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      const decoded = Buffer.from(file.content, "base64");
      await writeFile(fullPath, decoded);

      // Store client fingerprint in meta
      meta[file.path] = {
        mtime_ms: file.mtime_ms ?? 0,
        size: file.size ?? decoded.length,
      };
      synced++;
    }

    await saveMeta(userDir, meta);
    return c.json({ ok: true, synced });
  });

  // ─── GET /api/brains/files — List files ───────────────────────

  app.get("/api/brains/files", dualAuth, async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);
    if (!teams.has(teamName)) return c.json({ error: "team not found" }, 404);

    const username = c.req.query("username");
    if (!username) return c.json({ error: "username is required" }, 400);

    const includeBackups = c.req.query("includeBackups") === "true";
    const userDir = getBrainsDir(teamName, username);

    // For sync: return fingerprints from _meta.json (no filesystem scan)
    if (!includeBackups) {
      const meta = await loadMeta(userDir);
      const files = Object.entries(meta).map(([path, entry]) => ({
        path,
        mtime_ms: entry.mtime_ms,
        size: entry.size,
      }));
      return c.json({ files });
    }

    // For restore: scan actual filesystem (including backups)
    const files: Array<{ path: string; mtime_ms: number; size: number }> = [];
    async function scanDir(dir: string, prefix: string): Promise<void> {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name === META_FILE) continue;
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath, relativePath);
        } else {
          const s = await stat(fullPath);
          files.push({ path: relativePath, mtime_ms: Math.floor(s.mtimeMs), size: s.size });
        }
      }
    }

    await scanDir(userDir, "");
    return c.json({ files });
  });

  // ─── GET /api/brains/download/* — Download file ──────────────

  app.get("/api/brains/download/*", dualAuth, async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);
    if (!teams.has(teamName)) return c.json({ error: "team not found" }, 404);

    const username = c.req.query("username");
    if (!username) return c.json({ error: "username is required" }, 400);

    const reqPath = c.req.path;
    const prefix = "/api/brains/download/";
    const filePath = reqPath.startsWith(prefix) ? reqPath.slice(prefix.length) : "";
    if (!filePath) return c.json({ error: "path is required" }, 400);

    try {
      resolveBrainsPath(teamName, username, filePath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const userDir = getBrainsDir(teamName, username);
    const fullPath = join(userDir, filePath);
    try {
      const data = await readFile(fullPath);
      return new Response(data, {
        headers: { "Content-Type": "application/octet-stream" },
      });
    } catch {
      return c.json({ error: "file not found" }, 404);
    }
  });

  // ─── POST /api/brains/rename — Server-side rename ────────────

  app.post("/api/brains/rename", dualAuth, async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);
    if (!teams.has(teamName)) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{ username?: string; path?: string; newPath?: string }>();
    if (!body.username) return c.json({ error: "username is required" }, 400);
    if (!body.path || !body.newPath) return c.json({ error: "path and newPath are required" }, 400);

    try {
      resolveBrainsPath(teamName, body.username, body.path);
      resolveBrainsPath(teamName, body.username, body.newPath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const userDir = getBrainsDir(teamName, body.username);
    const oldFullPath = join(userDir, body.path);
    const newFullPath = join(userDir, body.newPath);

    try {
      await mkdir(dirname(newFullPath), { recursive: true });
      await rename(oldFullPath, newFullPath);
    } catch {
      // File may not exist on server yet
    }

    // Remove from meta
    const meta = await loadMeta(userDir);
    delete meta[body.path];
    await saveMeta(userDir, meta);

    return c.json({ ok: true });
  });

  // ─── GET /api/brains/stats — Per-user brains stats (admin) ────

  app.get("/api/brains/stats", dualAuth, async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);
    if (!teams.has(teamName)) return c.json({ error: "team not found" }, 404);

    const brainsRoot = resolve(join(process.env.HOME || "", ".envoy", "teams", teamName, "brains"));
    const byUser: Array<{ user: string; fileCount: number; totalSize: number }> = [];
    let totalFiles = 0;
    let totalSize = 0;

    let entries;
    try {
      entries = await readdir(brainsRoot, { withFileTypes: true });
    } catch {
      return c.json({ totalFiles: 0, totalSize: 0, byUser: [] });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const userDir = resolve(brainsRoot, entry.name);
      const meta = await loadMeta(userDir);
      let userFiles = 0;
      let userSize = 0;
      for (const info of Object.values(meta)) {
        userFiles++;
        userSize += info.size;
      }
      totalFiles += userFiles;
      totalSize += userSize;
      if (userFiles > 0) {
        byUser.push({ user: entry.name, fileCount: userFiles, totalSize: userSize });
      }
    }

    return c.json({ totalFiles, totalSize, byUser });
  });
}
