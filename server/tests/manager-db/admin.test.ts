import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { createManagerDB, seedAdmin } from "../helpers/manager-db.js";
import { __setDb } from "../../manager-db.js";
import {
  getAdminConfig,
  updateAdmin,
  verifyAdmin,
} from "../../manager-db.js";

function init() {
  const db = createManagerDB();
  __setDb(db);
  return db;
}

describe("Admin CRUD", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = init();
  });

  it("getAdminConfig throws when no admin exists", () => {
    expect(() => getAdminConfig()).toThrow("Admin not found");
  });

  it("seed + getAdminConfig returns admin record", async () => {
    await seedAdmin(db);
    const config = getAdminConfig();
    expect(config.username).toBe("admin");
    expect(config.password).toMatch(/^\$2/);
  });

  it("updateAdmin changes username and password", async () => {
    await seedAdmin(db);
    await updateAdmin("newadmin", "newpass");
    const config = getAdminConfig();
    expect(config.username).toBe("newadmin");
    const match = await bcrypt.compare("newpass", config.password);
    expect(match).toBe(true);
  });

  it("verifyAdmin succeeds with correct credentials", async () => {
    await seedAdmin(db, "testuser", "testpass");
    const ok = await verifyAdmin("testuser", "testpass");
    expect(ok).toBe(true);
  });

  it("verifyAdmin fails with wrong username", async () => {
    await seedAdmin(db);
    const ok = await verifyAdmin("wrong", "admin123");
    expect(ok).toBe(false);
  });

  it("verifyAdmin fails with wrong password", async () => {
    await seedAdmin(db);
    const ok = await verifyAdmin("admin", "wrong");
    expect(ok).toBe(false);
  });
});
