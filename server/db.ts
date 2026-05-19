import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const teamDbs = new Map<string, Database.Database>();

// ─── Message types ────────────────────────────────────────────

export interface InsertMessageInput {
  type: "chat" | "task";
  subtype?: string;
  from_user: string;
  to_user: string;
  content: string;
  extra?: Record<string, unknown>;
  source?: string;
  channel?: string;
  mentions?: string;
}

export interface StoredMessage {
  seq: number;
  id: string;
  type: string;
  subtype: string | null;
  from_user: string;
  to_user: string;
  content: string;
  extra: string | null;
  source: string;
  channel: string | null;
  mentions: string | null;
  created_at: number;
}

export interface SyncResult {
  messages: StoredMessage[];
  has_more: boolean;
  last_seq: number;
}

export interface ConversationSummary {
  peer: string;
  last_seq: number;
  last_message: StoredMessage;
}

// ─── Task types ───────────────────────────────────────────────

export interface StoredTask {
  id: string;
  create_by: string;
  subscribe: string;
  content: string;
  mode: string;
  status: string;
  resources: string;
  created_at: number;
  attempt: number;
}

export interface TaskRow {
  id: string;
  createBy: string;
  subscribe: string[];
  content: string;
  mode: string;
  status: string;
  resources: Array<{ type: string; by: string; data: unknown; attempt: number }>;
  createdAt: number;
  attempt: number;
}

// ─── Schema ───────────────────────────────────────────────────

const CREATE_MESSAGES_TABLE = `
CREATE TABLE IF NOT EXISTS messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT UNIQUE NOT NULL,
  type       TEXT NOT NULL DEFAULT 'chat',
  subtype    TEXT,
  from_user  TEXT NOT NULL,
  to_user    TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  extra      TEXT,
  source     TEXT NOT NULL DEFAULT 'human',
  created_at INTEGER NOT NULL
)`;

const MESSAGE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_sync ON messages(seq)",
  "CREATE INDEX IF NOT EXISTS idx_conversation ON messages(from_user, to_user)",
  "CREATE INDEX IF NOT EXISTS idx_channel ON messages(channel)",
];

const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY NOT NULL,
  create_by  TEXT NOT NULL,
  subscribe  TEXT NOT NULL DEFAULT '[]',
  content    TEXT NOT NULL DEFAULT '',
  mode       TEXT NOT NULL DEFAULT 'serial',
  status     TEXT NOT NULL DEFAULT 'pending',
  resources  TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  attempt    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
)`;

const TASK_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status)",
  "CREATE INDEX IF NOT EXISTS idx_task_created ON tasks(created_at)",
];

const CREATE_CLOUD_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS cloud_files (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'file',
  size        INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
)`;

const CLOUD_FILE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_cloud_path ON cloud_files(path)",
  "CREATE INDEX IF NOT EXISTS idx_cloud_parent ON cloud_files(path, name)",
];

const CREATE_STICKERS_TABLE = `
CREATE TABLE IF NOT EXISTS stickers (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  filename   TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  mime_type  TEXT NOT NULL DEFAULT 'image/png',
  created_at INTEGER NOT NULL
)`;

const STICKER_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_sticker_user ON stickers(user_id)",
];

// ─── Init ─────────────────────────────────────────────────────

function getDbDir(teamDir: string): string {
  return join(teamDir, "db");
}

export function initTeamDatabase(teamDir: string): void {
  mkdirSync(teamDir, { recursive: true });
  const dbDir = getDbDir(teamDir);
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "team.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(CREATE_MESSAGES_TABLE);
  db.exec(CREATE_TASKS_TABLE);
  db.exec(CREATE_CLOUD_FILES_TABLE);
  db.exec(CREATE_STICKERS_TABLE);

  // Migrations: add missing columns before creating indexes
  const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "source")) {
    db.exec("ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'human'");
  }
  if (!columns.some((c) => c.name === "channel")) {
    db.exec("ALTER TABLE messages ADD COLUMN channel TEXT");
  }
  if (!columns.some((c) => c.name === "mentions")) {
    db.exec("ALTER TABLE messages ADD COLUMN mentions TEXT");
  }

  for (const sql of [...MESSAGE_INDEXES, ...TASK_INDEXES, ...CLOUD_FILE_INDEXES, ...STICKER_INDEXES]) {
    db.exec(sql);
  }

  const teamName = teamDir.split(/[/\\]/).pop()!;
  teamDbs.set(teamName, db);
}

export function closeTeamDatabase(teamName: string): void {
  const db = teamDbs.get(teamName);
  if (db) {
    db.close();
    teamDbs.delete(teamName);
  }
}

function getDb(teamName: string): Database.Database {
  const db = teamDbs.get(teamName);
  if (!db) throw new Error(`Database not initialized for team: ${teamName}`);
  return db;
}

// ─── Message CRUD ─────────────────────────────────────────────

export function deleteMessage(teamName: string, msgId: string): boolean {
  const db = getDb(teamName);
  const info = db.prepare("DELETE FROM messages WHERE id = ?").run(msgId);
  return info.changes > 0;
}

export function getMessageById(teamName: string, msgId: string): StoredMessage | null {
  const db = getDb(teamName);
  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(msgId) as StoredMessage | undefined;
  return row ?? null;
}

export function insertMessage(teamName: string, input: InsertMessageInput): { id: string; seq: number } {
  const db = getDb(teamName);
  const id = randomUUID();
  const extra = input.extra ? JSON.stringify(input.extra) : null;
  const source = input.source ?? "human";
  const channel = input.channel ?? null;
  const mentions = input.mentions ?? null;
  const created_at = Date.now();

  const stmt = db.prepare(
    "INSERT INTO messages (id, type, subtype, from_user, to_user, content, extra, source, channel, mentions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const info = stmt.run(id, input.type, input.subtype ?? null, input.from_user, input.to_user, input.content, extra, source, channel, mentions, created_at);

  return { id, seq: info.lastInsertRowid as number };
}

export function queryMessages(teamName: string, opts: {
  user: string;
  after_seq: number;
  limit: number;
}): SyncResult {
  const db = getDb(teamName);
  const { user, after_seq, limit } = opts;

  const rows = db.prepare(
    "SELECT * FROM messages WHERE ((from_user = ? OR to_user = ?) OR channel = 'general') AND seq > ? ORDER BY seq ASC LIMIT ?"
  ).all(user, user, after_seq, limit + 1) as StoredMessage[];

  const has_more = rows.length > limit;
  const messages = has_more ? rows.slice(0, limit) : rows;
  const last_seq = messages.length > 0 ? messages[messages.length - 1].seq : after_seq;

  return { messages, has_more, last_seq };
}

export function queryConversations(teamName: string, user: string): ConversationSummary[] {
  const db = getDb(teamName);

  const rows = db.prepare(`
    SELECT m.*
    FROM messages m
    INNER JOIN (
      SELECT
        CASE WHEN from_user = ? THEN to_user ELSE from_user END AS peer,
        MAX(seq) AS max_seq
      FROM messages
      WHERE (from_user = ? OR to_user = ?) AND channel IS NULL
      GROUP BY peer
    ) latest ON m.seq = latest.max_seq
    ORDER BY m.seq DESC
  `).all(user, user, user) as StoredMessage[];

  return rows.map((m) => ({
    peer: m.from_user === user ? m.to_user : m.from_user,
    last_seq: m.seq,
    last_message: m,
  }));
}

// ─── Task CRUD ────────────────────────────────────────────────

export function upsertTask(teamName: string, task: {
  id: string;
  createBy: string;
  subscribe: string[];
  content: string;
  mode: string;
  status: string;
  resources: Array<{ type: string; by: string; data: unknown; attempt: number }>;
  createdAt: number;
  attempt: number;
}): void {
  const db = getDb(teamName);
  const now = Date.now();
  db.prepare(`
    INSERT INTO tasks (id, create_by, subscribe, content, mode, status, resources, created_at, attempt, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      resources = excluded.resources,
      attempt = excluded.attempt,
      updated_at = excluded.updated_at
  `).run(
    task.id,
    task.createBy,
    JSON.stringify(task.subscribe),
    task.content,
    task.mode,
    task.status,
    JSON.stringify(task.resources),
    task.createdAt,
    task.attempt,
    now,
  );
}

function rowToTaskRow(row: StoredTask): TaskRow {
  return {
    id: row.id,
    createBy: row.create_by,
    subscribe: JSON.parse(row.subscribe) as string[],
    content: row.content,
    mode: row.mode,
    status: row.status,
    resources: JSON.parse(row.resources) as TaskRow["resources"],
    createdAt: row.created_at,
    attempt: row.attempt,
  };
}

export function queryTasks(teamName: string): TaskRow[] {
  const db = getDb(teamName);
  const rows = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as StoredTask[];
  return rows.map(rowToTaskRow);
}

export function queryTaskById(teamName: string, taskId: string): TaskRow | null {
  const db = getDb(teamName);
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as StoredTask | undefined;
  return row ? rowToTaskRow(row) : null;
}

// ─── Cloud Files CRUD ─────────────────────────────────────────

export interface CloudFileRecord {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  uploaded_by: string;
  created_at: number;
  updated_at: number;
}

export interface CloudStats {
  totalFiles: number;
  totalSize: number;
  totalDirs: number;
  byUser: Array<{ user: string; fileCount: number; totalSize: number }>;
}

export function insertCloudFile(teamName: string, record: Omit<CloudFileRecord, "id">): CloudFileRecord {
  const db = getDb(teamName);
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO cloud_files (id, name, path, type, size, uploaded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, record.name, record.path, record.type, record.size, record.uploaded_by, now, now);
  return { ...record, id, created_at: now, updated_at: now };
}

export function queryCloudDir(teamName: string, dirPath: string): CloudFileRecord[] {
  const db = getDb(teamName);
  return db.prepare("SELECT * FROM cloud_files WHERE path = ? ORDER BY type DESC, name ASC").all(dirPath) as CloudFileRecord[];
}

export function findCloudFile(teamName: string, path: string, name: string): CloudFileRecord | undefined {
  const db = getDb(teamName);
  return db.prepare("SELECT * FROM cloud_files WHERE path = ? AND name = ?").get(path, name) as CloudFileRecord | undefined;
}

export function deleteCloudFile(teamName: string, id: string): boolean {
  const db = getDb(teamName);
  const info = db.prepare("DELETE FROM cloud_files WHERE id = ?").run(id);
  return info.changes > 0;
}

export function deleteCloudDirRecursive(teamName: string, dirPath: string): number {
  const db = getDb(teamName);
  const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";
  // Extract parent path and dir name from the full path
  // e.g. "t1/t2/" → parentPath="t1/", dirName="t2"; "spec/" → parentPath="", dirName="spec"
  const parts = dirPath.replace(/\/$/, "").split("/");
  const dirName = parts.pop()!;
  const parentPath = parts.length > 0 ? parts.join("/") + "/" : "";
  const self = db.prepare("DELETE FROM cloud_files WHERE path = ? AND name = ?").run(parentPath, dirName);
  const children = db.prepare("DELETE FROM cloud_files WHERE path = ? OR path LIKE ?").run(dirPath, `${prefix}%`);
  return self.changes + children.changes;
}

export function getCloudStats(teamName: string): CloudStats {
  const db = getDb(teamName);
  const fileRow = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as total FROM cloud_files WHERE type = 'file'").get() as { count: number; total: number };
  const dirRow = db.prepare("SELECT COUNT(*) as count FROM cloud_files WHERE type = 'directory'").get() as { count: number };
  const userRows = db.prepare(
    "SELECT uploaded_by as user, COUNT(*) as fileCount, COALESCE(SUM(size), 0) as totalSize FROM cloud_files WHERE type = 'file' GROUP BY uploaded_by"
  ).all() as Array<{ user: string; fileCount: number; totalSize: number }>;
  return {
    totalFiles: fileRow.count,
    totalSize: fileRow.total,
    totalDirs: dirRow.count,
    byUser: userRows,
  };
}

// ─── Sticker CRUD ─────────────────────────────────────────────

export interface StickerRecord {
  id: string;
  user_id: string;
  name: string;
  filename: string;
  size: number;
  mime_type: string;
  created_at: number;
}

export function insertSticker(teamName: string, record: Omit<StickerRecord, "id" | "created_at">): StickerRecord {
  const db = getDb(teamName);
  const id = randomUUID();
  const created_at = Date.now();
  db.prepare(
    "INSERT INTO stickers (id, user_id, name, filename, size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, record.user_id, record.name, record.filename, record.size, record.mime_type, created_at);
  return { ...record, id, created_at };
}

export function listStickersByUser(teamName: string, userId: string): StickerRecord[] {
  const db = getDb(teamName);
  return db.prepare("SELECT * FROM stickers WHERE user_id = ? ORDER BY created_at DESC").all(userId) as StickerRecord[];
}

export function getStickerById(teamName: string, stickerId: string): StickerRecord | null {
  const db = getDb(teamName);
  const row = db.prepare("SELECT * FROM stickers WHERE id = ?").get(stickerId) as StickerRecord | undefined;
  return row ?? null;
}

export function deleteSticker(teamName: string, stickerId: string): boolean {
  const db = getDb(teamName);
  const info = db.prepare("DELETE FROM stickers WHERE id = ?").run(stickerId);
  return info.changes > 0;
}
