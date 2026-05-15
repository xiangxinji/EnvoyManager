import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";

export interface UserRecord {
  username: string;
  password: string; // bcrypt hash
  role: "leader" | "member";
  responsibilities: string;
  capabilities: string;
  createdAt: number;
}

const USERS_PATH = join(homedir(), ".envoy", "users.json");

export async function loadUsers(): Promise<UserRecord[]> {
  try {
    const raw = await readFile(USERS_PATH, "utf-8");
    return JSON.parse(raw) as UserRecord[];
  } catch {
    return [];
  }
}

export async function saveUsers(users: UserRecord[]): Promise<void> {
  const dir = join(homedir(), ".envoy");
  await mkdir(dir, { recursive: true });
  await writeFile(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function authenticate(username: string, password: string): Promise<UserRecord | null> {
  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.password);
  return match ? user : null;
}
