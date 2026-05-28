import { describe, it, expect, beforeEach } from "vitest";
import { createManagerDB } from "../helpers/manager-db.js";
import { __setDb } from "../../manager-db.js";
import {
  listPresets,
  getPreset,
  getDefaultPreset,
  createPreset,
  updatePreset,
  deletePreset,
  setDefaultPreset,
} from "../../manager-db.js";

function init() {
  const db = createManagerDB();
  __setDb(db);
  return db;
}

describe("AI Presets CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("starts with empty presets list", () => {
    expect(listPresets()).toEqual([]);
  });

  it("createPreset returns a preset with id and isDefault=true for first", () => {
    const p = createPreset({
      name: "gpt-4o",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test",
    });
    expect(p.id).toBeDefined();
    expect(p.isDefault).toBe(true);
    expect(p.name).toBe("gpt-4o");
  });

  it("second preset is not default", () => {
    createPreset({ name: "first", provider: "openai", model: "a", apiKey: "k1" });
    const second = createPreset({ name: "second", provider: "anthropic", model: "b", apiKey: "k2" });
    expect(second.isDefault).toBe(false);
  });

  it("duplicate name throws", () => {
    createPreset({ name: "dup", provider: "openai", model: "a", apiKey: "k" });
    expect(() => createPreset({ name: "dup", provider: "openai", model: "b", apiKey: "k2" })).toThrow("already exists");
  });

  it("listPresets returns all", () => {
    createPreset({ name: "p1", provider: "openai", model: "a", apiKey: "k" });
    createPreset({ name: "p2", provider: "anthropic", model: "b", apiKey: "k2" });
    expect(listPresets()).toHaveLength(2);
  });

  it("getPreset returns by id", () => {
    const created = createPreset({ name: "find-me", provider: "openai", model: "a", apiKey: "k" });
    const found = getPreset(created.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe("find-me");
  });

  it("getPreset returns undefined for unknown id", () => {
    expect(getPreset("ghost")).toBeUndefined();
  });

  it("getDefaultPreset returns the default", () => {
    createPreset({ name: "default-one", provider: "openai", model: "a", apiKey: "k" });
    const d = getDefaultPreset();
    expect(d).toBeDefined();
    expect(d!.isDefault).toBe(true);
  });

  it("updatePreset changes fields", () => {
    const p = createPreset({ name: "original", provider: "openai", model: "a", apiKey: "k" });
    const updated = updatePreset(p.id, { name: "renamed", model: "gpt-4o-mini" });
    expect(updated.name).toBe("renamed");
    expect(updated.model).toBe("gpt-4o-mini");
  });

  it("updatePreset with duplicate name throws", () => {
    createPreset({ name: "a", provider: "openai", model: "a", apiKey: "k" });
    const b = createPreset({ name: "b", provider: "openai", model: "b", apiKey: "k2" });
    expect(() => updatePreset(b.id, { name: "a" })).toThrow("already exists");
  });

  it("updatePreset on non-existent throws", () => {
    expect(() => updatePreset("ghost", { name: "x" })).toThrow("not found");
  });

  it("deletePreset removes preset", () => {
    const p = createPreset({ name: "to-delete", provider: "openai", model: "a", apiKey: "k" });
    deletePreset(p.id);
    expect(getPreset(p.id)).toBeUndefined();
  });

  it("deletePreset on non-existent throws", () => {
    expect(() => deletePreset("ghost")).toThrow("not found");
  });

  it("deleting default promotes next preset to default", () => {
    const first = createPreset({ name: "first", provider: "openai", model: "a", apiKey: "k" });
    const second = createPreset({ name: "second", provider: "anthropic", model: "b", apiKey: "k2" });
    deletePreset(first.id);
    expect(getPreset(second.id)!.isDefault).toBe(true);
    expect(getDefaultPreset()!.id).toBe(second.id);
  });

  it("deletePreset bound to scenes throws with scene names", () => {
    const db = createManagerDB();
    __setDb(db);
    const p = createPreset({ name: "bound", provider: "openai", model: "a", apiKey: "k" });
    db.prepare("INSERT INTO ai_scenes (scene_type, preset_id) VALUES (?, ?)").run("chat", p.id);
    const err = (() => { try { deletePreset(p.id); } catch (e) { return e; } })() as Error & { scenes?: string[] };
    expect(err.message).toContain("used by scenes");
    expect(err.scenes).toContain("chat");
  });

  it("setDefaultPreset changes default", () => {
    createPreset({ name: "old-default", provider: "openai", model: "a", apiKey: "k" });
    const newDefault = createPreset({ name: "new-default", provider: "anthropic", model: "b", apiKey: "k2" });
    setDefaultPreset(newDefault.id);
    expect(getDefaultPreset()!.id).toBe(newDefault.id);
    expect(getPreset(newDefault.id)!.isDefault).toBe(true);
  });

  it("setDefaultPreset on non-existent throws", () => {
    expect(() => setDefaultPreset("ghost")).toThrow("not found");
  });
});
