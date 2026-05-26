import type { Hono, Context, Next } from "hono";
import type { Team } from "../../../envoy/packages/teams/team.js";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getCloudDir, loadMeta } from "../team-registry.js";
import { validateSession } from "./admin.js";
import { validateClientToken } from "./users.js";
import {
  insertCloudFile,
  getCloudFileById,
  queryCloudDir,
  findCloudFile,
  deleteCloudFile,
  deleteCloudDirRecursive,
  getCloudStats,
  searchCloudFiles,
  validateCloudIds,
  buildCloudPath,
  getCloudBreadcrumb,
  type CloudFileRecord,
} from "../db.js";

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

function resolveFilesystemPath(teamName: string, relativePath: string): string {
  const cloudRoot = resolve(getCloudDir(teamName));
  const target = resolve(cloudRoot, ...relativePath.split("/"));
  if (!target.startsWith(cloudRoot + sep) && target !== cloudRoot) {
    throw new Error("invalid path");
  }
  return target;
}

export default function cloudRoutes(app: Hono, teams: Map<string, Team>) {
  app.use("/api/cloud/*", dualAuth);

  async function ensureLeader(teamName: string, username: string): Promise<boolean> {
    const meta = await loadMeta(teamName);
    return meta?.leader === username;
  }

  function toFileItem(item: CloudFileRecord) {
    return {
      id: item.id,
      name: item.name,
      parentId: item.parent_id,
      type: item.type,
      size: item.size,
      uploadedBy: item.uploaded_by,
      createdAt: item.created_at,
    };
  }

  // ─── List directory ────────────────────────────────────────

  app.get("/api/cloud/files", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const parentId = c.req.query("parentId") || null;
    const items = queryCloudDir(teamName, parentId);

    let dirId: string | null = null;
    let dirParentId: string | null = null;
    let dirName = "";

    if (parentId) {
      const dir = getCloudFileById(teamName, parentId);
      if (dir && dir.type === "directory") {
        dirId = dir.id;
        dirParentId = dir.parent_id;
        dirName = dir.name;
      }
    }

    return c.json({
      id: dirId,
      parentId: dirParentId,
      name: dirName,
      items: items.map(toFileItem),
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
    const parentId = (formData.get("parentId") as string | null) || null;
    const uploadedBy = formData.get("uploadedBy") as string | null;

    if (!file || !(file instanceof File)) return c.json({ error: "file is required" }, 400);
    if (!uploadedBy) return c.json({ error: "uploadedBy is required" }, 400);

    const filename = file.name;

    // Check duplicate
    const existing = findCloudFile(teamName, parentId, filename);
    if (existing) return c.json({ error: "file already exists" }, 409);

    // Build filesystem path from parent chain
    let relativeDir: string;
    if (parentId) {
      const parentRecord = getCloudFileById(teamName, parentId);
      if (!parentRecord || parentRecord.type !== "directory") {
        return c.json({ error: "parent directory not found" }, 404);
      }
      relativeDir = buildCloudPath(teamName, parentId);
    } else {
      relativeDir = "";
    }

    const cloudDir = getCloudDir(teamName);
    const targetDir = relativeDir ? join(cloudDir, ...relativeDir.split("/")) : cloudDir;
    await mkdir(targetDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(targetDir, filename), buffer);

    const record = insertCloudFile(teamName, {
      name: filename,
      parent_id: parentId,
      type: "file",
      size: buffer.length,
      uploaded_by: uploadedBy,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    return c.json({
      ok: true,
      item: toFileItem(record),
    });
  });

  // ─── Download file ─────────────────────────────────────────

  app.get("/api/cloud/files/:id/download", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const id = c.req.param("id");
    const record = getCloudFileById(teamName, id);
    if (!record || record.type !== "file") {
      return c.json({ error: "file not found" }, 404);
    }

    const relativePath = buildCloudPath(teamName, id);
    const fullPath = join(getCloudDir(teamName), ...relativePath.split("/"));

    try {
      const data = await readFile(fullPath);
      const ext = record.name.split(".").pop()?.toLowerCase() ?? "";
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
          "Content-Disposition": `attachment; filename="${record.name}"`,
        },
      });
    } catch {
      return c.json({ error: "file not found on disk" }, 404);
    }
  });

  // ─── Create directory ──────────────────────────────────────

  app.post("/api/cloud/directories", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{ name?: string; parentId?: string | null; createdBy?: string }>();
    if (!body.name) return c.json({ error: "name is required" }, 400);
    if (!body.createdBy) return c.json({ error: "createdBy is required" }, 400);

    const parentId = body.parentId || null;

    // Check duplicate
    const existing = findCloudFile(teamName, parentId, body.name);
    if (existing) return c.json({ error: "directory already exists" }, 409);

    // Build filesystem path
    let relativeDir: string;
    if (parentId) {
      const parentRecord = getCloudFileById(teamName, parentId);
      if (!parentRecord || parentRecord.type !== "directory") {
        return c.json({ error: "parent directory not found" }, 404);
      }
      relativeDir = buildCloudPath(teamName, parentId);
    } else {
      relativeDir = "";
    }

    const fullPath = relativeDir
      ? join(getCloudDir(teamName), ...relativeDir.split("/"), body.name)
      : join(getCloudDir(teamName), body.name);
    await mkdir(fullPath, { recursive: true });

    const record = insertCloudFile(teamName, {
      name: body.name,
      parent_id: parentId,
      type: "directory",
      size: 0,
      uploaded_by: body.createdBy,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    return c.json({
      ok: true,
      item: toFileItem(record),
    });
  });

  // ─── Delete file or directory ──────────────────────────────

  app.delete("/api/cloud/files/:id", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const id = c.req.param("id");
    const username = c.req.query("from");

    // Admin requests bypass the leader check
    const isAdmin = !!validateSession(c.req.header("Authorization")?.replace("Bearer ", "") ?? "");
    if (!isAdmin) {
      if (!username) return c.json({ error: "from is required" }, 400);
      const isLeader = await ensureLeader(teamName, username);
      if (!isLeader) {
        return c.json({ error: "only leader can delete" }, 403);
      }
    }

    const record = getCloudFileById(teamName, id);
    if (!record) return c.json({ error: "not found" }, 404);

    const relativePath = buildCloudPath(teamName, id);
    const fullPath = join(getCloudDir(teamName), ...relativePath.split("/"));

    if (record.type === "directory") {
      // Delete directory from filesystem
      try {
        await rm(fullPath, { recursive: true, force: true });
      } catch {
        // Directory may not exist on disk but exists in DB
      }
      // Delete from DB (self + all children)
      deleteCloudDirRecursive(teamName, id);
    } else {
      // Delete file from filesystem
      try {
        await rm(fullPath, { force: true });
      } catch {
        // File may not exist on disk
      }
      // Delete from DB
      deleteCloudFile(teamName, id);
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
      id: item.id,
      name: item.name,
      displayPath: buildCloudPath(teamName, item.id),
      type: item.type,
      size: item.size,
    })));
  });

  // ─── Validate IDs ─────────────────────────────────────────

  app.post("/api/cloud/validate", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{ ids?: string[] }>();
    if (!body.ids || !Array.isArray(body.ids)) {
      return c.json({ error: "ids array is required" }, 400);
    }
    if (body.ids.length > 100) {
      return c.json({ error: "too many ids (max 100)" }, 400);
    }

    return c.json(validateCloudIds(teamName, body.ids));
  });

  // ─── Breadcrumb ───────────────────────────────────────────

  app.get("/api/cloud/breadcrumb", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const id = c.req.query("id");
    if (!id) return c.json([]);

    return c.json(getCloudBreadcrumb(teamName, id));
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
