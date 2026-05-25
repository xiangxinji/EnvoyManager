<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { api } from "../api";

const props = defineProps<{ team: string }>();

interface UserStats {
  user: string;
  fileCount: number;
  totalSize: number;
}

interface BrainFile {
  path: string;
  mtime_ms: number;
  size: number;
}

const stats = ref<{ totalFiles: number; totalSize: number; byUser: UserStats[] }>({
  totalFiles: 0,
  totalSize: 0,
  byUser: [],
});
const loading = ref(true);
const expandedUser = ref<string | null>(null);
const userFiles = ref<Record<string, BrainFile[]>>({});
const filesLoading = ref(false);
let timer: ReturnType<typeof setInterval>;

async function loadStats() {
  try {
    stats.value = await api.getBrainsStats(props.team);
  } catch {
  } finally {
    loading.value = false;
  }
}

async function toggleUser(user: string) {
  if (expandedUser.value === user) {
    expandedUser.value = null;
    return;
  }
  expandedUser.value = user;
  if (!userFiles.value[user]) {
    filesLoading.value = true;
    try {
      const res = await api.getBrainsFiles(props.team, user);
      userFiles.value[user] = res.files;
    } catch {
      userFiles.value[user] = [];
    } finally {
      filesLoading.value = false;
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-CN");
}

async function downloadFile(user: string, filePath: string) {
  try {
    const res = await fetch(
      `/api/brains/download/${filePath}?username=${encodeURIComponent(user)}`,
      { headers: { team: props.team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` } },
    );
    if (!res.ok) throw new Error("download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filePath.split("/").pop() || "file";
    a.click();
    URL.revokeObjectURL(url);
  } catch {}
}

onMounted(() => { loadStats(); timer = setInterval(loadStats, 10000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="brains">
    <div class="section-header">
      <h3 class="section-title">知识库</h3>
      <div v-if="stats.totalFiles > 0" class="summary">
        {{ stats.totalFiles }} 个文件，共 {{ formatSize(stats.totalSize) }}
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="stats.byUser.length === 0" class="empty">暂无知识库数据</div>
    <div v-else class="user-list">
      <div v-for="u in stats.byUser" :key="u.user" class="user-section">
        <div class="user-header" @click="toggleUser(u.user)">
          <div class="user-avatar">{{ u.user.charAt(0).toUpperCase() }}</div>
          <div class="user-info">
            <span class="user-name">{{ u.user }}</span>
            <span class="user-meta">{{ u.fileCount }} 个文件 · {{ formatSize(u.totalSize) }}</span>
          </div>
          <span class="expand-icon" :class="{ expanded: expandedUser === u.user }">&#9654;</span>
        </div>

        <div v-if="expandedUser === u.user" class="file-list">
          <div v-if="filesLoading" class="loading small">加载文件列表...</div>
          <div v-else-if="(userFiles[u.user] || []).length === 0" class="empty small">无文件</div>
          <template v-else>
            <div v-for="f in userFiles[u.user]" :key="f.path" class="file-row">
              <span class="file-icon">📄</span>
              <span class="file-path" :title="f.path">{{ f.path }}</span>
              <span class="file-meta">
                <span class="meta-size">{{ formatSize(f.size) }}</span>
                <span class="meta-date">{{ formatDate(f.mtime_ms) }}</span>
              </span>
              <button class="icon-btn" title="下载" @click="downloadFile(u.user, f.path)">&#8615;</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.brains {
  width: 100%;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.section-title {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-secondary);
}

.summary {
  font-size: 0.82em;
  color: var(--text-muted);
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.user-section {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.user-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  transition: background 0.1s;
}

.user-header:hover { background: var(--card-hover); }

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--glass-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.85em;
  color: var(--accent);
  flex-shrink: 0;
}

.user-info {
  flex: 1;
}

.user-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.9em;
}

.user-meta {
  display: block;
  font-size: 0.78em;
  color: var(--text-muted);
  margin-top: 2px;
}

.expand-icon {
  font-size: 0.7em;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.file-list {
  border-top: 1px solid var(--border);
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px var(--space-lg) 8px 60px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85em;
}

.file-row:last-child { border-bottom: none; }

.file-icon { flex-shrink: 0; }

.file-path {
  flex: 1;
  min-width: 120px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  display: flex;
  gap: var(--space-md);
  font-size: 0.8em;
  color: var(--text-muted);
}

.meta-size { min-width: 60px; }
.meta-date { min-width: 120px; }

.icon-btn {
  background: none;
  border: 1px solid var(--border);
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  font-size: 0.85em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: color 0.15s, border-color 0.15s;
  opacity: 0;
}

.file-row:hover .icon-btn { opacity: 1; }
.icon-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }

.loading, .empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
}

.loading.small, .empty.small {
  padding: var(--space-md);
  font-size: 0.82em;
}
</style>
