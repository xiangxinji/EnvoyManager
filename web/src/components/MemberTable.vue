<script setup lang="ts">
import type { ServerClientInfo } from "../api";

defineProps<{ members: ServerClientInfo[] }>();

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="table-wrap">
    <table v-if="members.length > 0">
      <thead>
        <tr>
          <th>ID</th>
          <th>角色</th>
          <th>状态</th>
          <th>连接时间</th>
          <th>队列</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in members" :key="m.id">
          <td class="id-cell">{{ m.id }}</td>
          <td>
            <span class="role-badge" :class="m.role">{{ m.role }}</span>
          </td>
          <td>
            <span class="status-badge" :class="m.status">
              {{ m.status === "online" ? "在线" : "离线" }}
            </span>
          </td>
          <td>{{ formatTime(m.connectedAt) }}</td>
          <td>{{ m.queueLength }}</td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">暂无成员</div>
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

.id-cell {
  font-weight: 500;
  color: var(--text-primary);
}

.role-badge, .status-badge {
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.role-badge.client {
  background: var(--accent-light);
  color: var(--accent);
}

.role-badge.watcher {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
}

.status-badge.online {
  background: rgba(52, 199, 89, 0.12);
  color: var(--status-running);
}

.status-badge.offline {
  background: rgba(142, 142, 160, 0.12);
  color: var(--text-muted);
}

.empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
}
</style>
