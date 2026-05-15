import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { mkdir, writeFile } from "node:fs/promises";
import { Team } from "../../envoy/packages/teams/team.js";
import { loadRegistry, ensureTeamsDir, getTasksDir, getTaskDir, getResourcesDir } from "./team-registry.js";
import type { Task } from "../../envoy/packages/core/task.js";
import teamRoutes from "./routes/teams.js";
import userRoutes from "./routes/users.js";
import dashboardRoutes from "./routes/dashboard.js";
import adminRoutes from "./routes/admin.js";
import aiRoutes from "./routes/ai.js";
import messageRoutes from "./routes/messages.js";
import { initCrypto } from "./crypto.js";
import { initSettings } from "./settings.js";

const app = new Hono();
app.use("*", cors());

const teamInstances = new Map<string, Team>();

// Initialize RSA key pair before anything else
initCrypto();

async function restoreTeams(): Promise<void> {
  const records = await loadRegistry();
  for (const rec of records) {
    const team = new Team({ port: rec.port, host: "0.0.0.0" });
    await team.start();
    teamInstances.set(rec.name, team);
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
  try {
    const taskDir = getTaskDir(teamName, task.id);
    await mkdir(taskDir, { recursive: true });
    await writeFile(
      `${taskDir}/task.json`,
      JSON.stringify(task, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error(`[persist] failed for task ${task.id}:`, e);
  }
}

// Register route groups
adminRoutes(app);
aiRoutes(app);
messageRoutes(app, teamInstances);
teamRoutes(app, teamInstances, (name, team) => setupTaskPersistence(name, team));
userRoutes(app);
dashboardRoutes(app, teamInstances);

// Start
const PORT = Number(process.env.MANAGER_PORT) || 8080;

await ensureTeamsDir();
await initSettings();
await restoreTeams();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Manager API running on http://localhost:${info.port}`);
});
