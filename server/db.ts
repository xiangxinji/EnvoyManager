import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const teamDbs = new Map<string, Database.Database>();

export interface InsertMessageInput {
  type: "chat" | "task";
  subtype?: string;
  from_user: string;
  to_user: string;
  content: string;
  extra?: Record<string, unknown>;
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

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS messages (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT UNIQUE NOT NULL,
  type       TEXT NOT NULL DEFAULT 'chat',
  subtype    TEXT,
  from_user  TEXT NOT NULL,
  to_user    TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  extra      TEXT,
  created_at INTEGER NOT NULL
)`;

const CREATE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_sync ON messages(seq)",
  "CREATE INDEX IF NOT EXISTS idx_conversation ON messages(from_user, to_user)",
];

export function initTeamDatabase(teamDir: string): void {
  mkdirSync(teamDir, { recursive: true });
  const dbPath = join(teamDir, "messages.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(CREATE_TABLE);
  for (const sql of CREATE_INDEXES) {
    db.exec(sql);
  }

  // Extract team name from path for the map key
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

export function insertMessage(teamName: string, input: InsertMessageInput): { id: string; seq: number } {
  const db = getDb(teamName);
  const id = randomUUID();
  const extra = input.extra ? JSON.stringify(input.extra) : null;
  const created_at = Date.now();

  const stmt = db.prepare(
    "INSERT INTO messages (id, type, subtype, from_user, to_user, content, extra, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const info = stmt.run(id, input.type, input.subtype ?? null, input.from_user, input.to_user, input.content, extra, created_at);

  return { id, seq: info.lastInsertRowid as number };
}

export function queryMessages(teamName: string, opts: {
  user: string;
  after_seq: number;
  limit: number;
}): SyncResult {
  const db = getDb(teamName);
  const { user, after_seq, limit } = opts;

  // Fetch limit+1 to detect has_more
  const rows = db.prepare(
    "SELECT * FROM messages WHERE (from_user = ? OR to_user = ?) AND seq > ? ORDER BY seq ASC LIMIT ?"
  ).all(user, user, after_seq, limit + 1) as StoredMessage[];

  const has_more = rows.length > limit;
  const messages = has_more ? rows.slice(0, limit) : rows;
  const last_seq = messages.length > 0 ? messages[messages.length - 1].seq : after_seq;

  return { messages, has_more, last_seq };
}

export function queryConversations(teamName: string, user: string): ConversationSummary[] {
  const db = getDb(teamName);

  // Get the latest message per conversation peer
  const rows = db.prepare(`
    SELECT m.*
    FROM messages m
    INNER JOIN (
      SELECT
        CASE WHEN from_user = ? THEN to_user ELSE from_user END AS peer,
        MAX(seq) AS max_seq
      FROM messages
      WHERE from_user = ? OR to_user = ?
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
