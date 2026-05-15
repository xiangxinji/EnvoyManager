<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api, type TaskDetailData } from "../api";

const props = defineProps<{ name: string; id: string }>();
const router = useRouter();

const task = ref<TaskDetailData | null>(null);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    task.value = await api.getTaskDetail(props.name, props.id);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});

function goBack() {
  router.push(`/teams/${props.name}`);
}

function formatTime(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN");
}

const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "执行中",
  reviewing: "审查中",
  completed: "已完成",
  failed: "失败",
};

function formatResultData(data: unknown): string {
  if (data == null) return "—";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}
</script>

<template>
  <div class="task-detail">
    <div class="detail-header">
      <button class="btn-back" @click="goBack">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        返回团队
      </button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else-if="task">
      <!-- Basic Info -->
      <div class="section">
        <h2 class="section-title">基本信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">任务 ID</span>
            <span class="info-value mono">{{ task.id }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <span class="status-badge" :class="task.status">{{ statusLabels[task.status] }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">模式</span>
            <span class="mode-badge" :class="task.mode">{{ task.mode === "serial" ? "串行" : "并行" }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建者</span>
            <span class="info-value">{{ task.createBy }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatTime(task.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">分配成员</span>
            <span class="info-value">{{ task.subscribe.join(", ") }}</span>
          </div>
        </div>
      </div>

      <!-- Task Content -->
      <div class="section">
        <h2 class="section-title">任务内容</h2>
        <div class="content-block">{{ task.content }}</div>
      </div>

      <!-- Execution Results -->
      <div class="section">
        <h2 class="section-title">执行结果 ({{ task.results.length }})</h2>
        <div v-if="task.results.length === 0" class="empty">暂无执行结果</div>
        <div v-else class="results-list">
          <div v-for="(r, i) in task.results" :key="i" class="result-card">
            <div class="result-header">
              <span class="result-executor">{{ r.by }}</span>
              <span class="status-badge completed">已完成</span>
            </div>
            <pre class="result-data">{{ formatResultData(r.data) }}</pre>
          </div>
        </div>
      </div>

      <!-- Resources -->
      <div v-if="task.resources.length > 0" class="section">
        <h2 class="section-title">资源记录 ({{ task.resources.length }})</h2>
        <div class="resource-list">
          <div v-for="(r, i) in task.resources" :key="i" class="resource-item">
            <span class="resource-type">{{ r.type }}</span>
            <span class="resource-by">{{ r.by }}</span>
            <span class="resource-data">{{ JSON.stringify(r.data).slice(0, 100) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-detail {
  max-width: 900px;
}

.detail-header {
  margin-bottom: var(--space-xl);
}

.btn-back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85em;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
}

.btn-back:hover {
  color: var(--accent);
  background: var(--card-bg);
}

.loading, .error {
  color: var(--text-muted);
  padding: var(--space-xl);
}

.error {
  color: var(--error);
}

.section {
  margin-bottom: var(--space-2xl);
}

.section-title {
  font-size: 0.95em;
  font-weight: 600;
  margin-bottom: var(--space-md);
  color: var(--text-secondary);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
}

.info-item {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
}

.info-label {
  display: block;
  font-size: 0.75em;
  color: var(--text-muted);
  margin-bottom: var(--space-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-weight: 500;
  color: var(--text-primary);
}

.info-value.mono {
  font-family: monospace;
  font-size: 0.85em;
  word-break: break-all;
}

.status-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: 500;
}

.status-badge.pending {
  background: rgba(255, 159, 10, 0.12);
  color: var(--status-pending);
}

.status-badge.running {
  background: rgba(52, 199, 89, 0.12);
  color: var(--status-running);
}

.status-badge.reviewing {
  background: rgba(90, 200, 250, 0.12);
  color: var(--status-reviewing);
}

.status-badge.completed {
  background: rgba(48, 209, 88, 0.12);
  color: var(--status-completed);
}

.status-badge.failed {
  background: rgba(255, 69, 58, 0.12);
  color: var(--status-failed);
}

.mode-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: 500;
}

.mode-badge.serial {
  background: rgba(123, 138, 255, 0.12);
  color: var(--accent);
}

.mode-badge.parallel {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
}

.content-block {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.result-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--card-border);
}

.result-executor {
  font-weight: 600;
  color: var(--accent);
}

.result-data {
  margin: 0;
  padding: var(--space-lg);
  font-family: monospace;
  font-size: 0.82em;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-primary);
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.resource-list {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  border-bottom: 1px solid var(--card-border);
  font-size: 0.85em;
}

.resource-item:last-child {
  border-bottom: none;
}

.resource-type {
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 120px;
}

.resource-by {
  color: var(--accent);
  min-width: 80px;
}

.resource-data {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>
