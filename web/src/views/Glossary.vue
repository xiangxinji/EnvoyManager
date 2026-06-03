<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { api } from "../api";
import type { GlossaryEntry, TeamInfo } from "../api";

const mode = ref<"global" | "team">("global");
const teams = ref<TeamInfo[]>([]);
const selectedTeam = ref("");
const entries = ref<GlossaryEntry[]>([]);
const loading = ref(true);
const error = ref("");

// Inline form state
const showForm = ref(false);
const editingId = ref<string | null>(null);
const formTerm = ref("");
const formDefinition = ref("");
const formError = ref("");
const formLoading = ref(false);

async function loadEntries() {
  loading.value = true;
  error.value = "";
  try {
    if (mode.value === "global") {
      entries.value = await api.getGlobalGlossary();
    } else if (selectedTeam.value) {
      entries.value = await api.getTeamGlossary(selectedTeam.value);
    } else {
      entries.value = [];
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    teams.value = await api.getTeams();
  } catch { /* ignore */ }
  await loadEntries();
});

watch([mode, selectedTeam], () => {
  showForm.value = false;
  loadEntries();
});

function openAddForm() {
  editingId.value = null;
  formTerm.value = "";
  formDefinition.value = "";
  formError.value = "";
  showForm.value = true;
}

function openEditForm(entry: GlossaryEntry) {
  editingId.value = entry.id;
  formTerm.value = entry.term;
  formDefinition.value = entry.definition;
  formError.value = "";
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
  formError.value = "";
}

async function handleSaveForm() {
  if (!formTerm.value.trim() || !formDefinition.value.trim()) {
    formError.value = "术语和释义不能为空";
    return;
  }

  if (mode.value === "team" && !selectedTeam.value) {
    formError.value = "请先选择团队";
    return;
  }

  formLoading.value = true;
  formError.value = "";

  try {
    if (mode.value === "global") {
      if (editingId.value) {
        await api.updateGlobalGlossaryEntry(editingId.value, formTerm.value.trim(), formDefinition.value.trim());
      } else {
        await api.createGlobalGlossaryEntry(formTerm.value.trim(), formDefinition.value.trim());
      }
    } else {
      if (editingId.value) {
        await api.updateTeamGlossaryEntry(selectedTeam.value, editingId.value, formTerm.value.trim(), formDefinition.value.trim());
      } else {
        await api.createTeamGlossaryEntry(selectedTeam.value, formTerm.value.trim(), formDefinition.value.trim());
      }
    }

    await loadEntries();
    cancelForm();
  } catch (e: unknown) {
    formError.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    formLoading.value = false;
  }
}

async function handleDelete(entry: GlossaryEntry) {
  if (!confirm(`确定要删除术语「${entry.term}」吗？`)) return;

  try {
    if (mode.value === "global") {
      await api.deleteGlobalGlossaryEntry(entry.id);
    } else {
      await api.deleteTeamGlossaryEntry(selectedTeam.value, entry.id);
    }
    await loadEntries();
  } catch (e: unknown) {
    alert(e instanceof Error ? e.message : "删除失败");
  }
}
</script>

<template>
  <div class="glossary-page">
    <div class="page-header">
      <h2>词汇表管理</h2>
      <button class="add-btn" @click="openAddForm" :disabled="showForm">+ 添加词汇</button>
    </div>

    <div class="tab-bar">
      <button :class="['tab-btn', { active: mode === 'global' }]" @click="mode = 'global'">全局词汇</button>
      <button :class="['tab-btn', { active: mode === 'team' }]" @click="mode = 'team'">团队词汇</button>
      <select v-if="mode === 'team'" v-model="selectedTeam" class="team-select">
        <option value="" disabled>选择团队</option>
        <option v-for="team in teams" :key="team.name" :value="team.name">{{ team.name }}</option>
      </select>
    </div>

    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="error" class="empty error-text">{{ error }}</div>
    <div v-else-if="mode === 'team' && !selectedTeam" class="empty">
      <p>请选择一个团队</p>
    </div>
    <div v-else-if="entries.length === 0 && !showForm" class="empty">
      <p>还没有词汇条目</p>
      <p class="hint">点击上方「添加词汇」按钮定义术语</p>
    </div>

    <div v-else class="entry-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        :class="['entry-card', { editing: editingId === entry.id }]"
      >
        <div class="entry-info">
          <div class="entry-term">{{ entry.term }}</div>
          <div class="entry-definition">{{ entry.definition }}</div>
        </div>
        <div class="entry-actions">
          <button class="action-btn edit-btn" @click="openEditForm(entry)">编辑</button>
          <button class="action-btn delete-btn" @click="handleDelete(entry)">删除</button>
        </div>
      </div>

      <!-- Inline Form -->
      <div v-if="showForm" class="entry-card form-card">
        <h4>{{ editingId ? "编辑词汇" : "添加词汇" }}</h4>
        <div class="form-fields">
          <div class="field">
            <label>术语</label>
            <input v-model="formTerm" placeholder="如：执行计划" :disabled="formLoading" />
          </div>
          <div class="field">
            <label>释义</label>
            <textarea v-model="formDefinition" placeholder="术语的含义和用法说明" :disabled="formLoading" rows="3" />
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
.glossary-page {
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

.tab-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.tab-btn {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.88em;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  border-color: var(--text-secondary);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.team-select {
  margin-left: var(--space-sm);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.88em;
  outline: none;
}

.team-select:focus {
  border-color: var(--accent);
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

.entry-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.entry-card {
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

.entry-card.editing {
  border-color: var(--accent);
}

.entry-info {
  flex: 1;
  min-width: 0;
}

.entry-term {
  font-weight: 600;
  font-size: 0.95em;
  color: var(--text-primary);
}

.entry-definition {
  font-size: 0.88em;
  color: var(--text-secondary);
  margin-top: 4px;
  white-space: pre-wrap;
}

.entry-actions {
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

.form-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 0.8em;
  font-weight: 500;
  color: var(--text-secondary);
}

.field input,
.field textarea {
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  font-size: 0.88em;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.15s;
}

.field input:focus,
.field textarea:focus {
  border-color: var(--accent);
}

.field input::placeholder,
.field textarea::placeholder {
  color: var(--text-muted);
}

.field input:-webkit-autofill,
.field input:-webkit-autofill:hover,
.field input:-webkit-autofill:focus,
.field input:-webkit-autofill:active {
  -webkit-text-fill-color: var(--text-primary);
  -webkit-box-shadow: 0 0 0 36px var(--bg-primary) inset;
  caret-color: var(--text-primary);
  transition: background-color 9999s ease-in-out 0s;
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
