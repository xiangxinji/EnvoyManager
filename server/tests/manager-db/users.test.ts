import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { createManagerDB } from "../helpers/manager-db.js";
import { __setDb } from "../../manager-db.js";
import { listUsers, getUser, upsertUser, deleteUser, authenticateUser, hashPassword } from "../../manager-db.js";

function init() {
  const db = createManagerDB();
  __setDb(db);
  return db;
}

describe("Users CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("starts with empty users list", () => {
    expect(listUsers()).toEqual([]);
  });

  it("upsertUser creates a user", async () => {
    const user = await upsertUser({
      username: "alice",
      password: "secret",
      role: "leader",
      responsibilities: "coding",
      capabilities: "js,ts",
    });
    expect(user.username).toBe("alice");
    expect(user.role).toBe("leader");
    expect(user.password).toMatch(/^\$2/);
  });

  it("getUser returns created user", async () => {
    await upsertUser({
      username: "bob",
      password: "pass",
      role: "member",
      responsibilities: "",
      capabilities: "",
    });
    const user = getUser("bob");
    expect(user).toBeDefined();
    expect(user!.username).toBe("bob");
    expect(user!.role).toBe("member");
  });

  it("getUser returns undefined for unknown user", () => {
    expect(getUser("ghost")).toBeUndefined();
  });

  it("upsertUser updates existing user", async () => {
    await upsertUser({ username: "charlie", password: "old", role: "member", responsibilities: "", capabilities: "" });
    await upsertUser({ username: "charlie", password: "new", role: "leader", responsibilities: "all", capabilities: "everything" });
    const user = getUser("charlie")!;
    expect(user.role).toBe("leader");
    expect(user.responsibilities).toBe("all");
    expect(await bcrypt.compare("new", user.password)).toBe(true);
  });

  it("upsertUser with bcrypt hash does not re-hash", async () => {
    const hash = await bcrypt.hash("rawpass", 10);
    const user = await upsertUser({ username: "hashed", password: hash, role: "member", responsibilities: "", capabilities: "" });
    expect(user.password).toBe(hash);
  });

  it("upsertUser preserves nickname and avatar_url on update", async () => {
    await upsertUser({ username: "nick", password: "p", role: "member", responsibilities: "", capabilities: "", nickname: "Nick" });
    await upsertUser({ username: "nick", password: "p2", role: "member", responsibilities: "", capabilities: "", avatar_url: "/avatar.png" });
    const user = getUser("nick")!;
    expect(user.nickname).toBe("Nick");
    expect(user.avatar_url).toBe("/avatar.png");
  });

  it("listUsers returns all users ordered by created_at", async () => {
    await upsertUser({ username: "u1", password: "p", role: "member", responsibilities: "", capabilities: "" });
    await upsertUser({ username: "u2", password: "p", role: "leader", responsibilities: "", capabilities: "" });
    const users = listUsers();
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.username)).toEqual(["u1", "u2"]);
  });

  it("deleteUser removes user and returns true", async () => {
    await upsertUser({ username: "del-me", password: "p", role: "member", responsibilities: "", capabilities: "" });
    expect(deleteUser("del-me")).toBe(true);
    expect(getUser("del-me")).toBeUndefined();
  });

  it("deleteUser returns false for non-existent", () => {
    expect(deleteUser("ghost")).toBe(false);
  });

  it("authenticateUser succeeds with correct password", async () => {
    await upsertUser({ username: "auth", password: "mypass", role: "member", responsibilities: "", capabilities: "" });
    const user = await authenticateUser("auth", "mypass");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("auth");
  });

  it("authenticateUser fails with wrong password", async () => {
    await upsertUser({ username: "auth", password: "mypass", role: "member", responsibilities: "", capabilities: "" });
    expect(await authenticateUser("auth", "wrong")).toBeNull();
  });

  it("authenticateUser fails for non-existent user", async () => {
    expect(await authenticateUser("ghost", "pass")).toBeNull();
  });

  it("hashPassword returns bcrypt hash", async () => {
    const hash = await hashPassword("test");
    expect(hash).toMatch(/^\$2/);
    expect(await bcrypt.compare("test", hash)).toBe(true);
  });
});
