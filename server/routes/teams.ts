import type { Hono } from "hono";
import { rm, readdir } from "node:fs/promises";
import { Team } from "../../../envoy/packages/teams/team.js";
import { closeTeamDatabase, queryTasks, queryTaskById, deleteTask, deleteAllTasks, deleteTaskMessages, deleteAllTaskMessages } from "../db.js";
import {
  loadRegistry,
  allocatePort,
  loadMeta,
  saveMeta,
  deleteTeamDir,
  getTaskDir,
  getTasksDir,
  type TeamRecord,
  type TeamMeta,
} from "../team-registry.js";
import { loadUsers } from "../user-registry.js";
import { teamHost } from "../config.js";
import { adminAuth } from "./middleware.js";

export function teamStats(team: Team) {
  const server = team.innerServer;
  const clients = server.getClients();
  const tasks = server.getAllTasks();
  return {
    totalClients: clients.length,
    onlineClients: server.getOnlineClients().length,
    totalTasks: tasks.length,
    tasksByStatus: {
      pending: tasks.filter((t) => t.status === "pending").length,
      running: tasks.filter((t) => t.status === "running").length,
      reviewing: tasks.filter((t) => t.status === "reviewing").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    },
  };
}

export default function teamRoutes(app: Hono, teams: Map<string, Team>, onTeamCreated?: (name: string, team: Team) => void) {
  app.use("/api/teams/*", adminAuth);

  app.post("/api/teams", async (c) => {
    const body = await c.req.json<{
      name?: string;
      port?: number;
      leader?: string;
      members?: { username: string; responsibilities?: string }[];
    }>();
    const name = body.name?.trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    if (!body.leader) return c.json({ error: "leader is required" }, 400);
    if (teams.has(name)) return c.json({ error: "team already exists" }, 409);

    const records = await loadRegistry();
    const port = body.port ?? allocatePort(records);

    const meta: TeamMeta = {
      name,
      port,
      createdAt: Date.now(),
      leader: body.leader,
      members: body.members ?? [],
    };
    await saveMeta(meta);

    const team = new Team({ port, host: teamHost });
    await team.start();
    teams.set(name, team);
    onTeamCreated?.(name, team);

    console.log(`[created] team "${name}" on port ${port}`);
    return c.json({ name, port, createdAt: meta.createdAt }, 201);
  });

  app.get("/api/teams", async (c) => {
    const records = await loadRegistry();
    const username = c.req.query("username")?.trim();

    // If username provided, only return teams where user is leader or member
    if (username) {
      const filtered: TeamRecord[] = [];
      for (const rec of records) {
        const meta = await loadMeta(rec.name);
        if (!meta) continue;
        if (meta.leader === username || meta.members.some((m) => m.username === username)) {
          filtered.push(rec);
        }
      }
      return c.json(
        filtered.map((rec) => {
          const instance = teams.get(rec.name);
          return {
            ...rec,
            status: instance ? "running" : "stopped",
            stats: instance ? teamStats(instance) : null,
          };
        })
      );
    }

    return c.json(
      records.map((rec) => {
        const instance = teams.get(rec.name);
        return {
          ...rec,
          status: instance ? "running" : "stopped",
          stats: instance ? teamStats(instance) : null,
        };
      })
    );
  });

  app.get("/api/teams/:name", async (c) => {
    const name = c.req.param("name");
    const meta = await loadMeta(name);
    if (!meta) return c.json({ error: "team not found" }, 404);

    const instance = teams.get(name);
    return c.json({
      name: meta.name,
      port: meta.port,
      createdAt: meta.createdAt,
      leader: meta.leader,
      members: meta.members,
      status: instance ? "running" : "stopped",
      stats: instance ? teamStats(instance) : null,
    });
  });

  app.delete("/api/teams/:name", async (c) => {
    const name = c.req.param("name");
    const meta = await loadMeta(name);
    if (!meta) return c.json({ error: "team not found" }, 404);

    const instance = teams.get(name);
    if (instance) {
      await instance.stop();
      teams.delete(name);
    }

    closeTeamDatabase(name);
    await deleteTeamDir(name);

    console.log(`[deleted] team "${name}"`);
    return c.json({ ok: true });
  });

  // Get configured team members (from meta, merged with latest user data)
  app.get("/api/teams/:name/configured-members", async (c) => {
    const meta = await loadMeta(c.req.param("name"));
    if (!meta) return c.json({ error: "team not found" }, 404);
    const users = await loadUsers();
    const userMap = new Map(users.map((u) => [u.username, u]));
    const members = meta.members.map((m) => {
      const user = userMap.get(m.username);
      return {
        username: m.username,
        nickname: user?.nickname ?? null,
        avatar_url: user?.avatar_url ?? null,
        responsibilities: user?.responsibilities ?? m.responsibilities ?? "",
        capabilities: user?.capabilities ?? m.capabilities ?? "",
      };
    });
    const leaderUser = userMap.get(meta.leader);
    const leader = {
      username: meta.leader,
      nickname: leaderUser?.nickname ?? null,
      avatar_url: leaderUser?.avatar_url ?? null,
    };
    return c.json({ leader, members });
  });

  // Add member to team
  app.put("/api/teams/:name/members/:username", async (c) => {
    const teamName = c.req.param("name");
    const username = c.req.param("username");
    const meta = await loadMeta(teamName);
    if (!meta) return c.json({ error: "team not found" }, 404);
    if (meta.members.some((m) => m.username === username))
      return c.json({ error: "member already in team" }, 409);

    const body = await c.req.json<{ responsibilities?: string; capabilities?: string }>().catch(() => ({ responsibilities: undefined, capabilities: undefined }));
    meta.members.push({ username, responsibilities: body.responsibilities, capabilities: body.capabilities });
    await saveMeta(meta);
    return c.json({ ok: true });
  });

  // Remove member from team
  app.delete("/api/teams/:name/members/:username", async (c) => {
    const teamName = c.req.param("name");
    const username = c.req.param("username");
    const meta = await loadMeta(teamName);
    if (!meta) return c.json({ error: "team not found" }, 404);

    const idx = meta.members.findIndex((m) => m.username === username);
    if (idx === -1) return c.json({ error: "member not found" }, 404);

    meta.members.splice(idx, 1);
    await saveMeta(meta);
    return c.json({ ok: true });
  });

  app.get("/api/teams/:name/members", async (c) => {
    const instance = teams.get(c.req.param("name"));
    if (!instance) return c.json({ error: "team not found" }, 404);
    const clients = instance.innerServer.getClients();
    const users = await loadUsers();
    const userMap = new Map(users.map((u) => [u.username, u]));
    return c.json(
      clients.map((cl) => ({
        ...cl,
        responsibilities: userMap.get(cl.id)?.responsibilities ?? "",
      }))
    );
  });

  app.get("/api/teams/:name/tasks", async (c) => {
    const name = c.req.param("name");
    const instance = teams.get(name);
    if (!instance) return c.json({ error: "team not found" }, 404);
    const tasks = queryTasks(name);
    return c.json(tasks.map((t) => {
      const clientResult = t.resources.find((r) => r.type === "client-result");
      return {
        ...t,
        assignedTo: clientResult?.by ?? null,
        result: clientResult?.data ?? null,
      };
    }));
  });

  app.get("/api/teams/:name/members/:id/task-stats", async (c) => {
    const name = c.req.param("name");
    const memberId = c.req.param("id");
    const instance = teams.get(name);
    if (!instance) return c.json({ error: "team not found" }, 404);
    const tasks = queryTasks(name);
    const counts = { pending: 0, running: 0, reviewing: 0, completed: 0, failed: 0 };
    for (const t of tasks) {
      if (!t.subscribe.includes(memberId)) continue;
      if (t.status in counts) counts[t.status as keyof typeof counts]++;
    }
    return c.json(counts);
  });

  // Delete all tasks for a team
  app.delete("/api/teams/:name/tasks", async (c) => {
    const name = c.req.param("name");
    const instance = teams.get(name);
    if (!instance) return c.json({ error: "team not found" }, 404);

    // 1. Clear in-memory tasks
    const memCount = instance.innerServer.removeAllTasks();

    // 2. Clear SQLite tasks table
    const dbCount = deleteAllTasks(name);

    // 3. Clear associated task messages
    deleteAllTaskMessages(name);

    // 4. Clear task directories on disk
    try {
      const tasksDir = getTasksDir(name);
      const entries = await readdir(tasksDir).catch(() => [] as string[]);
      for (const entry of entries) {
        await rm(`${tasksDir}/${entry}`, { recursive: true, force: true }).catch(() => {});
      }
    } catch {
      // tasks dir may not exist
    }

    console.log(`[tasks] cleared all tasks for team "${name}": ${dbCount} from db, ${memCount} from memory`);
    return c.json({ ok: true, deletedCount: dbCount });
  });

  // Delete a single task
  app.delete("/api/teams/:name/tasks/:id", async (c) => {
    const name = c.req.param("name");
    const instance = teams.get(name);
    if (!instance) return c.json({ error: "team not found" }, 404);

    const taskId = c.req.param("id");

    // 1. Remove from in-memory
    instance.innerServer.removeTask(taskId);

    // 2. Remove from SQLite tasks table
    const deleted = deleteTask(name, taskId);

    // 3. Remove associated task messages
    deleteTaskMessages(name, taskId);

    // 4. Remove task directory on disk
    try {
      const taskDir = getTaskDir(name, taskId);
      await rm(taskDir, { recursive: true, force: true });
    } catch {
      // task dir may not exist
    }

    console.log(`[tasks] deleted task "${taskId}" from team "${name}"`);
    return c.json({ ok: true, deleted: deleted ? taskId : null });
  });

  app.get("/api/teams/:name/tasks/:id", async (c) => {
    const name = c.req.param("name");
    const instance = teams.get(name);
    if (!instance) return c.json({ error: "team not found" }, 404);
    const task = queryTaskById(name, c.req.param("id"));
    if (!task) return c.json({ error: "task not found" }, 404);
    const clientResults = task.resources.filter((r) => r.type === "client-result");
    return c.json({
      ...task,
      assignedTo: clientResults.map((r) => r.by),
      results: clientResults.map((r) => ({ by: r.by, data: r.data })),
    });
  });
}
