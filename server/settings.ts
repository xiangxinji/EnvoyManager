import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { ModelPreset, SceneType, SceneConfig, AIConfig, ProviderType } from "../../shared/types/ai.js";
import type { LanguageModelV1 } from "ai";
import { resolveModel } from "./services/ai/provider.js";
import { DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "./services/ai/constants.js";

export interface AdminConfig {
  username: string;
  password: string; // bcrypt hash
}

export interface LegacyAIFields {
  provider?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AppSettings {
  admin: AdminConfig;
  ai: AIConfig;
  ai_legacy?: LegacyAIFields;
}

const SETTINGS_PATH = join(homedir(), ".envoy", "manager.json");
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin123";

const DEFAULT_AI: AIConfig = {
  presets: [],
  scenes: {},
};

export async function loadSettings(): Promise<AppSettings> {
  if (existsSync(SETTINGS_PATH)) {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as AppSettings & Record<string, unknown>;

    // Legacy migration: old format had ai.provider but no ai.presets
    if (parsed.ai && !Array.isArray((parsed.ai as Record<string, unknown>).presets)) {
      const legacy = parsed.ai as unknown as LegacyAIFields;
      console.log("[settings] Migrating legacy AI config to presets format...");
      const preset: ModelPreset = {
        id: randomUUID(),
        name: legacy.provider ?? "openai",
        provider: (legacy.provider ?? "openai") as ProviderType,
        model: legacy.model ?? "gpt-4o",
        apiKey: legacy.apiKey ?? "",
        isDefault: true,
      };
      const migrated: AIConfig = {
        presets: preset.apiKey ? [preset] : [],
        scenes: {},
      };
      parsed.ai = migrated;
      parsed.ai_legacy = { ...legacy };
      await saveSettings(parsed as AppSettings);
      console.log("[settings] Migration complete.");
    } else {
      parsed.ai = { ...DEFAULT_AI, ...parsed.ai };
    }

    return parsed as AppSettings;
  }

  // First launch
  const settings: AppSettings = {
    admin: {
      username: DEFAULT_USERNAME,
      password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
    },
    ai: { ...DEFAULT_AI },
  };
  await saveSettings(settings);
  console.log(`[settings] Default admin created (username: ${DEFAULT_USERNAME}, password: ${DEFAULT_PASSWORD})`);
  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const dir = join(homedir(), ".envoy");
  await mkdir(dir, { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

let settings: AppSettings;

export async function initSettings() {
  settings = await loadSettings();
}

export function getAdminConfig(): AdminConfig {
  return settings.admin;
}

export function getAIConfig(): AIConfig {
  return settings.ai;
}

export async function updateAdmin(username: string, password: string): Promise<void> {
  settings.admin = { username, password: await bcrypt.hash(password, 10) };
  await saveSettings(settings);
  console.log(`[settings] Admin updated (${username})`);
}

// ─── Preset CRUD ───

export function getPreset(id: string): ModelPreset | undefined {
  return settings.ai.presets.find((p) => p.id === id);
}

export function getDefaultPreset(): ModelPreset | undefined {
  return settings.ai.presets.find((p) => p.isDefault);
}

export async function createPreset(data: Omit<ModelPreset, "id" | "isDefault">): Promise<ModelPreset> {
  if (settings.ai.presets.some((p) => p.name === data.name)) {
    throw new Error("Preset name already exists");
  }
  const isFirst = settings.ai.presets.length === 0;
  const preset: ModelPreset = {
    id: randomUUID(),
    isDefault: isFirst,
    ...data,
  };
  settings.ai.presets.push(preset);
  await saveSettings(settings);
  return preset;
}

export async function updatePreset(id: string, patch: Partial<Omit<ModelPreset, "id" | "isDefault">>): Promise<ModelPreset> {
  const idx = settings.ai.presets.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Preset not found");

  if (patch.name !== undefined && patch.name !== settings.ai.presets[idx].name) {
    if (settings.ai.presets.some((p) => p.name === patch.name)) {
      throw new Error("Preset name already exists");
    }
  }

  const existing = settings.ai.presets[idx];
  settings.ai.presets[idx] = {
    ...existing,
    ...patch,
    id: existing.id,
    isDefault: existing.isDefault,
    // Keep existing apiKey if patch provides empty string
    apiKey: patch.apiKey === "" ? existing.apiKey : (patch.apiKey ?? existing.apiKey),
  };
  await saveSettings(settings);
  return settings.ai.presets[idx];
}

export async function deletePreset(id: string): Promise<void> {
  const idx = settings.ai.presets.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Preset not found");

  // Check scene bindings
  const boundScenes: SceneType[] = [];
  for (const [scene, config] of Object.entries(settings.ai.scenes)) {
    if (config?.presetId === id) {
      boundScenes.push(scene as SceneType);
    }
  }
  if (boundScenes.length > 0) {
    const err = new Error(`Preset is used by scenes: ${boundScenes.join(", ")}`) as Error & { scenes?: string[] };
    err.scenes = boundScenes;
    throw err;
  }

  const wasDefault = settings.ai.presets[idx].isDefault;
  settings.ai.presets.splice(idx, 1);

  // Reassign default if needed
  if (wasDefault && settings.ai.presets.length > 0) {
    settings.ai.presets[0].isDefault = true;
  }

  await saveSettings(settings);
}

export async function setDefaultPreset(id: string): Promise<void> {
  const preset = settings.ai.presets.find((p) => p.id === id);
  if (!preset) throw new Error("Preset not found");

  for (const p of settings.ai.presets) {
    p.isDefault = p.id === id;
  }
  await saveSettings(settings);
}

// ─── Scene Configuration ───

export function getScenes(): Partial<Record<SceneType, SceneConfig>> {
  return settings.ai.scenes;
}

export async function updateScenes(scenes: Partial<Record<SceneType, SceneConfig>>): Promise<void> {
  // Validate preset references
  for (const [, config] of Object.entries(scenes)) {
    if (config?.presetId) {
      const preset = settings.ai.presets.find((p) => p.id === config.presetId);
      if (!preset) {
        throw new Error(`Preset not found: ${config.presetId}`);
      }
    }
  }
  settings.ai.scenes = { ...settings.ai.scenes, ...scenes };
  await saveSettings(settings);
}

// ─── Runtime Resolution ───

export interface ResolvedScene {
  model: LanguageModelV1;
  temperature: number;
  maxTokens: number;
}

export function resolveForScene(sceneType: SceneType): ResolvedScene {
  const sceneConfig = settings.ai.scenes[sceneType];
  let preset: ModelPreset | undefined;

  if (sceneConfig?.presetId) {
    preset = settings.ai.presets.find((p) => p.id === sceneConfig.presetId);
  }

  // Fallback to default preset
  if (!preset) {
    preset = getDefaultPreset();
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

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  if (username !== settings.admin.username) return false;
  return bcrypt.compare(password, settings.admin.password);
}
