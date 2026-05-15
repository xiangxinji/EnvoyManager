import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TeamMember {
  username: string;
  responsibilities?: string;
  capabilities?: string;
}

export interface TeamMeta {
  name: string;
  port: number;
  createdAt: number;
  leader: string;
  members: TeamMember[];
}

export type TeamRecord = Omit<TeamMeta, "leader" | "members">;

const TEAMS_DIR = join(homedir(), ".envoy", "teams");

export function getTeamDir(name: string): string {
  return join(TEAMS_DIR, name);
}

export function getTasksDir(name: string): string {
  return join(TEAMS_DIR, name, "tasks");
}

export function getTaskDir(name: string, taskId: string): string {
  return join(TEAMS_DIR, name, "tasks", taskId);
}

export function getResourcesDir(name: string, taskId: string): string {
  return join(TEAMS_DIR, name, "tasks", taskId, "resources");
}

export async function ensureTeamsDir(): Promise<void> {
  await mkdir(TEAMS_DIR, { recursive: true });
}

export async function loadRegistry(): Promise<TeamRecord[]> {
  await ensureTeamsDir();
  try {
    const entries = await readdir(TEAMS_DIR, { withFileTypes: true });
    const records: TeamRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await readFile(join(TEAMS_DIR, entry.name, "meta.json"), "utf-8");
        const meta = JSON.parse(raw) as TeamMeta;
        records.push({ name: meta.name, port: meta.port, createdAt: meta.createdAt });
      } catch {
        // skip invalid directories
      }
    }
    return records;
  } catch {
    return [];
  }
}

export async function loadMeta(name: string): Promise<TeamMeta | null> {
  try {
    const raw = await readFile(join(TEAMS_DIR, name, "meta.json"), "utf-8");
    return JSON.parse(raw) as TeamMeta;
  } catch {
    return null;
  }
}

export async function saveMeta(meta: TeamMeta): Promise<void> {
  const dir = join(TEAMS_DIR, meta.name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
}

export async function deleteTeamDir(name: string): Promise<void> {
  const dir = join(TEAMS_DIR, name);
  await rm(dir, { recursive: true, force: true });
}

export interface PersistedTask {
  id: string;
  team: string;
  createBy: string;
  subscribe: string[];
  content: string;
  mode: string;
  status: string;
  resources: Array<{ type: string; by: string; data: unknown; attempt: number }>;
  createdAt: number;
  attempt: number;
}

export async function loadTasksForTeam(teamName: string): Promise<PersistedTask[]> {
  const tasksDir = getTasksDir(teamName);
  const results: PersistedTask[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(tasksDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(join(tasksDir, entry.name, "task.json"), "utf-8");
      const task = JSON.parse(raw) as PersistedTask;
      task.team = teamName;
      results.push(task);
    } catch {
      // skip corrupted task files
    }
  }
  return results;
}

export function allocatePort(records: TeamRecord[], start = 3001): number {
  const usedPorts = new Set(records.map((r) => r.port));
  let port = start;
  while (usedPorts.has(port)) port++;
  return port;
}
