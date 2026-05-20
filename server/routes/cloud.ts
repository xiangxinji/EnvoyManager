import type { Hono } from "hono";
import type { Team } from "../../../envoy/packages/teams/team.js";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, basename, resolve, dirname, sep } from "node:path";
import { getCloudDir, loadMeta } from "../team-registry.js";
import {
  insertCloudFile,
  queryCloudDir,
  findCloudFile,
  deleteCloudFile,
  deleteCloudDirRecursive,
  getCloudStats,
  searchCloudFiles,
  validateCloudPaths,
  type CloudFileRecord,
} from "../db.js";

export default function cloudRoutes(app: Hono, teams: Map<string, Team>) {
  // ─── Path safety helper ────────────────────────────────────

  function resolveCloudPath(teamName: string, ...segments: string[]): string {
    const cloudRoot = resolve(getCloudDir(teamName));
    const target = resolve(cloudRoot, ...segments);
    if (!target.startsWith(cloudRoot + sep) && target !== cloudRoot) {
      throw new Error("invalid path");
    }
    return target;
  }

  function normalizeDirPath(p: string): string {
    if (!p) return "";
    // Ensure trailing slash for directory paths
    return p.endsWith("/") ? p : p + "/";
  }

  async function ensureLeader(teamName: string, username: string): Promise<boolean> {
    const meta = await loadMeta(teamName);
    return meta?.leader === username;
  }

  // ─── List directory ────────────────────────────────────────

  app.get("/api/cloud/files", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const rawPath = c.req.query("path") ?? "";
    try {
      resolveCloudPath(teamName, rawPath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const dirPath = normalizeDirPath(rawPath);
    const items = queryCloudDir(teamName, dirPath);

    return c.json({
      path: dirPath,
      items: items.map((item: CloudFileRecord) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        size: item.size,
        uploadedBy: item.uploaded_by,
        createdAt: item.created_at,
      })),
    });
  });

  // ─── Upload file ───────────────────────────────────────────

  app.post("/api/cloud/files", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("file");
    const rawPath = (formData.get("path") as string | null) ?? "";
    const uploadedBy = formData.get("uploadedBy") as string | null;

    if (!file || !(file instanceof File)) return c.json({ error: "file is required" }, 400);
    if (!uploadedBy) return c.json({ error: "uploadedBy is required" }, 400);

    try {
      resolveCloudPath(teamName, rawPath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const dirPath = normalizeDirPath(rawPath);
    const filename = basename(file.name);

    // Check duplicate
    const existing = findCloudFile(teamName, dirPath, filename);
    if (existing) return c.json({ error: "file already exists" }, 409);

    const cloudDir = getCloudDir(teamName);
    const targetDir = join(cloudDir, dirPath);
    await mkdir(targetDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(targetDir, filename), buffer);

    const record = insertCloudFile(teamName, {
      name: filename,
      path: dirPath,
      type: "file",
      size: buffer.length,
      uploaded_by: uploadedBy,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    return c.json({
      ok: true,
      item: {
        id: record.id,
        name: record.name,
        size: record.size,
        uploadedBy: record.uploaded_by,
        createdAt: record.created_at,
      },
    });
  });

  // ─── Download file ─────────────────────────────────────────

  app.get("/api/cloud/download/*", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    // c.req.path is "/api/cloud/download/some/path/file.txt"
    // extract the part after "/api/cloud/download/"
    const reqPath = c.req.path;
    const prefix = "/api/cloud/download/";
    const filePath = reqPath.startsWith(prefix) ? reqPath.slice(prefix.length) : "";
    if (!filePath) return c.json({ error: "path is required" }, 400);

    const filename = basename(filePath);
    try {
      resolveCloudPath(teamName, filePath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const fullPath = join(getCloudDir(teamName), filePath);
    try {
      const data = await readFile(fullPath);
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
        zip: "application/zip", txt: "text/plain", json: "application/json",
        log: "text/plain", csv: "text/csv",
      };
      const contentType = mimeMap[ext] ?? "application/octet-stream";
      return new Response(data, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch {
      return c.json({ error: "file not found" }, 404);
    }
  });

  // ─── Create directory ──────────────────────────────────────

  app.post("/api/cloud/directories", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{ name?: string; path?: string; createdBy?: string }>();
    if (!body.name) return c.json({ error: "name is required" }, 400);
    if (!body.createdBy) return c.json({ error: "createdBy is required" }, 400);

    const rawPath = body.path ?? "";
    try {
      resolveCloudPath(teamName, rawPath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const dirPath = normalizeDirPath(rawPath);

    // Check duplicate
    const existing = findCloudFile(teamName, dirPath, body.name);
    if (existing) return c.json({ error: "directory already exists" }, 409);

    const fullPath = join(getCloudDir(teamName), dirPath, body.name);
    await mkdir(fullPath, { recursive: true });

    const record = insertCloudFile(teamName, {
      name: body.name,
      path: dirPath,
      type: "directory",
      size: 0,
      uploaded_by: body.createdBy,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    return c.json({
      ok: true,
      item: {
        id: record.id,
        name: record.name,
        type: "directory",
        uploadedBy: record.uploaded_by,
        createdAt: record.created_at,
      },
    });
  });

  // ─── Delete file or directory ──────────────────────────────

  app.delete("/api/cloud/files", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const rawPath = c.req.query("path") ?? "";
    const username = c.req.query("from");
    if (!username) return c.json({ error: "from is required" }, 400);

    // Leader check
    const isLeader = await ensureLeader(teamName, username);
    if (!isLeader) {
      return c.json({ error: "only leader can delete" }, 403);
    }

    if (!rawPath) return c.json({ error: "path is required" }, 400);

    try {
      resolveCloudPath(teamName, rawPath);
    } catch {
      return c.json({ error: "invalid path" }, 400);
    }

    const fullPath = join(getCloudDir(teamName), rawPath);

    // Check if it's a directory (ends with /) or file
    const isDir = rawPath.endsWith("/");
    const dirPath = normalizeDirPath(rawPath);

    if (isDir) {
      // Directory: cascade delete
      const dirName = rawPath.replace(/\/$/, "").split("/").pop()!;
      const parentPath = normalizeDirPath(rawPath.replace(/\/$/, "").split("/").slice(0, -1).join("/"));

      // Check exists in DB
      const existing = findCloudFile(teamName, parentPath, dirName);
      if (!existing) {
        return c.json({ error: "directory not found" }, 404);
      }

      // Delete from filesystem
      try {
        await rm(fullPath, { recursive: true, force: true });
      } catch {
        // Directory may not exist on disk but exists in DB
      }

      // Delete from DB (self + all children)
      const deleted = deleteCloudDirRecursive(teamName, dirPath);
      void deleted;
    } else {
      // File: single delete
      const fileDirPath = normalizeDirPath(dirname(rawPath));
      const fileName = basename(rawPath);

      const existing = findCloudFile(teamName, fileDirPath, fileName);
      if (!existing) {
        return c.json({ error: "file not found" }, 404);
      }

      // Delete from filesystem
      try {
        await rm(fullPath, { force: true });
      } catch {
        // File may not exist on disk
      }

      // Delete from DB
      deleteCloudFile(teamName, existing.id);
    }

    return c.json({ ok: true });
  });

  // ─── Search files ──────────────────────────────────────────

  app.get("/api/cloud/search", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const query = c.req.query("q") ?? "";
    if (!query || query.length > 200) return c.json([]);

    const results = searchCloudFiles(teamName, query);
    return c.json(results.map((item: CloudFileRecord) => ({
      name: item.name,
      path: item.path + item.name + (item.type === "directory" ? "/" : ""),
      type: item.type,
      size: item.size,
    })));
  });

  // ─── Validate paths ───────────────────────────────────────

  app.post("/api/cloud/validate", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{ paths?: string[] }>();
    if (!body.paths || !Array.isArray(body.paths)) {
      return c.json({ error: "paths array is required" }, 400);
    }
    if (body.paths.length > 100) {
      return c.json({ error: "too many paths (max 100)" }, 400);
    }

    return c.json(validateCloudPaths(teamName, body.paths));
  });

  // ─── Stats ─────────────────────────────────────────────────

  app.get("/api/cloud/stats", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const stats = getCloudStats(teamName);
    return c.json(stats);
  });
}
