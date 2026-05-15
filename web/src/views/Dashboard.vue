<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { api, type DashboardData } from "../api";

const data = ref<DashboardData | null>(null);
const loading = ref(true);
const error = ref("");
let timer: ReturnType<typeof setInterval>;

async function refresh() {
  try {
    data.value = await api.getDashboard();
    error.value = "";
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});

onUnmounted(() => clearInterval(timer));

function formatResult(result: unknown): string {
  if (result == null) return "—";
  if (typeof result === "string") return result.length > 50 ? result.slice(0, 50) + "..." : result;
  const str = JSON.stringify(result);
  return str.length > 50 ? str.slice(0, 50) + "..." : str;
}

function formatTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="dashboard">
    <h1 class="page-title">概览</h1>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else-if="data">
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">{{ data.totalTeams }}</div>
          <div class="stat-label">团队</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ data.totalOnline }}</div>
          <div class="stat-label">在线成员</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ data.totalTasks }}</div>
          <div class="stat-label">总任务</div>
        </div>
      </div>

      <div class="task-breakdown">
        <h2 class="section-title">任务统计</h2>
        <div class="breakdown-grid">
          <div class="breakdown-item">
            <span class="dot pending"></span>
            <span class="breakdown-label">等待中</span>
            <span class="breakdown-value">{{ data.taskSummary.pending ?? 0 }}</span>
          </div>
          <div class="breakdown-item">
            <span class="dot running"></span>
            <span class="breakdown-label">执行中</span>
            <span class="breakdown-value">{{ data.taskSummary.running ?? 0 }}</span>
          </div>
          <div class="breakdown-item">
            <span class="dot reviewing"></span>
            <span class="breakdown-label">审查中</span>
            <span class="breakdown-value">{{ data.taskSummary.reviewing ?? 0 }}</span>
          </div>
          <div class="breakdown-item">
            <span class="dot completed"></span>
            <span class="breakdown-label">已完成</span>
            <span class="breakdown-value">{{ data.taskSummary.completed ?? 0 }}</span>
          </div>
          <div class="breakdown-item">
            <span class="dot failed"></span>
            <span class="breakdown-label">失败</span>
            <span class="breakdown-value">{{ data.taskSummary.failed ?? 0 }}</span>
          </div>
        </div>
      </div>

      <div v-if="data.recentTasks?.length" class="recent-tasks">
        <h2 class="section-title">最近任务</h2>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>团队</th>
                <th>内容</th>
                <th>发起人</th>
                <th>执行人</th>
                <th>状态</th>
                <th>结果</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              <router-link
                v-for="task in data.recentTasks"
                :key="task.id"
                :to="`/teams/${task.team}/tasks/${task.id}`"
                custom
                v-slot="{ navigate }"
              >
                <tr class="clickable-row" @click="navigate">
                  <td>{{ task.team }}</td>
                  <td class="cell-content">{{ task.content }}</td>
                  <td>{{ task.createBy }}</td>
                  <td>{{ task.assignedTo ?? '—' }}</td>
                  <td><span class="status-badge" :class="task.status">{{ task.status }}</span></td>
                  <td class="cell-result">{{ formatResult(task.result) }}</td>
                  <td class="cell-time">{{ formatTime(task.createdAt) }}</td>
                </tr>
              </router-link>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 900px;
}

.page-title {
  font-size: 1.4em;
  font-weight: 700;
  margin-bottom: var(--space-xl);
}

.loading, .error {
  color: var(--text-muted);
  padding: var(--space-xl);
}

.error {
  color: var(--error);
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  box-shadow: var(--shadow-sm);
}

.stat-value {
  font-size: 2em;
  font-weight: 700;
  color: var(--accent);
}

.stat-label {
  font-size: 0.85em;
  color: var(--text-muted);
  margin-top: var(--space-xs);
}

.section-title {
  font-size: 1em;
  font-weight: 600;
  margin-bottom: var(--space-md);
  color: var(--text-secondary);
}

.breakdown-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-md);
}

.breakdown-item {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  box-shadow: var(--shadow-sm);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot.pending { background: var(--status-pending); }
.dot.running { background: var(--status-running); }
.dot.reviewing { background: var(--status-reviewing); }
.dot.completed { background: var(--status-completed); }
.dot.failed { background: var(--status-failed); }

.breakdown-label {
  font-size: 0.85em;
  color: var(--text-secondary);
  flex: 1;
}

.breakdown-value {
  font-weight: 600;
  font-size: 0.95em;
}

.recent-tasks {
  margin-top: var(--space-2xl);
}

.table-wrapper {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85em;
}

th {
  text-align: left;
  padding: var(--space-md) var(--space-lg);
  color: var(--text-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--card-border);
  white-space: nowrap;
}

td {
  padding: var(--space-sm) var(--space-lg);
  border-bottom: 1px solid var(--card-border);
  color: var(--text-secondary);
}

tr:last-child td {
  border-bottom: none;
}

.clickable-row {
  cursor: pointer;
  transition: background 0.1s;
}

.clickable-row:hover {
  background: var(--card-hover);
}

.cell-content,
.cell-result {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-time {
  white-space: nowrap;
  color: var(--text-muted);
}

.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.85em;
  font-weight: 500;
}

.status-badge.pending { color: var(--status-pending); }
.status-badge.running { color: var(--status-running); }
.status-badge.reviewing { color: var(--status-reviewing); }
.status-badge.completed { color: var(--status-completed); }
.status-badge.failed { color: var(--status-failed); }
</style>
