import { describe, it, expect, beforeEach } from "vitest";
import { createManagerDB } from "../helpers/manager-db.js";
import { __setDb, createPreset } from "../../manager-db.js";
import { listScenes, updateScenes } from "../../manager-db.js";

function init() {
  const db = createManagerDB();
  __setDb(db);
  return db;
}

describe("AI Scenes CRUD", () => {
  beforeEach(() => {
    init();
  });

  it("starts with empty scenes", () => {
    expect(listScenes()).toEqual({});
  });

  it("updateScenes creates scene config", () => {
    const p = createPreset({ name: "test", provider: "openai", model: "a", apiKey: "k" });
    updateScenes({ chat: { presetId: p.id, temperature: 0.5, maxTokens: 2048 } });
    const scenes = listScenes();
    expect(scenes.chat).toBeDefined();
    expect(scenes.chat!.presetId).toBe(p.id);
    expect(scenes.chat!.temperature).toBe(0.5);
    expect(scenes.chat!.maxTokens).toBe(2048);
  });

  it("updateScenes with invalid presetId throws", () => {
    expect(() => updateScenes({ chat: { presetId: "ghost", temperature: 0.7, maxTokens: 4096 } })).toThrow("not found");
  });

  it("updateScenes upserts existing scene", () => {
    const p1 = createPreset({ name: "p1", provider: "openai", model: "a", apiKey: "k" });
    const p2 = createPreset({ name: "p2", provider: "anthropic", model: "b", apiKey: "k2" });
    updateScenes({ chat: { presetId: p1.id, temperature: 0.5, maxTokens: 2048 } });
    updateScenes({ chat: { presetId: p2.id, temperature: 0.9, maxTokens: 8192 } });
    const scenes = listScenes();
    expect(scenes.chat!.presetId).toBe(p2.id);
    expect(scenes.chat!.temperature).toBe(0.9);
  });

  it("updateScenes handles multiple scenes", () => {
    const p = createPreset({ name: "multi", provider: "openai", model: "a", apiKey: "k" });
    updateScenes({
      chat: { presetId: p.id, temperature: 0.5, maxTokens: 2048 },
      task: { presetId: null, temperature: 0.3, maxTokens: 1024 },
    });
    const scenes = listScenes();
    expect(Object.keys(scenes)).toHaveLength(2);
    expect(scenes.chat!.presetId).toBe(p.id);
    expect(scenes.task!.presetId).toBeNull();
  });
});
