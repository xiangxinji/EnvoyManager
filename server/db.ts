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
  serial_index: number;
  pending_clients: string;
  leader_reviewing: number;
  retry_count: number;
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
  id              TEXT PRIMARY KEY NOT NULL,
  create_by       TEXT NOT NULL,
  subscribe       TEXT NOT NULL DEFAULT '[]',
  content         TEXT NOT NULL DEFAULT '',
  mode            TEXT NOT NULL DEFAULT 'serial',
  status          TEXT NOT NULL DEFAULT 'pending',
  resources       TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  attempt         INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL,
  serial_index    INTEGER NOT NULL DEFAULT 0,
  pending_clients TEXT NOT NULL DEFAULT '[]',
  leader_reviewing INTEGER NOT NULL DEFAULT 0,
  retry_count     INTEGER NOT NULL DEFAULT 0
)`;

const TASK_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status)",
  "CREATE INDEX IF NOT EXISTS idx_task_created ON tasks(created_at)",
];

const CREATE_CLOUD_FILES_TABLE = `
CREATE TABLE IF NOT EXISTS cloud_files (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  parent_id   TEXT,
  type        TEXT NOT NULL DEFAULT 'file',
  size        INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
)`;

const CLOUD_FILE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_cloud_parent_id ON cloud_files(parent_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_parent_name ON cloud_files(parent_id, name)",
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
  "CREATE INDEX IF NOT EXISTS idx_sticker_hash ON stickers(file_hash)",
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

  const stickerColumns = db.prepare("PRAGMA table_info(stickers)").all() as Array<{ name: string }>;
  if (!stickerColumns.some((c) => c.name === "file_hash")) {
    db.exec("ALTER TABLE stickers ADD COLUMN file_hash TEXT NOT NULL DEFAULT ''");
  }

  const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  if (!taskColumns.some((c) => c.name === "serial_index")) {
    db.exec("ALTER TABLE tasks ADD COLUMN serial_index INTEGER NOT NULL DEFAULT 0");
  }
  if (!taskColumns.some((c) => c.name === "pending_clients")) {
    db.exec("ALTER TABLE tasks ADD COLUMN pending_clients TEXT NOT NULL DEFAULT '[]'");
  }
  if (!taskColumns.some((c) => c.name === "leader_reviewing")) {
    db.exec("ALTER TABLE tasks ADD COLUMN leader_reviewing INTEGER NOT NULL DEFAULT 0");
  }
  if (!taskColumns.some((c) => c.name === "retry_count")) {
    db.exec("ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
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

export interface SerializedTaskState {
  serialIndex: number;
  pendingClients: string[];
  leaderReviewing: boolean;
  retryCount: number;
}

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
}, state?: SerializedTaskState | null): void {
  const db = getDb(teamName);
  const now = Date.now();
  const si = state?.serialIndex ?? 0;
  const pc = JSON.stringify(state?.pendingClients ?? []);
  const lr = state?.leaderReviewing ? 1 : 0;
  const rc = state?.retryCount ?? 0;
  db.prepare(`
    INSERT INTO tasks (id, create_by, subscribe, content, mode, status, resources, created_at, attempt, updated_at, serial_index, pending_clients, leader_reviewing, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      resources = excluded.resources,
      attempt = excluded.attempt,
      updated_at = excluded.updated_at,
      serial_index = excluded.serial_index,
      pending_clients = excluded.pending_clients,
      leader_reviewing = excluded.leader_reviewing,
      retry_count = excluded.retry_count
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
    si,
    pc,
    lr,
    rc,
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

export interface ActiveTaskRow extends TaskRow {
  serialIndex: number;
  pendingClients: string[];
  leaderReviewing: boolean;
  retryCount: number;
}

export function queryActiveTasks(teamName: string): ActiveTaskRow[] {
  const db = getDb(teamName);
  const rows = db.prepare("SELECT * FROM tasks WHERE status NOT IN ('completed', 'failed')").all() as StoredTask[];
  return rows.map((row) => {
    const base = rowToTaskRow(row);
    return {
      ...base,
      serialIndex: row.serial_index,
      pendingClients: JSON.parse(row.pending_clients) as string[],
      leaderReviewing: row.leader_reviewing === 1,
      retryCount: row.retry_count,
    };
  });
}

// ─── Cloud Files CRUD ─────────────────────────────────────────

export interface CloudFileRecord {
  id: string;
  name: string;
  parent_id: string | null;
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
    "INSERT INTO cloud_files (id, name, parent_id, type, size, uploaded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, record.name, record.parent_id ?? null, record.type, record.size, record.uploaded_by, now, now);
  return { ...record, id, parent_id: record.parent_id ?? null, created_at: now, updated_at: now };
}

export function getCloudFileById(teamName: string, id: string): CloudFileRecord | undefined {
  const db = getDb(teamName);
  return db.prepare("SELECT * FROM cloud_files WHERE id = ?").get(id) as CloudFileRecord | undefined;
}

export function queryCloudDir(teamName: string, parentId: string | null): CloudFileRecord[] {
  const db = getDb(teamName);
  if (parentId === null) {
    return db.prepare("SELECT * FROM cloud_files WHERE parent_id IS NULL ORDER BY type DESC, name ASC").all() as CloudFileRecord[];
  }
  return db.prepare("SELECT * FROM cloud_files WHERE parent_id = ? ORDER BY type DESC, name ASC").all(parentId) as CloudFileRecord[];
}

export function findCloudFile(teamName: string, parentId: string | null, name: string): CloudFileRecord | undefined {
  const db = getDb(teamName);
  if (parentId === null) {
    return db.prepare("SELECT * FROM cloud_files WHERE parent_id IS NULL AND name = ?").get(name) as CloudFileRecord | undefined;
  }
  return db.prepare("SELECT * FROM cloud_files WHERE parent_id = ? AND name = ?").get(parentId, name) as CloudFileRecord | undefined;
}

export function deleteCloudFile(teamName: string, id: string): boolean {
  const db = getDb(teamName);
  const info = db.prepare("DELETE FROM cloud_files WHERE id = ?").run(id);
  return info.changes > 0;
}

export function deleteCloudDirRecursive(teamName: string, id: string): number {
  const db = getDb(teamName);
  const idsToDelete: string[] = [id];
  const queue: string[] = [id];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = db.prepare("SELECT id FROM cloud_files WHERE parent_id = ?").all(currentId) as Array<{ id: string }>;
    for (const child of children) {
      idsToDelete.push(child.id);
      queue.push(child.id);
    }
  }
  const placeholders = idsToDelete.map(() => "?").join(",");
  const info = db.prepare(`DELETE FROM cloud_files WHERE id IN (${placeholders})`).run(...idsToDelete);
  return info.changes;
}

export function searchCloudFiles(teamName: string, query: string, limit = 20): CloudFileRecord[] {
  const db = getDb(teamName);
  const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
  return db.prepare(
    "SELECT * FROM cloud_files WHERE name LIKE ? ESCAPE '\\' ORDER BY type DESC, name ASC LIMIT ?"
  ).all(pattern, limit) as CloudFileRecord[];
}

export function validateCloudIds(teamName: string, ids: string[]): Record<string, boolean> {
  const db = getDb(teamName);
  const result: Record<string, boolean> = {};
  for (const id of ids) {
    result[id] = false;
  }
  if (ids.length === 0) return result;
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id FROM cloud_files WHERE id IN (${placeholders})`).all(...ids) as Array<{ id: string }>;
  for (const row of rows) {
    result[row.id] = true;
  }
  return result;
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

export function buildCloudPath(teamName: string, id: string): string {
  const db = getDb(teamName);
  const parts: string[] = [];
  let currentId: string | null = id;
  while (currentId !== null) {
    const row = db.prepare("SELECT name, parent_id FROM cloud_files WHERE id = ?").get(currentId) as { name: string; parent_id: string | null } | undefined;
    if (!row) break;
    parts.unshift(row.name);
    currentId = row.parent_id;
  }
  return parts.join("/");
}

export function getCloudBreadcrumb(teamName: string, id: string | null): Array<{ id: string; name: string }> {
  if (id === null) return [];
  const db = getDb(teamName);
  const breadcrumb: Array<{ id: string; name: string }> = [];
  let currentId: string | null = id;
  while (currentId !== null) {
    const row = db.prepare("SELECT id, name, parent_id FROM cloud_files WHERE id = ?").get(currentId) as { id: string; name: string; parent_id: string | null } | undefined;
    if (!row) break;
    breadcrumb.unshift({ id: row.id, name: row.name });
    currentId = row.parent_id;
  }
  return breadcrumb;
}

// ─── Sticker CRUD ─────────────────────────────────────────────

export interface StickerRecord {
  id: string;
  user_id: string;
  name: string;
  filename: string;
  size: number;
  mime_type: string;
  file_hash: string;
  created_at: number;
}

export function insertSticker(teamName: string, record: Omit<StickerRecord, "id" | "created_at">): StickerRecord {
  const db = getDb(teamName);
  const id = randomUUID();
  const created_at = Date.now();
  db.prepare(
    "INSERT INTO stickers (id, user_id, name, filename, size, mime_type, file_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, record.user_id, record.name, record.filename, record.size, record.mime_type, record.file_hash, created_at);
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

export type CollectResult =
  | { ok: true; sticker: StickerRecord }
  | { ok: false; reason: "not_found" | "own_sticker" | "already_collected" };

export function collectSticker(teamName: string, stickerId: string, userId: string): CollectResult {
  const original = getStickerById(teamName, stickerId);
  if (!original) return { ok: false, reason: "not_found" };
  if (original.user_id === userId) return { ok: false, reason: "own_sticker" };
  // Check if already collected (same file_hash by same user)
  const db = getDb(teamName);
  const existing = db.prepare("SELECT id FROM stickers WHERE user_id = ? AND file_hash = ?").get(userId, original.file_hash) as { id: string } | undefined;
  if (existing) return { ok: false, reason: "already_collected" };
  const sticker = insertSticker(teamName, {
    user_id: userId,
    name: original.name,
    filename: original.filename,
    size: original.size,
    mime_type: original.mime_type,
    file_hash: original.file_hash,
  });
  return { ok: true, sticker };
}
