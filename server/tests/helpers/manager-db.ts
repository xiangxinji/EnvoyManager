import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

const SCHEMA = {
  admin: `
    CREATE TABLE IF NOT EXISTS admin (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      username        TEXT NOT NULL,
      password_bcrypt TEXT NOT NULL
    )`,
  aiPresets: `
    CREATE TABLE IF NOT EXISTS ai_presets (
      id         TEXT PRIMARY KEY NOT NULL,
      name       TEXT UNIQUE NOT NULL,
      provider   TEXT NOT NULL,
      model      TEXT NOT NULL,
      api_key    TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      base_url   TEXT
    )`,
  aiScenes: `
    CREATE TABLE IF NOT EXISTS ai_scenes (
      scene_type  TEXT PRIMARY KEY NOT NULL,
      preset_id   TEXT,
      temperature REAL,
      max_tokens  INTEGER,
      FOREIGN KEY (preset_id) REFERENCES ai_presets(id)
    )`,
  users: `
    CREATE TABLE IF NOT EXISTS users (
      username        TEXT PRIMARY KEY NOT NULL,
      password_bcrypt TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'member',
      responsibilities TEXT NOT NULL DEFAULT '',
      capabilities    TEXT NOT NULL DEFAULT '',
      created_at      INTEGER NOT NULL,
      nickname        TEXT,
      avatar_url      TEXT
    )`,
};

export function createManagerDB(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA.admin);
  db.exec(SCHEMA.aiPresets);
  db.exec(SCHEMA.aiScenes);
  db.exec(SCHEMA.users);
  return db;
}

export async function seedAdmin(db: Database.Database, username = "admin", password = "admin123") {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO admin (id, username, password_bcrypt) VALUES (1, ?, ?)").run(username, hash);
}
