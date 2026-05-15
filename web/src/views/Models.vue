<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();

interface PresetView {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseURL?: string;
  apiKey: string;
  isDefault: boolean;
}

const presets = ref<PresetView[]>([]);
const providers = ref<{ id: string; label: string; models: string[] }[]>([]);
const loading = ref(true);
const error = ref("");

// Inline form state
const showForm = ref(false);
const editingId = ref<string | null>(null);
const formName = ref("");
const formProvider = ref("openai");
const formModel = ref("");
const formBaseURL = ref("");
const formApiKey = ref("");
const formError = ref("");
const formLoading = ref(false);

const providerNeedsBaseURL = computed(() => formProvider.value === "openai-compatible");

const suggestedModels = computed(() => {
  const found = providers.value.find((p) => p.id === formProvider.value);
  return found?.models ?? [];
});

onMounted(async () => {
  try {
    const [presetList, providerList] = await Promise.all([api.getPresets(), api.getAIModels()]);
    presets.value = presetList;
    providers.value = providerList;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unauthorized")) {
      localStorage.removeItem("admin_token");
      router.push("/login");
      return;
    }
    error.value = msg;
  } finally {
    loading.value = false;
  }
});

function openAddForm() {
  editingId.value = null;
  formName.value = "";
  formProvider.value = "openai";
  formModel.value = "";
  formBaseURL.value = "";
  formApiKey.value = "";
  formError.value = "";
  showForm.value = true;
}

function openEditForm(preset: PresetView) {
  editingId.value = preset.id;
  formName.value = preset.name;
  formProvider.value = preset.provider;
  formModel.value = preset.model;
  formBaseURL.value = preset.baseURL ?? "";
  formApiKey.value = "";
  formError.value = "";
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  formError.value = "";
}

async function handleSaveForm() {
  if (!formName.value.trim() || !formProvider.value || !formModel.value.trim()) {
    formError.value = "名称、服务商和模型为必填项";
    return;
  }
  if (!editingId.value && !formApiKey.value) {
    formError.value = "API Key 为必填项";
    return;
  }
  if (providerNeedsBaseURL.value && !formBaseURL.value.trim()) {
    formError.value = "OpenAI Compatible 服务商必须填写 Base URL";
    return;
  }

  formLoading.value = true;
  formError.value = "";

  try {
    const data = {
      name: formName.value.trim(),
      provider: formProvider.value,
      model: formModel.value.trim(),
      baseURL: formBaseURL.value.trim() || undefined,
      apiKey: formApiKey.value,
    };

    if (editingId.value) {
      await api.updatePreset(editingId.value, data);
    } else {
      await api.createPreset(data as { name: string; provider: string; model: string; apiKey: string });
    }

    const updated = await api.getPresets();
    presets.value = updated;
    cancelForm();
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    formLoading.value = false;
  }
}

async function handleDelete(preset: PresetView) {
  if (!confirm(`确定要删除模型预设 "${preset.name}" 吗？`)) return;

  try {
    await api.deletePreset(preset.id);
    presets.value = await api.getPresets();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "删除失败";
    alert(msg);
  }
}

async function handleSetDefault(preset: PresetView) {
  try {
    await api.setDefaultPreset(preset.id);
    presets.value = presets.value.map((p) => ({
      ...p,
      isDefault: p.id === preset.id,
    }));
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : "设置失败");
  }
}

function getProviderLabel(id: string): string {
  return providers.value.find((p) => p.id === id)?.label ?? id;
}
</script>

<template>
  <div class="models-page">
    <div class="page-header">
      <h2>模型管理</h2>
      <button class="add-btn" @click="openAddForm" :disabled="showForm">+ 添加预设</button>
    </div>

    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="error" class="empty error-text">{{ error }}</div>
    <div v-else-if="presets.length === 0 && !showForm" class="empty">
      <p>还没有模型预设</p>
      <p class="hint">点击上方"添加预设"按钮创建第一个模型配置</p>
    </div>

    <div v-else class="preset-list">
      <div
        v-for="preset in presets"
        :key="preset.id"
        :class="['preset-card', { editing: editingId === preset.id }]"
      >
        <div class="preset-info">
          <div class="preset-name">
            <span v-if="preset.isDefault" class="default-badge" title="默认预设" @click.stop>&#9733;</span>
            {{ preset.name }}
          </div>
          <div class="preset-meta">
            <span class="tag">{{ getProviderLabel(preset.provider) }}</span>
            <span class="model-name">{{ preset.model }}</span>
            <span v-if="preset.baseURL" class="base-url">{{ preset.baseURL }}</span>
          </div>
          <div class="preset-key">{{ preset.apiKey }}</div>
        </div>
        <div class="preset-actions">
          <button v-if="!preset.isDefault" class="action-btn default-btn" @click="handleSetDefault(preset)" title="设为默认">
            &#9734;
          </button>
          <button class="action-btn edit-btn" @click="openEditForm(preset)">编辑</button>
          <button class="action-btn delete-btn" @click="handleDelete(preset)">删除</button>
        </div>
      </div>

      <!-- Inline Form -->
      <div v-if="showForm" class="preset-card form-card">
        <h4>{{ editingId ? "编辑预设" : "新建预设" }}</h4>
        <div class="form-grid">
          <div class="field">
            <label>名称</label>
            <input v-model="formName" placeholder="如: GPT-4o-精确" :disabled="formLoading" />
          </div>
          <div class="field">
            <label>服务商</label>
            <select v-model="formProvider" :disabled="formLoading">
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>模型</label>
            <div class="model-input-group">
              <datalist v-if="suggestedModels.length" id="available-models">
                <option v-for="m in suggestedModels" :key="m" :value="m" />
              </datalist>
              <input
                v-model="formModel"
                placeholder="输入模型名称"
                :disabled="formLoading"
                :list="suggestedModels.length ? 'available-models' : undefined"
              />
            </div>
          </div>
          <div class="field">
            <label>Base URL {{ providerNeedsBaseURL ? "(必填)" : "(可选)" }}</label>
            <input v-model="formBaseURL" placeholder="https://..." :disabled="formLoading" />
          </div>
          <div class="field">
            <label>API Key {{ editingId ? "(留空保持不变)" : "" }}</label>
            <input v-model="formApiKey" type="password" placeholder="sk-..." :disabled="formLoading" />
          </div>
        </div>
        <div class="form-actions">
          <button class="save-btn" @click="handleSaveForm" :disabled="formLoading">
            {{ formLoading ? "保存中..." : "保存" }}
          </button>
          <button class="cancel-btn" @click="cancelForm" :disabled="formLoading">取消</button>
          <p v-if="formError" class="error">{{ formError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.models-page {
  width: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
}

.page-header h2 {
  font-size: 1.3em;
  font-weight: 700;
  color: var(--text-primary);
}

.add-btn {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: white;
  font-weight: 600;
  font-size: 0.88em;
  cursor: pointer;
  transition: background 0.15s;
}

.add-btn:hover {
  background: var(--accent-hover);
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 48px 0;
  font-size: 0.95em;
}

.error-text {
  color: var(--error);
}

.hint {
  font-size: 0.85em;
  margin-top: var(--space-sm);
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.preset-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  transition: border-color 0.15s;
}

.preset-card.editing {
  border-color: var(--accent);
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-weight: 600;
  font-size: 0.95em;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.default-badge {
  color: #f5a623;
  font-size: 1.1em;
  cursor: default;
}

.preset-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: 4px;
  flex-wrap: wrap;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-light);
  color: var(--accent);
  font-size: 0.78em;
  font-weight: 500;
}

.model-name {
  font-size: 0.85em;
  color: var(--text-secondary);
  font-family: monospace;
}

.base-url {
  font-size: 0.78em;
  color: var(--text-muted);
  font-family: monospace;
}

.preset-key {
  font-size: 0.8em;
  color: var(--text-muted);
  margin-top: 2px;
}

.preset-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-shrink: 0;
}

.action-btn {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.82em;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.default-btn {
  color: #f5a623;
  border-color: #f5a62333;
}

.default-btn:hover {
  background: #f5a62315;
  border-color: #f5a623;
}

.delete-btn:hover {
  border-color: var(--error);
  color: var(--error);
}

/* Form */
.form-card {
  flex-direction: column;
  align-items: stretch;
  border-style: dashed;
  border-color: var(--accent);
}

.form-card h4 {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-md);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.form-grid .field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-grid .field:last-child {
  grid-column: 1 / -1;
}

.form-grid label {
  font-size: 0.8em;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-grid input,
.form-grid select {
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  font-size: 0.88em;
  transition: border-color 0.15s;
}

.form-grid input:focus,
.form-grid select:focus {
  border-color: var(--accent);
}

.form-grid input::placeholder {
  color: var(--text-muted);
}

.model-input-group {
  display: flex;
}

.model-input-group input {
  flex: 1;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.save-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: white;
  font-weight: 600;
  font-size: 0.88em;
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

.cancel-btn {
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.88em;
  cursor: pointer;
}

.cancel-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.error {
  color: var(--error);
  font-size: 0.8em;
  margin: 0;
}
</style>
