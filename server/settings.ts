import type { ModelPreset, SceneType, SceneConfig, AIConfig } from "../../shared/types/ai.js";
import type { LanguageModelV1 } from "ai";
import { resolveModel } from "./services/ai/provider.js";
import { DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "./services/ai/constants.js";
import {
  getAdminConfig as dbGetAdminConfig,
  updateAdmin as dbUpdateAdmin,
  verifyAdmin as dbVerifyAdmin,
  listPresets,
  getPreset as dbGetPreset,
  getDefaultPreset as dbGetDefaultPreset,
  createPreset as dbCreatePreset,
  updatePreset as dbUpdatePreset,
  deletePreset as dbDeletePreset,
  setDefaultPreset as dbSetDefaultPreset,
  listScenes,
  updateScenes as dbUpdateScenes,
} from "./manager-db.js";

// Re-export types for backward compatibility
export type { AdminConfig } from "./manager-db.js";

// ─── Admin ───

export function getAdminConfig() {
  return dbGetAdminConfig();
}

export async function updateAdmin(username: string, password: string): Promise<void> {
  return dbUpdateAdmin(username, password);
}

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  return dbVerifyAdmin(username, password);
}

// ─── AI Config (aggregate view) ───

export function getAIConfig(): AIConfig {
  return {
    presets: listPresets(),
    scenes: listScenes(),
  };
}

// ─── Preset CRUD ───

export function getPreset(id: string): ModelPreset | undefined {
  return dbGetPreset(id);
}

export function getDefaultPreset(): ModelPreset | undefined {
  return dbGetDefaultPreset();
}

export async function createPreset(data: Omit<ModelPreset, "id" | "isDefault">): Promise<ModelPreset> {
  return dbCreatePreset(data);
}

export async function updatePreset(id: string, patch: Partial<Omit<ModelPreset, "id" | "isDefault">>): Promise<ModelPreset> {
  return dbUpdatePreset(id, patch);
}

export async function deletePreset(id: string): Promise<void> {
  return dbDeletePreset(id);
}

export async function setDefaultPreset(id: string): Promise<void> {
  return dbSetDefaultPreset(id);
}

// ─── Scene Configuration ───

export function getScenes(): Partial<Record<SceneType, SceneConfig>> {
  return listScenes();
}

export async function updateScenes(scenes: Partial<Record<SceneType, SceneConfig>>): Promise<void> {
  return dbUpdateScenes(scenes);
}

// ─── Runtime Resolution ───

export interface ResolvedScene {
  model: LanguageModelV1;
  temperature: number;
  maxTokens: number;
}

export function resolveForScene(sceneType: SceneType): ResolvedScene {
  const scenes = listScenes();
  const sceneConfig = scenes[sceneType];

  let preset: ModelPreset | undefined;
  if (sceneConfig?.presetId) {
    preset = dbGetPreset(sceneConfig.presetId);
  }
  if (!preset) {
    preset = dbGetDefaultPreset();
  }
  if (!preset) {
    throw new Error("AI not configured");
  }

  const model = resolveModel({
    provider: preset.provider,
    apiKey: preset.apiKey,
    model: preset.model,
    baseURL: preset.baseURL,
  });

  return {
    model,
    temperature: sceneConfig?.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: sceneConfig?.maxTokens ?? DEFAULT_MAX_TOKENS,
  };
}
