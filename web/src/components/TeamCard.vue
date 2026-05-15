<script setup lang="ts">
import type { TeamInfo } from "../api";

defineProps<{ team: TeamInfo }>();
defineEmits<{ click: []; delete: [] }>();
</script>

<template>
  <div class="team-card" @click="$emit('click')">
    <div class="card-header">
      <span class="team-name">{{ team.name }}</span>
      <span class="status-dot" :class="team.status"></span>
    </div>
    <div class="card-body">
      <div class="info-row">
        <span class="info-label">端口</span>
        <span class="info-value">{{ team.port }}</span>
      </div>
      <div v-if="team.stats" class="info-row">
        <span class="info-label">在线</span>
        <span class="info-value">{{ team.stats.onlineClients }} / {{ team.stats.totalClients }}</span>
      </div>
      <div v-if="team.stats" class="info-row">
        <span class="info-label">任务</span>
        <span class="info-value">{{ team.stats.totalTasks }}</span>
      </div>
    </div>
    <div class="card-footer">
      <button class="btn-delete" @click.stop="$emit('delete')">删除</button>
    </div>
  </div>
</template>

<style scoped>
.team-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.team-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.team-name {
  font-weight: 600;
  font-size: 1.05em;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.running {
  background: var(--status-running);
}

.status-dot.stopped {
  background: var(--text-muted);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85em;
}

.info-label {
  color: var(--text-muted);
}

.info-value {
  color: var(--text-secondary);
  font-weight: 500;
}

.card-footer {
  margin-top: var(--space-md);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.8em;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.btn-delete:hover {
  color: var(--error);
  background: rgba(255, 69, 58, 0.1);
}
</style>
