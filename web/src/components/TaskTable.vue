<script setup lang="ts">
import type { TaskInfo } from "../api";

const props = defineProps<{ tasks: TaskInfo[]; team: string }>();

const statusLabels: Record<string, string> = {
  pending: "等待中",
  running: "执行中",
  reviewing: "审查中",
  completed: "已完成",
  failed: "失败",
};

const modeLabels: Record<string, string> = {
  serial: "串行",
  parallel: "并行",
};

function formatResult(result: unknown): string {
  if (result == null) return "—";
  if (typeof result === "string") return result.length > 60 ? result.slice(0, 60) + "..." : result;
  const str = JSON.stringify(result);
  return str.length > 60 ? str.slice(0, 60) + "..." : str;
}

function taskUrl(id: string): string {
  return `/teams/${props.team}/tasks/${id}`;
}
</script>

<template>
  <div class="table-wrap">
    <table v-if="tasks.length > 0">
      <thead>
        <tr>
          <th>内容</th>
          <th>创建者</th>
          <th>模式</th>
          <th>状态</th>
          <th>执行人</th>
          <th>结果</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <router-link
          v-for="t in tasks"
          :key="t.id"
          :to="taskUrl(t.id)"
          custom
          v-slot="{ navigate }"
        >
          <tr class="clickable-row" @click="navigate">
            <td class="content-cell">{{ t.content }}</td>
            <td>{{ t.createBy }}</td>
            <td>
              <span class="mode-badge" :class="t.mode">{{ modeLabels[t.mode] }}</span>
            </td>
            <td>
              <span class="status-badge" :class="t.status">{{ statusLabels[t.status] }}</span>
            </td>
            <td>
              <span v-if="t.assignedTo" class="executor">{{ t.assignedTo }}</span>
              <span v-else class="subscribers">{{ t.subscribe.join(", ") }}</span>
            </td>
            <td class="result-cell">{{ formatResult(t.result) }}</td>
            <td class="action-cell">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </td>
          </tr>
        </router-link>
      </tbody>
    </table>
    <div v-else class="empty">暂无任务</div>
  </div>
</template>

<style scoped>
.table-wrap {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88em;
}

th {
  text-align: left;
  padding: 12px 16px;
  font-weight: 600;
  color: var(--text-muted);
  font-size: 0.8em;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
}

td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
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

.content-cell {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-weight: 500;
}

.mode-badge, .status-badge {
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 10px;
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

.subscribers {
  font-size: 0.85em;
  color: var(--text-muted);
}

.executor {
  font-size: 0.85em;
  font-weight: 500;
  color: var(--accent);
}

.result-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82em;
  color: var(--text-muted);
}

.action-cell {
  color: var(--text-muted);
  width: 30px;
}

.empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
}
</style>
