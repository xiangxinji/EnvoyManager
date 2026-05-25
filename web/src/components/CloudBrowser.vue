<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { api } from "../api";

const props = defineProps<{ team: string }>();

interface CloudItem {
  id: number;
  name: string;
  type: string;
  size: number;
  uploadedBy: string;
  createdAt: number;
}

const items = ref<CloudItem[]>([]);
const currentPath = ref("");
const loading = ref(true);
const error = ref("");
let timer: ReturnType<typeof setInterval>;

let loadId = 0;

async function load() {
  const id = ++loadId;
  const path = currentPath.value;
  try {
    const res = await api.getCloudFiles(props.team, path);
    if (id !== loadId) return;
    items.value = res.items;
    error.value = "";
  } catch (e: any) {
    if (id !== loadId) return;
    error.value = e.message;
  } finally {
    if (id === loadId) loading.value = false;
  }
}

function navigateTo(path: string) {
  currentPath.value = path;
  loading.value = true;
  load();
}

function breadcrumbs(): string[] {
  if (!currentPath.value) return [];
  return currentPath.value.replace(/\/$/, "").split("/").filter(Boolean);
}

function breadcrumbPath(index: number): string {
  const parts = breadcrumbs().slice(0, index + 1);
  return parts.join("/") + "/";
}

function openDir(item: CloudItem) {
  if (item.type !== "directory") return;
  const newPath = currentPath.value + item.name + "/";
  navigateTo(newPath);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN");
}

const actionError = ref("");

async function downloadFile(item: CloudItem) {
  const filePath = currentPath.value + item.name;
  try {
    const res = await fetch(`/api/cloud/download/${filePath}`, {
      headers: { team: props.team, Authorization: `Bearer ${localStorage.getItem("admin_token") || ""}` },
    });
    if (!res.ok) throw new Error("下载失败");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    actionError.value = `下载 ${item.name} 失败: ${e.message}`;
    setTimeout(() => { actionError.value = ""; }, 4000);
  }
}

const pendingDelete = ref<CloudItem | null>(null);

function confirmDelete(item: CloudItem) {
  pendingDelete.value = item;
}

async function doDelete() {
  const item = pendingDelete.value;
  if (!item) return;
  const filePath = item.type === "directory"
    ? currentPath.value + item.name + "/"
    : currentPath.value + item.name;
  try {
    await api.deleteCloudFile(props.team, filePath);
    pendingDelete.value = null;
    await load();
  } catch (e: any) {
    pendingDelete.value = null;
    actionError.value = `删除失败: ${e.message}`;
    setTimeout(() => { actionError.value = ""; }, 4000);
  }
}

const showMkdirModal = ref(false);
const mkdirName = ref("");
const creating = ref(false);

async function handleMkdir() {
  if (!mkdirName.value.trim()) return;
  creating.value = true;
  try {
    await api.createCloudDir(props.team, mkdirName.value.trim(), currentPath.value);
    showMkdirModal.value = false;
    mkdirName.value = "";
    await load();
  } catch (e: any) {
    actionError.value = `创建文件夹失败: ${e.message}`;
    setTimeout(() => { actionError.value = ""; }, 4000);
  } finally {
    creating.value = false;
  }
}

const uploading = ref(false);

async function handleUpload() {
  if (uploading.value) return;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.onchange = async () => {
    if (!input.files || input.files.length === 0) return;
    uploading.value = true;
    for (const file of Array.from(input.files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("path", currentPath.value);
        formData.append("uploadedBy", "admin");
        const token = localStorage.getItem("admin_token") || "";
        const res = await fetch("/api/cloud/files", {
          method: "POST",
          headers: { team: props.team, Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "upload failed" }));
          throw new Error(err.error);
        }
      } catch (e: any) {
        alert(`上传 ${file.name} 失败: ${e.message}`);
      }
    }
    uploading.value = false;
    await load();
  };
  input.click();
}

const searchQuery = ref("");
const searchResults = ref<Array<{ name: string; path: string; type: string; size: number }>>([]);
const searching = ref(false);

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    searchResults.value = await api.searchCloudFiles(props.team, searchQuery.value);
  } catch {
    searchResults.value = [];
  } finally {
    searching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = "";
  searchResults.value = [];
}

function goToSearchResult(path: string) {
  const parts = path.split("/");
  parts.pop();
  currentPath.value = parts.join("/") + (parts.length > 0 ? "/" : "");
  searchResults.value = [];
  searchQuery.value = "";
  loading.value = true;
  load();
}

onMounted(() => { load(); timer = setInterval(load, 10000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="cloud">
    <div class="section-header">
      <h3 class="section-title">云资源</h3>
      <div class="actions">
        <button class="action-btn" @click="handleUpload" :disabled="uploading">
          {{ uploading ? "上传中..." : "上传文件" }}
        </button>
        <button class="action-btn secondary" @click="showMkdirModal = true">新建文件夹</button>
      </div>
    </div>

    <div class="search-bar">
      <input
        v-model="searchQuery"
        placeholder="搜索文件..."
        @keydown.enter="handleSearch"
      />
      <button v-if="searchQuery" class="clear-btn" @click="clearSearch">&times;</button>
      <button class="search-btn" @click="handleSearch" :disabled="searching">搜索</button>
    </div>

    <div v-if="actionError" class="action-error">{{ actionError }}</div>

    <div v-if="searchResults.length > 0" class="search-results">
      <div v-for="r in searchResults" :key="r.path" class="search-item" @click="goToSearchResult(r.path)">
        <span class="item-icon">{{ r.type === "directory" ? "📁" : "📄" }}</span>
        <span class="item-name">{{ r.name }}</span>
        <span class="item-path">{{ r.path }}</span>
      </div>
    </div>

    <template v-else>
      <div v-if="currentPath" class="breadcrumbs">
        <span class="crumb" @click="navigateTo('')">根目录</span>
        <template v-for="(part, i) in breadcrumbs()" :key="i">
          <span class="crumb-sep">/</span>
          <span class="crumb" @click="navigateTo(breadcrumbPath(i))">{{ part }}</span>
        </template>
      </div>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="items.length === 0" class="empty">此目录为空</div>
      <div v-else class="file-list">
        <div v-if="currentPath" class="file-row parent-dir" @click="navigateTo(currentPath.split('/').slice(0, -2).join('/') + '/')">
          <span class="item-icon">📁</span>
          <span class="item-name">..</span>
          <span class="item-meta" />
        </div>
        <div
          v-for="item in items"
          :key="item.id"
          class="file-row"
          :class="{ dir: item.type === 'directory' }"
          @click="item.type === 'directory' ? openDir(item) : undefined"
        >
          <span class="item-icon">{{ item.type === "directory" ? "📁" : "📄" }}</span>
          <span class="item-name">{{ item.name }}</span>
          <span class="item-meta">
            <span v-if="item.type !== 'directory'" class="meta-size">{{ formatSize(item.size) }}</span>
            <span class="meta-by">{{ item.uploadedBy }}</span>
            <span class="meta-date">{{ formatDate(item.createdAt) }}</span>
          </span>
          <span class="item-actions">
            <button v-if="item.type !== 'directory'" class="icon-btn" title="下载" @click.stop="downloadFile(item)">&#8615;</button>
            <button class="icon-btn danger" title="删除" @click.stop="confirmDelete(item)">&#10005;</button>
          </span>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="showMkdirModal" class="modal-overlay">
        <div class="modal-content">
          <h3 class="modal-title">新建文件夹</h3>
          <div class="form-group">
            <input v-model="mkdirName" placeholder="文件夹名称" @keydown.enter="handleMkdir" />
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="showMkdirModal = false; mkdirName = ''">取消</button>
            <button class="confirm-btn" :disabled="creating || !mkdirName.trim()" @click="handleMkdir">
              {{ creating ? "创建中..." : "创建" }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="pendingDelete" class="modal-overlay">
        <div class="modal-content">
          <h3 class="modal-title">确认删除</h3>
          <p class="confirm-text">确定要删除 "{{ pendingDelete.name }}" 吗？{{ pendingDelete.type === "directory" ? "文件夹内的所有文件也会被删除。" : "" }}</p>
          <div class="modal-actions">
            <button class="cancel-btn" @click="pendingDelete = null">取消</button>
            <button class="confirm-btn danger" @click="doDelete">删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cloud {
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

.actions {
  display: flex;
  gap: var(--space-sm);
}

.action-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82em;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.action-btn:hover { opacity: 0.85; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.action-btn.secondary {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.action-btn.secondary:hover { border-color: var(--text-muted); }

.search-bar {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.search-bar input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.85em;
  background: var(--glass-bg);
  color: var(--text-primary);
  outline: none;
}

.search-bar input:focus { border-color: var(--accent); }

.search-btn {
  background: none;
  border: 1px solid var(--border);
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82em;
  color: var(--text-secondary);
  cursor: pointer;
}

.search-btn:disabled { opacity: 0.5; }

.clear-btn {
  background: none;
  border: none;
  font-size: 1.1em;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0 6px;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-bottom: var(--space-md);
  font-size: 0.82em;
  flex-wrap: wrap;
}

.crumb {
  color: var(--accent);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background 0.1s;
}

.crumb:hover { background: var(--glass-bg); }

.crumb-sep {
  color: var(--text-muted);
}

.search-results {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.search-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85em;
  cursor: pointer;
  transition: background 0.1s;
}

.search-item:hover { background: var(--card-hover); }
.search-item:last-child { border-bottom: none; }

.file-list {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.88em;
  transition: background 0.1s;
}

.file-row:last-child { border-bottom: none; }
.file-row:hover { background: var(--card-hover); }
.file-row.dir { cursor: pointer; }
.file-row.parent-dir { cursor: pointer; color: var(--text-muted); }

.item-icon { flex-shrink: 0; font-size: 1em; }

.item-name {
  flex: 1;
  min-width: 120px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  gap: var(--space-md);
  font-size: 0.8em;
  color: var(--text-muted);
}

.meta-size { min-width: 60px; }
.meta-by { min-width: 60px; }
.meta-date { min-width: 120px; }

.item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.file-row:hover .item-actions { opacity: 1; }

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
}

.icon-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.icon-btn.danger:hover { color: #ff453a; border-color: #ff453a; }

.loading, .error, .empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
}

.error { color: #ff453a; }

.action-error {
  background: rgba(255, 69, 58, 0.1);
  color: #ff453a;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82em;
  margin-bottom: var(--space-md);
}

.confirm-text {
  font-size: 0.9em;
  color: var(--text-secondary);
  margin-bottom: var(--space-lg);
  line-height: 1.5;
}

.confirm-btn.danger {
  background: #ff453a;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  width: 360px;
  max-width: 90vw;
}

.modal-title {
  font-size: 1.05em;
  font-weight: 600;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.88em;
  background: var(--glass-bg);
  color: var(--text-primary);
  outline: none;
}

.form-group input:focus { border-color: var(--accent); }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}

.cancel-btn {
  background: none;
  border: 1px solid var(--border);
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.85em;
  cursor: pointer;
  color: var(--text-secondary);
}

.confirm-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.85em;
  font-weight: 500;
  cursor: pointer;
}

.confirm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
