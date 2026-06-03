import { describe, it, expect, beforeEach } from "vitest";
import { createManagerDB } from "../helpers/manager-db.js";
import { __setDb, listGlossary, getGlossaryEntry, createGlossaryEntry, updateGlossaryEntry, deleteGlossaryEntry } from "../../manager-db.js";

function init() {
  const db = createManagerDB();
  __setDb(db);
  return db;
}

describe("Global Glossary CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("starts with empty glossary", () => {
    expect(listGlossary()).toEqual([]);
  });

  it("createGlossaryEntry returns entry with id and timestamps", () => {
    const entry = createGlossaryEntry("执行计划", "Agent 对任务的分步实施方案");
    expect(entry.id).toBeDefined();
    expect(entry.term).toBe("执行计划");
    expect(entry.definition).toBe("Agent 对任务的分步实施方案");
    expect(entry.created_at).toBeTypeOf("number");
    expect(entry.updated_at).toBeTypeOf("number");
  });

  it("listGlossary returns all entries sorted by term", () => {
    createGlossaryEntry("验收标准", "判断任务是否完成的条件");
    createGlossaryEntry("执行计划", "Agent 对任务的分步实施方案");
    const list = listGlossary();
    expect(list).toHaveLength(2);
    expect(list[0].term).toBe("执行计划");
    expect(list[1].term).toBe("验收标准");
  });

  it("getGlossaryEntry returns entry by id", () => {
    const created = createGlossaryEntry("术语A", "释义A");
    const found = getGlossaryEntry(created.id);
    expect(found).toBeDefined();
    expect(found!.term).toBe("术语A");
  });

  it("getGlossaryEntry returns undefined for unknown id", () => {
    expect(getGlossaryEntry("ghost")).toBeUndefined();
  });

  it("duplicate term throws", () => {
    createGlossaryEntry("重复术语", "释义1");
    expect(() => createGlossaryEntry("重复术语", "释义2")).toThrow("术语已存在");
  });

  it("updateGlossaryEntry changes term and definition", () => {
    const entry = createGlossaryEntry("旧术语", "旧释义");
    const updated = updateGlossaryEntry(entry.id, "新术语", "新释义");
    expect(updated.term).toBe("新术语");
    expect(updated.definition).toBe("新释义");
    expect(updated.updated_at).toBeGreaterThanOrEqual(entry.created_at);
  });

  it("updateGlossaryEntry with duplicate term of another entry throws", () => {
    createGlossaryEntry("已有术语", "释义");
    const entry = createGlossaryEntry("其他术语", "释义");
    expect(() => updateGlossaryEntry(entry.id, "已有术语", "新释义")).toThrow("术语已存在");
  });

  it("updateGlossaryEntry allows keeping same term", () => {
    const entry = createGlossaryEntry("不变术语", "旧释义");
    const updated = updateGlossaryEntry(entry.id, "不变术语", "新释义");
    expect(updated.term).toBe("不变术语");
    expect(updated.definition).toBe("新释义");
  });

  it("updateGlossaryEntry on non-existent throws", () => {
    expect(() => updateGlossaryEntry("ghost", "术语", "释义")).toThrow("词汇条目不存在");
  });

  it("deleteGlossaryEntry removes entry", () => {
    const entry = createGlossaryEntry("待删除", "释义");
    deleteGlossaryEntry(entry.id);
    expect(getGlossaryEntry(entry.id)).toBeUndefined();
    expect(listGlossary()).toHaveLength(0);
  });

  it("deleteGlossaryEntry on non-existent throws", () => {
    expect(() => deleteGlossaryEntry("ghost")).toThrow("词汇条目不存在");
  });

  it("full CRUD lifecycle", () => {
    // Create
    const entry = createGlossaryEntry("生命周期", "测试完整流程");
    expect(listGlossary()).toHaveLength(1);

    // Read
    const found = getGlossaryEntry(entry.id);
    expect(found!.definition).toBe("测试完整流程");

    // Update
    updateGlossaryEntry(entry.id, "生命周期", "更新后的释义");
    expect(getGlossaryEntry(entry.id)!.definition).toBe("更新后的释义");

    // Delete
    deleteGlossaryEntry(entry.id);
    expect(listGlossary()).toHaveLength(0);
  });
});
