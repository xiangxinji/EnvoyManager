import Database from "better-sqlite3";
import { publicEncrypt, constants } from "node:crypto";
import bcrypt from "bcryptjs";
import { initCrypto, getPublicKey } from "../../crypto.js";
import { createManagerDB, seedAdmin } from "../helpers/manager-db.js";
import { __setDb } from "../../manager-db.js";

let _cryptoInitialized = false;

/** Initialize RSA key pair once for all tests */
export function ensureCrypto() {
  if (!_cryptoInitialized) {
    initCrypto();
    _cryptoInitialized = true;
  }
}

/** Encrypt a plaintext password with RSA-OAEP SHA-256, matching the frontend */
export function encryptPassword(plaintext: string): string {
  ensureCrypto();
  const pub = getPublicKey();
  return publicEncrypt(
    { key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha-256" },
    Buffer.from(plaintext, "utf-8"),
  ).toString("base64");
}

/** Create a fresh in-memory manager DB, inject it, seed default admin */
export function setupDB() {
  const db = createManagerDB();
  __setDb(db);
  seedAdmin(db);
  return db;
}

/** Insert a test user with bcrypt-hashed password directly into the DB */
export function seedUser(db: Database.Database, username: string, password: string, role: "leader" | "member" = "member") {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password_bcrypt, role, responsibilities, capabilities, created_at) VALUES (?, ?, ?, '', '', ?)",
  ).run(username, hash, role, Date.now());
}
