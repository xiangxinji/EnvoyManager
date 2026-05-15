<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();

// ─── Admin ───

const username = ref("");
const password = ref("");
const confirm = ref("");
const loading = ref(false);
const error = ref("");
const success = ref("");

// ─── AI Scene Config ───

interface PresetOption {
  id: string;
  name: string;
  provider: string;
  model: string;
  isDefault: boolean;
}

interface SceneRow {
  key: string;
  label: string;
  description: string;
  presetId: string | null;
  temperature: number;
  maxTokens: number;
}

const presets = ref<PresetOption[]>([]);
const sceneRows = ref<SceneRow[]>([]);
const configured = ref(false);
const defaultPresetName = ref<string | null>(null);
const sceneLoading = ref(true);
const sceneSaving = ref(false);
const sceneError = ref("");
const sceneSuccess = ref("");

let logoutTimer: ReturnType<typeof setTimeout> | null = null;
onUnmounted(() => {
  if (logoutTimer) clearTimeout(logoutTimer);
});

const SCENE_DEFINITIONS: Array<{ key: string; label: string; description: string }> = [
  { key: "chat", label: "Chat", description: "聊天建议" },
  { key: "task", label: "Task", description: "任务规划" },
  { key: "analyze", label: "Analyze", description: "结果分析" },
  { key: "agent", label: "Agent", description: "推理执行" },
  { key: "dispatch", label: "Dispatch", description: "智能分派" },
  { key: "review", label: "Review", description: "任务审核" },
];

const hasPresets = computed(() => presets.value.length > 0);

onMounted(async () => {
  // Admin profile
  try {
    const profile = await api.getAdminProfile();
    username.value = profile.username;
  } catch {}

  // AI Scene Config
  try {
    const [config, scenesData] = await Promise.all([api.getAIConfig(), api.getScenes()]);

    presets.value = config.presets.map((p) => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      model: p.model,
      isDefault: p.isDefault,
    }));

    configured.value = config.configured;
    defaultPresetName.value = config.defaultPreset?.name ?? null;

    sceneRows.value = SCENE_DEFINITIONS.map((def) => {
      const existing = scenesData[def.key];
      return {
        key: def.key,
        label: def.label,
        description: def.description,
        presetId: existing?.presetId ?? null,
        temperature: existing?.temperature ?? 0.7,
        maxTokens: existing?.maxTokens ?? 4096,
      };
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unauthorized")) {
      localStorage.removeItem("admin_token");
      router.push("/login");
      return;
    }
    sceneError.value = msg;
  } finally {
    sceneLoading.value = false;
  }
});

async function handleSave() {
  const user = username.value.trim();
  const pass = password.value;
  const confirmPass = confirm.value;

  if (!user) {
    error.value = "用户名不能为空";
    return;
  }
  if (!pass || pass.length < 6) {
    error.value = "密码不能少于 6 位";
    return;
  }
  if (pass !== confirmPass) {
    error.value = "两次密码不一致";
    return;
  }

  loading.value = true;
  error.value = "";
  success.value = "";

  try {
    await api.updateAdmin(user, pass);
    success.value = "修改成功，请重新登录";
    logoutTimer = setTimeout(() => {
      localStorage.removeItem("admin_token");
      router.push("/login");
    }, 1500);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "修改失败";
  } finally {
    loading.value = false;
  }
}

async function handleLogout() {
  if (!confirm("确定要退出登录吗？")) return;
  try {
    await api.adminLogout();
  } catch {}
  localStorage.removeItem("admin_token");
  router.push("/login");
}

async function handleSceneSave() {
  sceneSaving.value = true;
  sceneError.value = "";
  sceneSuccess.value = "";

  const scenes: Record<string, { presetId: string | null; temperature: number; maxTokens: number }> = {};
  for (const row of sceneRows.value) {
    scenes[row.key] = {
      presetId: row.presetId,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
    };
  }

  try {
    await api.updateScenes(scenes);
    const config = await api.getAIConfig();
    configured.value = config.configured;
    sceneSuccess.value = "场景配置已保存";
  } catch (e: unknown) {
    sceneError.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    sceneSaving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <h2>设置</h2>

    <!-- Admin Account -->
    <div class="card">
      <h3>管理员账号</h3>
      <div class="fields">
        <div class="field">
          <label for="username">用户名</label>
          <input id="username" v-model="username" placeholder="管理员用户名" :disabled="loading" />
        </div>
        <div class="field">
          <label for="password">新密码</label>
          <input id="password" v-model="password" type="password" placeholder="输入新密码" :disabled="loading" />
        </div>
        <div class="field">
          <label for="confirm">确认密码</label>
          <input
            id="confirm"
            v-model="confirm"
            type="password"
            placeholder="再次输入密码"
            :disabled="loading"
            @keydown.enter="handleSave"
          />
        </div>
      </div>

      <div class="actions">
        <button class="save-btn" @click="handleSave" :disabled="loading">
          {{ loading ? "保存中..." : "保存" }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="success" class="success">{{ success }}</p>
      </div>
    </div>

    <!-- AI Scene Configuration -->
    <div class="card">
      <h3>AI 场景配置</h3>

      <!-- No presets guidance -->
      <div v-if="sceneLoading" class="hint">加载中...</div>
      <div v-else-if="!hasPresets" class="no-presets">
        <p>请先在 <router-link to="/models" class="link">模型管理</router-link> 页面添加模型预设</p>
      </div>

      <template v-else>
        <div class="status-row">
          <span :class="['status-dot', configured ? 'active' : 'inactive']"></span>
          <span class="status-text">{{ configured ? "已配置" : "未配置" }}</span>
          <span v-if="defaultPresetName" class="default-hint">
            — 未配置的场景将使用默认模型预设 (&#9733; {{ defaultPresetName }})
          </span>
        </div>

        <div class="scene-table">
          <div class="scene-header">
            <span class="col-scene">场景</span>
            <span class="col-preset">模型预设</span>
            <span class="col-temp">Temperature</span>
            <span class="col-tokens">Max Tokens</span>
          </div>
          <div v-for="row in sceneRows" :key="row.key" class="scene-row">
            <div class="col-scene">
              <span class="scene-label">{{ row.label }}</span>
              <span class="scene-desc">{{ row.description }}</span>
            </div>
            <div class="col-preset">
              <select v-model="row.presetId" :disabled="sceneSaving">
                <option :value="null">Default (使用默认预设)</option>
                <option v-for="p in presets" :key="p.id" :value="p.id">
                  {{ p.name }}{{ p.isDefault ? " ★" : "" }}
                </option>
              </select>
            </div>
            <div class="col-temp">
              <input
                v-model.number="row.temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                :disabled="sceneSaving"
              />
            </div>
            <div class="col-tokens">
              <input
                v-model.number="row.maxTokens"
                type="number"
                min="256"
                max="32768"
                step="256"
                :disabled="sceneSaving"
              />
            </div>
          </div>
        </div>

        <div class="actions">
          <button class="save-btn" @click="handleSceneSave" :disabled="sceneSaving">
            {{ sceneSaving ? "保存中..." : "保存场景配置" }}
          </button>
          <p v-if="sceneError" class="error">{{ sceneError }}</p>
          <p v-if="sceneSuccess" class="success">{{ sceneSuccess }}</p>
        </div>
      </template>
    </div>

    <!-- Logout -->
    <div class="card">
      <h3>退出登录</h3>
      <p class="hint">退出当前管理员会话</p>
      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  width: 100%;
}

.settings-page h2 {
  font-size: 1.3em;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-xl);
}

.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  margin-bottom: var(--space-lg);
  box-shadow: var(--shadow-sm);
}

.card h3 {
  font-size: 1em;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-lg);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.field label {
  font-size: 0.8em;
  font-weight: 500;
  color: var(--text-secondary);
}

input,
select {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  font-size: 0.9em;
}

input:focus,
select:focus {
  border-color: var(--accent);
}

input::placeholder {
  color: var(--text-muted);
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.active {
  background: var(--status-running);
}

.status-dot.inactive {
  background: var(--text-muted);
}

.status-text {
  font-size: 0.85em;
  color: var(--text-secondary);
}

.default-hint {
  font-size: 0.8em;
  color: var(--text-muted);
}

.no-presets {
  text-align: center;
  padding: 24px 0;
  color: var(--text-muted);
  font-size: 0.9em;
}

.link {
  color: var(--accent);
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

/* Scene Table */
.scene-table {
  margin-bottom: var(--space-lg);
}

.scene-header {
  display: grid;
  grid-template-columns: 140px 1fr 100px 110px;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.78em;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.scene-row {
  display: grid;
  grid-template-columns: 140px 1fr 100px 110px;
  gap: var(--space-md);
  padding: var(--space-md) 0;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.scene-row:last-child {
  border-bottom: none;
}

.col-scene {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scene-label {
  font-weight: 600;
  font-size: 0.9em;
  color: var(--text-primary);
}

.scene-desc {
  font-size: 0.78em;
  color: var(--text-muted);
}

.col-preset select {
  width: 100%;
  padding: 8px 10px;
  font-size: 0.85em;
}

.col-temp input,
.col-tokens input {
  width: 100%;
  padding: 8px 10px;
  font-size: 0.85em;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.save-btn {
  padding: 10px 24px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: white;
  font-weight: 600;
  font-size: 0.9em;
  cursor: pointer;
  transition: background 0.15s;
}

.save-btn:hover {
  background: var(--accent-hover);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: var(--error);
  font-size: 0.8em;
  margin: 0;
}

.success {
  color: var(--status-running);
  font-size: 0.8em;
  margin: 0;
}

.hint {
  font-size: 0.85em;
  color: var(--text-muted);
  margin-bottom: var(--space-md);
}

.logout-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--error);
  background: transparent;
  color: var(--error);
  font-weight: 500;
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.15s;
}

.logout-btn:hover {
  background: var(--error);
  color: white;
}
</style>
