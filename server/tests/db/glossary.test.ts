import { describe, it, expect, beforeEach } from "vitest";
import { createTeamDB } from "../helpers/team-db.js";
import {
  __setTeamDb,
  listTeamGlossary,
  createTeamGlossaryEntry,
  updateTeamGlossaryEntry,
  deleteTeamGlossaryEntry,
} from "../../db.js";

const TEAM = "test-team";

function init() {
  const db = createTeamDB();
  __setTeamDb(TEAM, db);
  return db;
}

describe("Team Glossary CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("starts with empty glossary", () => {
    expect(listTeamGlossary(TEAM)).toEqual([]);
  });

  it("createTeamGlossaryEntry returns entry with id and timestamps", () => {
    const entry = createTeamGlossaryEntry(TEAM, "团队术语", "团队专属释义");
    expect(entry.id).toBeDefined();
    expect(entry.term).toBe("团队术语");
    expect(entry.definition).toBe("团队专属释义");
    expect(entry.created_at).toBeTypeOf("number");
    expect(entry.updated_at).toBeTypeOf("number");
  });

  it("listTeamGlossary returns entries sorted by term", () => {
    createTeamGlossaryEntry(TEAM, "乙术语", "释义2");
    createTeamGlossaryEntry(TEAM, "甲术语", "释义1");
    const list = listTeamGlossary(TEAM);
    expect(list).toHaveLength(2);
    // SQLite ORDER BY uses UTF-8 byte order for CJK: 乙 < 甲
    expect(list[0].term).toBe("乙术语");
    expect(list[1].term).toBe("甲术语");
  });

  it("different teams have independent glossaries", () => {
    const db = createTeamDB();
    __setTeamDb("other-team", db);

    createTeamGlossaryEntry(TEAM, "共享术语", "A 团队释义");
    expect(listTeamGlossary(TEAM)).toHaveLength(1);
    expect(listTeamGlossary("other-team")).toHaveLength(0);
  });

  it("duplicate term throws", () => {
    createTeamGlossaryEntry(TEAM, "重复术语", "释义1");
    expect(() => createTeamGlossaryEntry(TEAM, "重复术语", "释义2")).toThrow("术语已存在");
  });

  it("updateTeamGlossaryEntry changes term and definition", () => {
    const entry = createTeamGlossaryEntry(TEAM, "旧术语", "旧释义");
    const updated = updateTeamGlossaryEntry(TEAM, entry.id, "新术语", "新释义");
    expect(updated.term).toBe("新术语");
    expect(updated.definition).toBe("新释义");
    expect(updated.updated_at).toBeGreaterThanOrEqual(entry.created_at);
  });

  it("updateTeamGlossaryEntry with duplicate term of another entry throws", () => {
    createTeamGlossaryEntry(TEAM, "已有术语", "释义");
    const entry = createTeamGlossaryEntry(TEAM, "其他术语", "释义");
    expect(() => updateTeamGlossaryEntry(TEAM, entry.id, "已有术语", "新释义")).toThrow("术语已存在");
  });

  it("updateTeamGlossaryEntry allows keeping same term", () => {
    const entry = createTeamGlossaryEntry(TEAM, "不变术语", "旧释义");
    const updated = updateTeamGlossaryEntry(TEAM, entry.id, "不变术语", "新释义");
    expect(updated.term).toBe("不变术语");
    expect(updated.definition).toBe("新释义");
  });

  it("updateTeamGlossaryEntry on non-existent throws", () => {
    expect(() => updateTeamGlossaryEntry(TEAM, "ghost", "术语", "释义")).toThrow("词汇条目不存在");
  });

  it("deleteTeamGlossaryEntry removes entry", () => {
    const entry = createTeamGlossaryEntry(TEAM, "待删除", "释义");
    deleteTeamGlossaryEntry(TEAM, entry.id);
    expect(listTeamGlossary(TEAM)).toHaveLength(0);
  });

  it("deleteTeamGlossaryEntry on non-existent throws", () => {
    expect(() => deleteTeamGlossaryEntry(TEAM, "ghost")).toThrow("词汇条目不存在");
  });

  it("full CRUD lifecycle", () => {
    // Create
    const entry = createTeamGlossaryEntry(TEAM, "生命周期", "测试完整流程");
    expect(listTeamGlossary(TEAM)).toHaveLength(1);

    // Update
    updateTeamGlossaryEntry(TEAM, entry.id, "生命周期", "更新后的释义");
    const list = listTeamGlossary(TEAM);
    expect(list[0].definition).toBe("更新后的释义");

    // Delete
    deleteTeamGlossaryEntry(TEAM, entry.id);
    expect(listTeamGlossary(TEAM)).toHaveLength(0);
  });
});
