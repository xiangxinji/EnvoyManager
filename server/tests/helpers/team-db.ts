import Database from "better-sqlite3";

const SCHEMA = {
  messages: `
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
      channel    TEXT,
      mentions   TEXT,
      created_at INTEGER NOT NULL
    )`,
  messageIndexes: [
    "CREATE INDEX IF NOT EXISTS idx_sync ON messages(seq)",
    "CREATE INDEX IF NOT EXISTS idx_conversation ON messages(from_user, to_user)",
    "CREATE INDEX IF NOT EXISTS idx_channel ON messages(channel)",
  ],
  tasks: `
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
    )`,
  taskIndexes: [
    "CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status)",
    "CREATE INDEX IF NOT EXISTS idx_task_created ON tasks(created_at)",
  ],
  cloudFiles: `
    CREATE TABLE IF NOT EXISTS cloud_files (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      parent_id   TEXT,
      type        TEXT NOT NULL DEFAULT 'file',
      size        INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
  cloudFileIndexes: [
    "CREATE INDEX IF NOT EXISTS idx_cloud_parent_id ON cloud_files(parent_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_parent_name ON cloud_files(parent_id, name)",
  ],
  stickers: `
    CREATE TABLE IF NOT EXISTS stickers (
      id         TEXT PRIMARY KEY NOT NULL,
      user_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      filename   TEXT NOT NULL,
      size       INTEGER NOT NULL DEFAULT 0,
      mime_type  TEXT NOT NULL DEFAULT 'image/png',
      file_hash  TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )`,
  stickerIndexes: [
    "CREATE INDEX IF NOT EXISTS idx_sticker_user ON stickers(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sticker_hash ON stickers(file_hash)",
  ],
  glossary: `
    CREATE TABLE IF NOT EXISTS glossary (
      id         TEXT PRIMARY KEY NOT NULL,
      term       TEXT NOT NULL,
      definition TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  glossaryIndexes: [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_term ON glossary(term)",
  ],
};

export function createTeamDB(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA.messages);
  db.exec(SCHEMA.tasks);
  db.exec(SCHEMA.cloudFiles);
  db.exec(SCHEMA.stickers);
  db.exec(SCHEMA.glossary);
  for (const sql of [...SCHEMA.messageIndexes, ...SCHEMA.taskIndexes, ...SCHEMA.cloudFileIndexes, ...SCHEMA.stickerIndexes, ...SCHEMA.glossaryIndexes]) {
    db.exec(sql);
  }
  return db;
}
