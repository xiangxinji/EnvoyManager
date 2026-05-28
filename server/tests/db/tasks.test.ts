import { describe, it, expect, beforeEach } from "vitest";
import { createTeamDB } from "../helpers/team-db.js";
import { __setTeamDb, upsertTask, queryTasks, queryTaskById, queryActiveTasks } from "../../db.js";

const TEAM = "test-team";

function init() {
  const db = createTeamDB();
  __setTeamDb(TEAM, db);
  return db;
}

describe("Task CRUD", () => {
  beforeEach(() => {
    init();
  });

  const sampleTask = {
    id: "task-1",
    createBy: "leader",
    subscribe: ["worker1", "worker2"],
    content: "do stuff",
    mode: "serial",
    status: "pending",
    resources: [] as Array<{ type: string; by: string; data: unknown; attempt: number }>,
    createdAt: Date.now(),
    attempt: 1,
  };

  it("upsertTask creates a task", () => {
    upsertTask(TEAM, sampleTask);
    const tasks = queryTasks(TEAM);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("task-1");
    expect(tasks[0].content).toBe("do stuff");
    expect(tasks[0].subscribe).toEqual(["worker1", "worker2"]);
  });

  it("queryTaskById returns specific task", () => {
    upsertTask(TEAM, sampleTask);
    const task = queryTaskById(TEAM, "task-1");
    expect(task).not.toBeNull();
    expect(task!.createBy).toBe("leader");
  });

  it("queryTaskById returns null for unknown id", () => {
    expect(queryTaskById(TEAM, "ghost")).toBeNull();
  });

  it("upsertTask updates existing task on conflict", () => {
    upsertTask(TEAM, sampleTask);
    upsertTask(TEAM, { ...sampleTask, status: "running", attempt: 2 });
    const task = queryTaskById(TEAM, "task-1")!;
    expect(task.status).toBe("running");
    expect(task.attempt).toBe(2);
  });

  it("upsertTask preserves resources JSON", () => {
    upsertTask(TEAM, {
      ...sampleTask,
      resources: [{ type: "client-result", by: "worker1", data: { ok: true }, attempt: 1 }],
    });
    const task = queryTaskById(TEAM, "task-1")!;
    expect(task.resources).toHaveLength(1);
    expect(task.resources[0].type).toBe("client-result");
  });

  it("queryActiveTasks returns only non-terminal tasks", () => {
    upsertTask(TEAM, { ...sampleTask, id: "t1", status: "pending" });
    upsertTask(TEAM, { ...sampleTask, id: "t2", status: "running" });
    upsertTask(TEAM, { ...sampleTask, id: "t3", status: "completed" });
    upsertTask(TEAM, { ...sampleTask, id: "t4", status: "failed" });

    const active = queryActiveTasks(TEAM);
    const ids = active.map((t) => t.id);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).not.toContain("t3");
    expect(ids).not.toContain("t4");
  });

  it("upsertTask with state stores serialized fields", () => {
    upsertTask(TEAM, sampleTask, {
      serialIndex: 2,
      pendingClients: ["worker1"],
      leaderReviewing: true,
      retryCount: 3,
    });
    const active = queryActiveTasks(TEAM);
    expect(active[0].serialIndex).toBe(2);
    expect(active[0].pendingClients).toEqual(["worker1"]);
    expect(active[0].leaderReviewing).toBe(true);
    expect(active[0].retryCount).toBe(3);
  });

  it("queryTasks returns tasks ordered by created_at DESC", () => {
    upsertTask(TEAM, { ...sampleTask, id: "t-old", createdAt: 1000 });
    upsertTask(TEAM, { ...sampleTask, id: "t-new", createdAt: 2000 });
    const tasks = queryTasks(TEAM);
    expect(tasks[0].id).toBe("t-new");
    expect(tasks[1].id).toBe("t-old");
  });
});
