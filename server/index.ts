import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { Team } from "../../envoy/packages/teams/team.js";
import { loadRegistry, ensureTeamsDir, getTeamDir } from "./team-registry.js";
import type { Task } from "../../envoy/packages/core/task.js";
import teamRoutes from "./routes/teams.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import adminRoutes from "./routes/admin.js";
import aiRoutes from "./routes/ai.js";
import messageRoutes from "./routes/messages.js";
import cloudRoutes from "./routes/cloud.js";
import brainsRoutes from "./routes/brains.js";
import glossaryRoutes from "./routes/glossary.js";
import { initCrypto } from "./crypto.js";
import { initManagerDB, AVATARS_DIR } from "./manager-db.js";
import { initTeamDatabase, insertMessage, upsertTask, queryActiveTasks } from "./db.js";
import { managerPort, teamHost } from "./config.js";

const app = new Hono();
// Allow all origins — self-hosted manager, actual security is via auth tokens
app.use("*", cors());

const teamInstances = new Map<string, Team>();

// Initialize Manager DB before anything else
initManagerDB();

// Initialize RSA key pair
initCrypto();

async function restoreTeams(): Promise<void> {
  const records = await loadRegistry();
  for (const rec of records) {
    const team = new Team({ port: rec.port, host: teamHost });
    await team.start();
    teamInstances.set(rec.name, team);
    initTeamDatabase(getTeamDir(rec.name));
    setupTaskPersistence(rec.name, team);
    restoreActiveTasks(rec.name, team);
    console.log(`[restored] team "${rec.name}" on port ${rec.port}`);
  }
}

function setupTaskPersistence(teamName: string, team: Team): void {
  const server = team.innerServer;

  server.on("task:created", (task: Task) => persistTask(teamName, task, server));
  server.on("task:updated", (task: Task) => persistTask(teamName, task, server));
  server.on("task:completed", (task: Task) => persistTask(teamName, task, server));
  server.on("task:failed", (task: Task) => persistTask(teamName, task, server));
}

async function persistTask(teamName: string, task: Task, server: { getTaskState(id: string): { serialIndex: number; pendingClients: string[]; leaderReviewing: boolean; retryCount: number } | null }): Promise<void> {
  const state = server.getTaskState(task.id);
  try {
    upsertTask(teamName, task, state);
  } catch (e) {
    console.error(`[persist] failed to upsert task ${task.id}:`, e);
  }

  // Persist task message to SQLite for chat history sync
  try {
    for (const subscriber of task.subscribe) {
      insertMessage(teamName, {
        type: "task",
        subtype: `task:${task.status}`,
        from_user: task.createBy,
        to_user: subscriber,
        content: task.content,
        extra: {
          taskId: task.id,
          status: task.status,
          subscribe: task.subscribe,
          resources: task.resources,
        },
      });
    }
  } catch (e) {
    console.error(`[persist] failed to insert task message for ${task.id}:`, e);
  }
}

function restoreActiveTasks(teamName: string, team: Team): void {
  const server = team.innerServer;
  const active = queryActiveTasks(teamName);
  if (active.length === 0) return;

  const entries = active.map((row) => ({
    task: {
      id: row.id,
      createBy: row.createBy,
      subscribe: row.subscribe,
      content: row.content,
      mode: row.mode,
      status: row.status,
      resources: row.resources,
      createdAt: row.createdAt,
      attempt: row.attempt,
    } as Task,
    state: {
      serialIndex: row.serialIndex,
      pendingClients: row.pendingClients,
      leaderReviewing: row.leaderReviewing,
      retryCount: row.retryCount,
    },
  }));

  server.loadTaskStates(entries);
  server.redispatchRestoredTasks();
  console.log(`[restore] recovered ${active.length} active tasks for team "${teamName}"`);
}

// Serve avatar files
app.use("/avatars/*", serveStatic({ root: AVATARS_DIR, rewriteRequestPath: (path) => path.replace(/^\/avatars/, "") }));

// Register route groups
adminRoutes(app);
aiRoutes(app);
messageRoutes(app, teamInstances);
cloudRoutes(app, teamInstances);
brainsRoutes(app, teamInstances);
glossaryRoutes(app, teamInstances);
teamRoutes(app, teamInstances, (name, team) => {
  initTeamDatabase(getTeamDir(name));
  setupTaskPersistence(name, team);
  restoreActiveTasks(name, team);
});
userRoutes(app);
dashboardRoutes(app, teamInstances);

// Serve web frontend (production: static files from ../web/dist)
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const webDistDir = path.resolve(import.meta.dirname, "../web/dist");
if (existsSync(webDistDir)) {
  app.use("/*", serveStatic({ root: webDistDir }));
  // SPA fallback: unmatched GET routes return index.html
  const indexHtml = readFileSync(path.join(webDistDir, "index.html"), "utf-8");
  app.get("*", (c) => c.html(indexHtml));
}

// Start
await ensureTeamsDir();
await restoreTeams();

// Always serve HTTP (for Tauri client / API access)
serve({ fetch: app.fetch, port: managerPort }, (info) => {
  console.log(`Manager API running on http://localhost:${info.port}`);
});

// Also serve HTTPS if cert exists (for browser web frontend — Web Crypto needs secure context)
import https from "node:https";

const certDir = path.resolve(process.env.HOME || process.env.USERPROFILE || "~", ".envoy");
const certFile = path.join(certDir, "cert.pem");
const keyFile = path.join(certDir, "key.pem");

if (existsSync(certFile) && existsSync(keyFile)) {
  serve(
    {
      fetch: app.fetch,
      port: 443,
      createServer: https.createServer,
      serverOptions: { cert: readFileSync(certFile), key: readFileSync(keyFile) },
    },
    () => console.log("Manager web frontend running on https://localhost:443"),
  );
}
