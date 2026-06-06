import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, unlinkSync } from "node:fs";
import bcrypt from "bcryptjs";
import type { ModelPreset, SceneType, SceneConfig, ProviderType } from "../../shared/types/ai.js";

const MANAGER_DB_DIR = join(homedir(), ".envoy", "manager", "db");
const MANAGER_DB_PATH = join(MANAGER_DB_DIR, "manager.db");
export const AVATARS_DIR = join(homedir(), ".envoy", "avatars");

const DEFAULT_USERNAME = process.env.ENVOY_DEFAULT_ADMIN_USERNAME || "admin";
const DEFAULT_PASSWORD = process.env.ENVOY_DEFAULT_ADMIN_PASSWORD || "admin123";

let db: Database.Database;

// ─── Schema ───

const CREATE_ADMIN = `
CREATE TABLE IF NOT EXISTS admin (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  username        TEXT NOT NULL,
  password_bcrypt TEXT NOT NULL
)`;

const CREATE_AI_PRESETS = `
CREATE TABLE IF NOT EXISTS ai_presets (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT UNIQUE NOT NULL,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  api_key    TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  base_url   TEXT
)`;

const CREATE_AI_SCENES = `
CREATE TABLE IF NOT EXISTS ai_scenes (
  scene_type  TEXT PRIMARY KEY NOT NULL,
  preset_id   TEXT,
  temperature REAL,
  max_tokens  INTEGER,
  FOREIGN KEY (preset_id) REFERENCES ai_presets(id)
)`;

const CREATE_USERS = `
CREATE TABLE IF NOT EXISTS users (
  username        TEXT PRIMARY KEY NOT NULL,
  password_bcrypt TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member',
  responsibilities TEXT NOT NULL DEFAULT '',
  capabilities    TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL
)`;

const CREATE_GLOSSARY = `
CREATE TABLE IF NOT EXISTS glossary (
  id         TEXT PRIMARY KEY NOT NULL,
  term       TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const CREATE_AI_USAGE = `
CREATE TABLE IF NOT EXISTS ai_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  team              TEXT NOT NULL,
  username          TEXT NOT NULL,
  scene             TEXT NOT NULL,
  preset_id         TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
)`;

const AI_USAGE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_ai_usage_team ON ai_usage(team)",
  "CREATE INDEX IF NOT EXISTS idx_ai_usage_username ON ai_usage(username)",
  "CREATE INDEX IF NOT EXISTS idx_ai_usage_scene ON ai_usage(scene)",
  "CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at)",
];

const GLOSSARY_INDEXES = [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_term ON glossary(term)",
];

// ─── Init ───

export function initManagerDB(): void {
  mkdirSync(MANAGER_DB_DIR, { recursive: true });
  db = new Database(MANAGER_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CREATE_ADMIN);
  db.exec(CREATE_AI_PRESETS);
  db.exec(CREATE_AI_SCENES);
  db.exec(CREATE_USERS);
  db.exec(CREATE_GLOSSARY);
  db.exec(CREATE_AI_USAGE);
  for (const sql of [...GLOSSARY_INDEXES, ...AI_USAGE_INDEXES]) db.exec(sql);

  // Migration: add nickname and avatar_url columns if missing
  const userCols = getDb().prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const colNames = userCols.map((c) => c.name);
  if (!colNames.includes("nickname")) {
    db.exec("ALTER TABLE users ADD COLUMN nickname TEXT");
    console.log("[manager-db] Migrated: added nickname column");
  }
  if (!colNames.includes("avatar_url")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
    console.log("[manager-db] Migrated: added avatar_url column");
  }

  mkdirSync(AVATARS_DIR, { recursive: true });

  // Seed default admin if empty
  const row = db.prepare("SELECT COUNT(*) as count FROM admin").get() as { count: number };
  if (row.count === 0) {
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    db.prepare("INSERT INTO admin (id, username, password_bcrypt) VALUES (1, ?, ?)").run(DEFAULT_USERNAME, hash);
    console.log(`[manager-db] Default admin created (username: ${DEFAULT_USERNAME})`);
  }
}

function getDb(): Database.Database {
  if (!db) throw new Error("Manager DB not initialized. Call initManagerDB() first.");
  return db;
}

/** @internal Inject an external DB instance for testing */
export function __setDb(instance: Database.Database): void {
  db = instance;
}

// ─── Admin CRUD ───

export interface AdminConfig {
  username: string;
  password: string;
}

export function getAdminConfig(): AdminConfig {
  const row = getDb().prepare("SELECT username, password_bcrypt as password FROM admin WHERE id = 1").get() as AdminConfig | undefined;
  if (!row) throw new Error("Admin not found in database");
  return row;
}

export async function updateAdmin(username: string, rawPassword: string): Promise<void> {
  const hash = await bcrypt.hash(rawPassword, 10);
  getDb().prepare("UPDATE admin SET username = ?, password_bcrypt = ? WHERE id = 1").run(username, hash);
  console.log(`[manager-db] Admin updated (${username})`);
}

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  const row = getDb().prepare("SELECT username, password_bcrypt FROM admin WHERE id = 1").get() as { username: string; password_bcrypt: string } | undefined;
  if (!row) return false;
  if (username !== row.username) return false;
  return bcrypt.compare(password, row.password_bcrypt);
}

// ─── AI Presets CRUD ───

function rowToPreset(row: Record<string, unknown>): ModelPreset {
  return {
    id: row.id as string,
    name: row.name as string,
    provider: row.provider as ProviderType,
    model: row.model as string,
    apiKey: row.api_key as string,
    isDefault: Boolean(row.is_default),
    baseURL: (row.base_url as string) || undefined,
  };
}

export function listPresets(): ModelPreset[] {
  const rows = getDb().prepare("SELECT * FROM ai_presets ORDER BY rowid ASC").all() as Record<string, unknown>[];
  return rows.map(rowToPreset);
}

export function getPreset(id: string): ModelPreset | undefined {
  const row = getDb().prepare("SELECT * FROM ai_presets WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToPreset(row) : undefined;
}

export function getDefaultPreset(): ModelPreset | undefined {
  const row = getDb().prepare("SELECT * FROM ai_presets WHERE is_default = 1").get() as Record<string, unknown> | undefined;
  return row ? rowToPreset(row) : undefined;
}

export function createPreset(data: Omit<ModelPreset, "id" | "isDefault">): ModelPreset {
  const presets = listPresets();
  if (presets.some((p) => p.name === data.name)) {
    throw new Error("Preset name already exists");
  }
  const id = randomUUID();
  const isFirst = presets.length === 0;
  getDb().prepare(
    "INSERT INTO ai_presets (id, name, provider, model, api_key, is_default, base_url) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, data.name, data.provider, data.model, data.apiKey, isFirst ? 1 : 0, data.baseURL ?? null);
  return { id, isDefault: isFirst, ...data };
}

export function updatePreset(id: string, patch: Partial<Omit<ModelPreset, "id" | "isDefault">>): ModelPreset {
  const existing = getPreset(id);
  if (!existing) throw new Error("Preset not found");

  if (patch.name !== undefined && patch.name !== existing.name) {
    const dup = getDb().prepare("SELECT id FROM ai_presets WHERE name = ? AND id != ?").get(patch.name, id);
    if (dup) throw new Error("Preset name already exists");
  }

  const name = patch.name ?? existing.name;
  const provider = patch.provider ?? existing.provider;
  const model = patch.model ?? existing.model;
  const apiKey = patch.apiKey === "" ? existing.apiKey : (patch.apiKey ?? existing.apiKey);
  const baseURL = patch.baseURL !== undefined ? patch.baseURL : existing.baseURL;

  getDb().prepare(
    "UPDATE ai_presets SET name = ?, provider = ?, model = ?, api_key = ?, base_url = ? WHERE id = ?"
  ).run(name, provider, model, apiKey, baseURL ?? null, id);

  return { ...existing, name, provider, model, apiKey, baseURL };
}

export function deletePreset(id: string): void {
  const existing = getPreset(id);
  if (!existing) throw new Error("Preset not found");

  // Check scene bindings
  const boundScenes: string[] = [];
  const scenes = getDb().prepare("SELECT scene_type FROM ai_scenes WHERE preset_id = ?").all(id) as { scene_type: string }[];
  for (const s of scenes) {
    boundScenes.push(s.scene_type);
  }
  if (boundScenes.length > 0) {
    const err = new Error(`Preset is used by scenes: ${boundScenes.join(", ")}`) as Error & { scenes?: string[] };
    err.scenes = boundScenes;
    throw err;
  }

  const wasDefault = existing.isDefault;
  getDb().prepare("DELETE FROM ai_presets WHERE id = ?").run(id);

  // Reassign default if needed
  if (wasDefault) {
    const first = getDb().prepare("SELECT id FROM ai_presets ORDER BY rowid ASC LIMIT 1").get() as { id: string } | undefined;
    if (first) {
      getDb().prepare("UPDATE ai_presets SET is_default = 1 WHERE id = ?").run(first.id);
    }
  }
}

export function setDefaultPreset(id: string): void {
  const preset = getPreset(id);
  if (!preset) throw new Error("Preset not found");

  const d = getDb();
  const tx = d.transaction(() => {
    d.prepare("UPDATE ai_presets SET is_default = 0").run();
    d.prepare("UPDATE ai_presets SET is_default = 1 WHERE id = ?").run(id);
  });
  tx();
}

// ─── AI Scenes CRUD ───

export function listScenes(): Partial<Record<SceneType, SceneConfig>> {
  const rows = getDb().prepare("SELECT * FROM ai_scenes").all() as { scene_type: string; preset_id: string | null; temperature: number | null; max_tokens: number | null }[];
  const result: Partial<Record<SceneType, SceneConfig>> = {};
  for (const row of rows) {
    result[row.scene_type as SceneType] = {
      presetId: row.preset_id,
      temperature: row.temperature ?? 0.7,
      maxTokens: row.max_tokens ?? 4096,
    };
  }
  return result;
}

export function updateScenes(scenes: Partial<Record<SceneType, SceneConfig>>): void {
  const d = getDb();
  // Validate preset references
  for (const [, config] of Object.entries(scenes)) {
    if (config?.presetId) {
      const preset = getPreset(config.presetId);
      if (!preset) throw new Error(`Preset not found: ${config.presetId}`);
    }
  }

  const tx = d.transaction(() => {
    for (const [sceneType, config] of Object.entries(scenes)) {
      if (!config) continue;
      d.prepare(`
        INSERT INTO ai_scenes (scene_type, preset_id, temperature, max_tokens)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(scene_type) DO UPDATE SET
          preset_id = excluded.preset_id,
          temperature = excluded.temperature,
          max_tokens = excluded.max_tokens
      `).run(sceneType, config.presetId ?? null, config.temperature ?? null, config.maxTokens ?? null);
    }
  });
  tx();
}

// ─── Users CRUD ───

export interface UserRecord {
  username: string;
  password: string;
  role: "leader" | "member";
  responsibilities: string;
  capabilities: string;
  nickname: string | null;
  avatar_url: string | null;
  createdAt: number;
}

type UserRow = {
  username: string; password_bcrypt: string; role: string;
  responsibilities: string; capabilities: string;
  nickname: string | null; avatar_url: string | null; created_at: number;
};

function rowToUser(r: UserRow): UserRecord {
  return {
    username: r.username,
    password: r.password_bcrypt,
    role: r.role as "leader" | "member",
    responsibilities: r.responsibilities,
    capabilities: r.capabilities,
    nickname: r.nickname,
    avatar_url: r.avatar_url,
    createdAt: r.created_at,
  };
}

export function listUsers(): UserRecord[] {
  const rows = getDb().prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
  return rows.map(rowToUser);
}

export function getUser(username: string): UserRecord | undefined {
  const row = getDb().prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  if (!row) return undefined;
  return rowToUser(row);
}

export async function upsertUser(user: Omit<UserRecord, "createdAt"> & { createdAt?: number }): Promise<UserRecord> {
  const existing = getUser(user.username);
  const now = Date.now();
  const createdAt = user.createdAt ?? existing?.createdAt ?? now;
  const nickname = user.nickname ?? existing?.nickname ?? null;
  const avatarUrl = user.avatar_url ?? existing?.avatar_url ?? null;

  // Hash password if it's not already a bcrypt hash
  const passwordHash = user.password.startsWith("$2") ? user.password : await bcrypt.hash(user.password, 10);

  getDb().prepare(`
    INSERT INTO users (username, password_bcrypt, role, responsibilities, capabilities, nickname, avatar_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_bcrypt = excluded.password_bcrypt,
      role = excluded.role,
      responsibilities = excluded.responsibilities,
      capabilities = excluded.capabilities,
      nickname = excluded.nickname,
      avatar_url = excluded.avatar_url
  `).run(user.username, passwordHash, user.role, user.responsibilities, user.capabilities, nickname, avatarUrl, createdAt);

  return {
    username: user.username,
    password: passwordHash,
    role: user.role,
    responsibilities: user.responsibilities,
    capabilities: user.capabilities,
    nickname,
    avatar_url: avatarUrl,
    createdAt,
  };
}

export function deleteUser(username: string): boolean {
  const user = getUser(username);
  if (user?.avatar_url) {
    const filename = user.avatar_url.split("/").pop();
    if (filename) {
      // Only delete the avatar file if no other user references the same hash
      const others = getDb().prepare("SELECT COUNT(*) as cnt FROM users WHERE avatar_url = ? AND username != ?").get(user.avatar_url, username) as { cnt: number };
      if (others.cnt === 0) {
        const filePath = join(AVATARS_DIR, filename);
        if (existsSync(filePath)) {
          try { unlinkSync(filePath); } catch { /* ignore */ }
        }
      }
    }
  }
  const info = getDb().prepare("DELETE FROM users WHERE username = ?").run(username);
  return info.changes > 0;
}

export async function authenticateUser(username: string, password: string): Promise<UserRecord | null> {
  const user = getUser(username);
  if (!user) return null;
  const match = await bcrypt.compare(password, user.password);
  return match ? user : null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// ─── Glossary CRUD ────────────────────────────────────────────

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  created_at: number;
  updated_at: number;
}

function rowToGlossaryEntry(row: Record<string, unknown>): GlossaryEntry {
  return {
    id: row.id as string,
    term: row.term as string,
    definition: row.definition as string,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
}

export function listGlossary(): GlossaryEntry[] {
  const rows = getDb().prepare("SELECT * FROM glossary ORDER BY term ASC").all() as Record<string, unknown>[];
  return rows.map(rowToGlossaryEntry);
}

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  const row = getDb().prepare("SELECT * FROM glossary WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToGlossaryEntry(row) : undefined;
}

export function createGlossaryEntry(term: string, definition: string): GlossaryEntry {
  const existing = getDb().prepare("SELECT id FROM glossary WHERE term = ?").get(term);
  if (existing) throw new Error("术语已存在");
  const id = randomUUID();
  const now = Date.now();
  getDb().prepare(
    "INSERT INTO glossary (id, term, definition, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, term, definition, now, now);
  return { id, term, definition, created_at: now, updated_at: now };
}

export function updateGlossaryEntry(id: string, term: string, definition: string): GlossaryEntry {
  const existing = getGlossaryEntry(id);
  if (!existing) throw new Error("词汇条目不存在");

  if (term !== existing.term) {
    const dup = getDb().prepare("SELECT id FROM glossary WHERE term = ? AND id != ?").get(term, id);
    if (dup) throw new Error("术语已存在");
  }

  const now = Date.now();
  getDb().prepare(
    "UPDATE glossary SET term = ?, definition = ?, updated_at = ? WHERE id = ?"
  ).run(term, definition, now, id);

  return { ...existing, term, definition, updated_at: now };
}

export function deleteGlossaryEntry(id: string): void {
  const existing = getGlossaryEntry(id);
  if (!existing) throw new Error("词汇条目不存在");
  getDb().prepare("DELETE FROM glossary WHERE id = ?").run(id);
}

// ─── AI Usage Tracking ──────────────────────────────────────────

export interface UsageRecord {
  team: string;
  username: string;
  scene: string;
  presetId: string;
  promptTokens: number;
  completionTokens: number;
}

export function recordUsage(record: UsageRecord): void {
  try {
    getDb().prepare(
      "INSERT INTO ai_usage (team, username, scene, preset_id, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(record.team, record.username, record.scene, record.presetId, record.promptTokens, record.completionTokens, Date.now());
  } catch (e) {
    console.error("[ai-usage] Failed to record usage:", e);
  }
}

export interface UsageQueryFilter {
  from?: number;
  to?: number;
  team?: string;
  username?: string;
  scene?: string;
  group?: "team" | "username" | "scene" | "day";
}

export interface UsageResult {
  total: { promptTokens: number; completionTokens: number; calls: number };
  breakdown: Array<{
    key: string;
    promptTokens: number;
    completionTokens: number;
    calls: number;
  }>;
}

export function queryUsage(filter: UsageQueryFilter = {}): UsageResult {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.from) { conditions.push("created_at >= ?"); params.push(filter.from); }
  if (filter.to) { conditions.push("created_at <= ?"); params.push(filter.to); }
  if (filter.team) { conditions.push("team = ?"); params.push(filter.team); }
  if (filter.username) { conditions.push("username = ?"); params.push(filter.username); }
  if (filter.scene) { conditions.push("scene = ?"); params.push(filter.scene); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Total
  const totalRow = getDb().prepare(
    `SELECT COALESCE(SUM(prompt_tokens), 0) as pt, COALESCE(SUM(completion_tokens), 0) as ct, COUNT(*) as calls FROM ai_usage ${where}`
  ).get(...params) as { pt: number; ct: number; calls: number };

  const total = { promptTokens: totalRow.pt, completionTokens: totalRow.ct, calls: totalRow.calls };

  // Breakdown
  let breakdown: UsageResult["breakdown"] = [];
  if (filter.group) {
    let groupExpr: string;
    switch (filter.group) {
      case "day": groupExpr = "date(created_at / 1000, 'unixepoch')"; break;
      case "team": groupExpr = "team"; break;
      case "username": groupExpr = "username"; break;
      case "scene": groupExpr = "scene"; break;
    }
    const rows = getDb().prepare(
      `SELECT ${groupExpr} as key, COALESCE(SUM(prompt_tokens), 0) as pt, COALESCE(SUM(completion_tokens), 0) as ct, COUNT(*) as calls FROM ai_usage ${where} GROUP BY ${groupExpr} ORDER BY ${filter.group === "day" ? "key ASC" : "ct DESC"}`
    ).all(...params) as Array<{ key: string; pt: number; ct: number; calls: number }>;

    breakdown = rows.map(r => ({ key: r.key, promptTokens: r.pt, completionTokens: r.ct, calls: r.calls }));
  }

  return { total, breakdown };
}
