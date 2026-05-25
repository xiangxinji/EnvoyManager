<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { api, type TaskInfo } from "../api";

const props = defineProps<{ team: string }>();

const members = ref(0);
const online = ref(0);
const taskStats = ref<Record<string, number>>({});
const totalTasks = ref(0);
const cloudFiles = ref(0);
const cloudSize = ref(0);
const brainsFiles = ref(0);
const brainsSize = ref(0);
const recentTasks = ref<TaskInfo[]>([]);
let timer: ReturnType<typeof setInterval>;

async function load() {
  try {
    const [team, cfg, tasks, cloud, brains] = await Promise.all([
      api.getTeam(props.team),
      api.getConfiguredMembers(props.team),
      api.getTasks(props.team),
      api.getCloudStats(props.team).catch(() => null),
      api.getBrainsStats(props.team).catch(() => null),
    ]);
    members.value = cfg.members.length + 1;
    online.value = team.stats?.onlineClients ?? 0;
    totalTasks.value = team.stats?.totalTasks ?? 0;
    taskStats.value = team.stats?.tasksByStatus ?? {};
    recentTasks.value = tasks.slice(0, 5);
    cloudFiles.value = cloud?.totalFiles ?? 0;
    cloudSize.value = cloud?.totalSize ?? 0;
    brainsFiles.value = brains?.totalFiles ?? 0;
    brainsSize.value = brains?.totalSize ?? 0;
  } catch {}
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

const statusLabels: Record<string, string> = {
  pending: "等待中", running: "执行中", reviewing: "审查中",
  completed: "已完成", failed: "失败",
};

onMounted(() => { load(); timer = setInterval(load, 5000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="overview">
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-value">{{ members }}</span>
        <span class="stat-label">成员</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ online }}</span>
        <span class="stat-label">在线</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ totalTasks }}</span>
        <span class="stat-label">任务</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ cloudFiles }}</span>
        <span class="stat-label">云文件</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ formatSize(cloudSize) }}</span>
        <span class="stat-label">云资源大小</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ brainsFiles }}</span>
        <span class="stat-label">知识库文件</span>
      </div>
    </div>

    <div v-if="Object.keys(taskStats).length > 0" class="section">
      <h3 class="section-title">任务状态分布</h3>
      <div class="task-status-bar">
        <div
          v-for="(count, status) in taskStats"
          :key="status"
          class="status-segment"
          :class="status"
          :style="{ flex: count }"
          :title="`${statusLabels[status] || status}: ${count}`"
        />
      </div>
      <div class="status-legend">
        <span v-for="(count, status) in taskStats" :key="status" class="legend-item">
          <span class="legend-dot" :class="status" />
          {{ statusLabels[status] || status }}: {{ count }}
        </span>
      </div>
    </div>

    <div v-if="recentTasks.length > 0" class="section">
      <h3 class="section-title">最近任务</h3>
      <div class="recent-tasks">
        <div v-for="t in recentTasks" :key="t.id" class="recent-task">
          <span class="task-content">{{ t.content.length > 50 ? t.content.slice(0, 50) + '...' : t.content }}</span>
          <span class="status-badge" :class="t.status">{{ statusLabels[t.status] }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-2xl);
}

.stat-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}

.stat-value {
  font-size: 1.4em;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.82em;
  color: var(--text-muted);
}

.section {
  margin-bottom: var(--space-xl);
}

.section-title {
  font-size: 0.95em;
  font-weight: 600;
  margin-bottom: var(--space-md);
  color: var(--text-secondary);
}

.task-status-bar {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  gap: 1px;
  background: var(--border);
}

.status-segment {
  border-radius: 3px;
}

.status-segment.pending { background: var(--status-pending); }
.status-segment.running { background: var(--status-running); }
.status-segment.reviewing { background: var(--status-reviewing); }
.status-segment.completed { background: var(--status-completed); }
.status-segment.failed { background: var(--status-failed); }

.status-legend {
  display: flex;
  gap: var(--space-md);
  margin-top: var(--space-sm);
  flex-wrap: wrap;
}

.legend-item {
  font-size: 0.8em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot.pending { background: var(--status-pending); }
.legend-dot.running { background: var(--status-running); }
.legend-dot.reviewing { background: var(--status-reviewing); }
.legend-dot.completed { background: var(--status-completed); }
.legend-dot.failed { background: var(--status-failed); }

.recent-tasks {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.recent-task {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.88em;
}

.recent-task:last-child { border-bottom: none; }

.task-content {
  color: var(--text-primary);
  font-weight: 500;
}

.status-badge {
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.status-badge.pending { background: rgba(255,159,10,0.12); color: var(--status-pending); }
.status-badge.running { background: rgba(52,199,89,0.12); color: var(--status-running); }
.status-badge.reviewing { background: rgba(90,200,250,0.12); color: var(--status-reviewing); }
.status-badge.completed { background: rgba(48,209,88,0.12); color: var(--status-completed); }
.status-badge.failed { background: rgba(255,69,58,0.12); color: var(--status-failed); }
</style>
