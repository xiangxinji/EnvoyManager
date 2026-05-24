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
import { initCrypto } from "./crypto.js";
import { initManagerDB, AVATARS_DIR } from "./manager-db.js";
import { initTeamDatabase, insertMessage, upsertTask } from "./db.js";

const app = new Hono();
app.use("*", cors());

const teamInstances = new Map<string, Team>();

// Initialize Manager DB before anything else
initManagerDB();

// Initialize RSA key pair
initCrypto();

async function restoreTeams(): Promise<void> {
  const records = await loadRegistry();
  for (const rec of records) {
    const team = new Team({ port: rec.port, host: "0.0.0.0" });
    await team.start();
    teamInstances.set(rec.name, team);
    initTeamDatabase(getTeamDir(rec.name));
    setupTaskPersistence(rec.name, team);
    console.log(`[restored] team "${rec.name}" on port ${rec.port}`);
  }
}

function setupTaskPersistence(teamName: string, team: Team): void {
  const server = team.innerServer;

  server.on("task:created", (task: Task) => persistTask(teamName, task));
  server.on("task:updated", (task: Task) => persistTask(teamName, task));
  server.on("task:completed", (task: Task) => persistTask(teamName, task));
  server.on("task:failed", (task: Task) => persistTask(teamName, task));
}

async function persistTask(teamName: string, task: Task): Promise<void> {
  // Upsert task to SQLite
  try {
    upsertTask(teamName, task);
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

// Serve avatar files
app.use("/avatars/*", serveStatic({ root: AVATARS_DIR, rewriteRequestPath: (path) => path.replace(/^\/avatars/, "") }));

// Register route groups
adminRoutes(app);
aiRoutes(app);
messageRoutes(app, teamInstances);
cloudRoutes(app, teamInstances);
brainsRoutes(app, teamInstances);
teamRoutes(app, teamInstances, (name, team) => {
  initTeamDatabase(getTeamDir(name));
  setupTaskPersistence(name, team);
});
userRoutes(app);
dashboardRoutes(app, teamInstances);

// Start
const PORT = Number(process.env.MANAGER_PORT) || 8080;

await ensureTeamsDir();
await restoreTeams();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Manager API running on http://localhost:${info.port}`);
});
