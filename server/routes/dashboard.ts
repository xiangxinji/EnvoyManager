import type { Hono } from "hono";
import { Team } from "../../../envoy/packages/teams/team.js";
import { loadRegistry, loadTasksForTeam } from "../team-registry.js";

export default function dashboardRoutes(app: Hono, teams: Map<string, Team>) {
  app.get("/api/dashboard", async (c) => {
    const records = await loadRegistry();
    let totalOnline = 0;
    const taskSummary = { pending: 0, running: 0, reviewing: 0, completed: 0, failed: 0 };
    const allTasks: Array<{
      id: string;
      team: string;
      content: string;
      status: string;
      createBy: string;
      assignedTo: string | null;
      result: unknown;
      resources: Array<{ type: string; by: string; data: unknown; attempt: number }>;
      createdAt: number;
    }> = [];

    for (const rec of records) {
      const instance = teams.get(rec.name);
      if (instance) {
        totalOnline += instance.innerServer.getOnlineClients().length;
      }

      const tasks = await loadTasksForTeam(rec.name);

      for (const t of tasks) {
        const clientResult = t.resources.find((r) => r.type === "client-result");
        allTasks.push({
          id: t.id,
          team: rec.name,
          content: t.content,
          status: t.status,
          createBy: t.createBy,
          assignedTo: clientResult?.by ?? null,
          result: clientResult?.data ?? null,
          resources: t.resources,
          createdAt: t.createdAt,
        });

        if (t.status in taskSummary) {
          (taskSummary as Record<string, number>)[t.status]++;
        }
      }
    }

    allTasks.sort((a, b) => b.createdAt - a.createdAt);
    const recentTasks = allTasks.slice(0, 20);
    const totalTasks = allTasks.length;

    return c.json({ totalTeams: records.length, totalOnline, totalTasks, taskSummary, recentTasks });
  });
}
