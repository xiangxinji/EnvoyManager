import type { Hono } from "hono";
import type { Team } from "../../../envoy/packages/teams/team.js";
import { mkdir, writeFile, readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { getResourcesDir, getTaskDir } from "../team-registry.js";

import { randomUUID } from "node:crypto";

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50MB

export default function messageRoutes(app: Hono, teams: Map<string, Team>) {
  // Upload message attachment
  app.post("/api/messages/attachments", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > MAX_ATTACHMENT_SIZE) {
      return c.json({ error: "File too large, max 50MB" }, 413);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_ATTACHMENT_SIZE) {
      return c.json({ error: "File too large, max 50MB" }, 413);
    }

    // Build storage path: ~/.envoy/attachments/{team}/{YYYY-MM-DD}/{uuid}.{ext}
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const ext = file.name.includes(".") ? file.name.split(".").pop()! : "bin";
    const uuid = randomUUID();
    const storedName = `${uuid}.${ext}`;
    const dir = join(home, ".envoy", "attachments", teamName, dateStr);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, storedName), buffer);

    const mimeType = file.type || "application/octet-stream";
    const attachmentType = mimeType.startsWith("image/") ? "image" : "file";
    const url = `/api/messages/attachments/${teamName}/${dateStr}/${storedName}`;

    return c.json({
      type: attachmentType,
      url,
      name: file.name,
      size: buffer.length,
      mimeType,
    });
  });

  // Download message attachment
  app.get("/api/messages/attachments/:team/:date/:file", async (c) => {
    const teamName = c.req.param("team");
    const dateDir = c.req.param("date");
    const filename = basename(c.req.param("file"));
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const filePath = join(home, ".envoy", "attachments", teamName, dateDir, filename);

    try {
      const data = await readFile(filePath);
      // Simple MIME detection from extension
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
        webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
        zip: "application/zip", txt: "text/plain", json: "application/json",
        log: "text/plain", csv: "text/csv",
      };
      const contentType = mimeMap[ext] ?? "application/octet-stream";
      const disposition = contentType.startsWith("image/") ? "inline" : "attachment";
      return new Response(data, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `${disposition}; filename="${filename}"`,
        },
      });
    } catch {
      return c.json({ error: "file not found" }, 404);
    }
  });

  app.post("/api/messages", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{ from?: string; to?: string; text?: string; attachments?: unknown[] }>();
    if (!body.from || !body.to || !body.text) {
      return c.json({ error: "from, to, text are required" }, 400);
    }

    const payload: Record<string, unknown> = { text: body.text };
    if (body.attachments) payload.attachments = body.attachments;

    team.innerServer.relay(body.from, body.to, "chat", payload);
    return c.json({ ok: true });
  });

  app.post("/api/tasks", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const body = await c.req.json<{
      from?: string;
      content?: string;
      subscribe?: string[];
      mode?: "serial" | "parallel";
    }>();
    if (!body.from || !body.content || !body.subscribe) {
      return c.json({ error: "from, content, subscribe are required" }, 400);
    }

    const taskId = team.innerServer.submitFrom(body.from, {
      content: body.content,
      subscribe: body.subscribe,
      mode: body.mode ?? "serial",
    });
    return c.json({ ok: true, taskId });
  });

  app.post("/api/tasks/:id/result", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");
    const body = await c.req.json<{
      from?: string;
      success?: boolean;
      data?: unknown;
      error?: string;
      trace?: unknown[];
    }>();
    if (!body.from || body.success === undefined) {
      return c.json({ error: "from, success are required" }, 400);
    }

    // Add execution-trace to task before receiveResult, so the notification includes both
    if (body.trace && Array.isArray(body.trace) && body.trace.length > 0) {
      team.innerServer.addResourceToTask(taskId, "execution-trace", body.from!, { steps: body.trace }, false);
    }

    team.innerServer.receiveResult(body.from, taskId, body.success, body.data, body.error);

    // Persist result to disk
    try {
      const resDir = getResourcesDir(teamName, taskId);
      await mkdir(resDir, { recursive: true });
      await writeFile(
        join(resDir, `${body.from}.json`),
        JSON.stringify({ success: body.success, data: body.data, error: body.error, timestamp: Date.now() }, null, 2),
        "utf-8"
      );
    } catch (e) {
      console.error(`[persist] failed to write result for task ${taskId}:`, e);
    }

    return c.json({ ok: true });
  });

  app.post("/api/tasks/:id/resources", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");
    const resDir = getResourcesDir(teamName, taskId);
    await mkdir(resDir, { recursive: true });

    const formData = await c.req.formData();
    const file = formData.get("file");
    const from = formData.get("from") as string | null;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = join(resDir, file.name);
    await writeFile(filePath, buffer);

    // Register file-resource in task resources (deduplicate by filename)
    if (from) {
      const task = team.innerServer.getTask(taskId);
      const alreadyExists = task?.resources.some(
        (r) => r.type === "file-resource" && (r.data as any)?.filename === file.name
      );
      if (!alreadyExists) {
        team.innerServer.addResourceToTask(taskId, "file-resource", from, {
          filename: file.name,
          size: buffer.length,
          uploadedAt: Date.now(),
        });
      }
    }

    const relativePath = `resources/${file.name}`;
    return c.json({ ok: true, path: relativePath });
  });

  // List resources for a task
  app.get("/api/tasks/:id/resources", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");
    const resDir = getResourcesDir(teamName, taskId);

    try {
      const entries = await readdir(resDir, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((e) => e.isFile())
          .map(async (e) => {
            const fullPath = join(resDir, e.name);
            const s = await stat(fullPath);
            return {
              filename: e.name,
              size: s.size,
              uploadedAt: s.mtimeMs,
              path: `resources/${e.name}`,
            };
          })
      );
      return c.json({ files });
    } catch {
      return c.json({ files: [] });
    }
  });

  // Download a specific resource file
  app.get("/api/tasks/:id/resources/:file", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");
    const filename = basename(c.req.param("file"));
    const filePath = join(getResourcesDir(teamName, taskId), filename);

    try {
      const data = await readFile(filePath);
      return new Response(data, {
        headers: {
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": "application/octet-stream",
        },
      });
    } catch {
      return c.json({ error: "file not found" }, 404);
    }
  });

  // Manual start: pending → running
  app.post("/api/tasks/:id/start", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");
    const body = await c.req.json<{ from?: string }>();
    if (!body.from) return c.json({ error: "from is required" }, 400);

    const task = team.innerServer.getTask(taskId);
    if (!task) return c.json({ error: "task not found" }, 404);
    if (task.status !== "pending") return c.json({ error: `task status is '${task.status}', expected 'pending'` }, 400);

    const updated = team.innerServer.startTask(taskId);
    return c.json({ ok: true, task: updated });
  });

  // Manual complete: running → completed
  app.post("/api/tasks/:id/complete", async (c) => {
    const teamName = c.req.header("team");
    if (!teamName) return c.json({ error: "team header is required" }, 400);

    const team = teams.get(teamName);
    if (!team) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");
    const body = await c.req.json<{ from?: string; data?: unknown }>();
    if (!body.from) return c.json({ error: "from is required" }, 400);

    const task = team.innerServer.getTask(taskId);
    if (!task) return c.json({ error: "task not found" }, 404);
    if (task.status !== "running") return c.json({ error: `task status is '${task.status}', expected 'running'` }, 400);

    const updated = team.innerServer.manualCompleteTask(taskId, body.from, body.data);
    return c.json({ ok: true, task: updated });
  });
}
