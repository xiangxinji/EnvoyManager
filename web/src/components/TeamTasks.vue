<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { api, type TaskInfo } from "../api";
import TaskTable from "./TaskTable.vue";

const props = defineProps<{ team: string }>();

const tasks = ref<TaskInfo[]>([]);
const loading = ref(true);
const statusFilter = ref<string>("all");
let timer: ReturnType<typeof setInterval>;

async function load() {
  try {
    tasks.value = await api.getTasks(props.team);
  } catch {
  } finally {
    loading.value = false;
  }
}

const filteredTasks = ref<TaskInfo[]>([]);
function updateFiltered() {
  if (statusFilter.value === "all") {
    filteredTasks.value = tasks.value;
  } else {
    filteredTasks.value = tasks.value.filter(t => t.status === statusFilter.value);
  }
}

watch([tasks, statusFilter], updateFiltered, { immediate: true });

const statusOptions = [
  { value: "all", label: "全部" },
  { value: "pending", label: "等待中" },
  { value: "running", label: "执行中" },
  { value: "reviewing", label: "审查中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

async function handleDelete(taskId: string) {
  if (!confirm(`确定要删除任务 "${taskId}" 吗？`)) return;
  try {
    await api.deleteTask(props.team, taskId);
    await load();
  } catch (e: any) {
    alert("删除失败: " + e.message);
  }
}

async function handleDeleteAll() {
  if (!confirm("确定要清空团队所有任务吗？此操作不可恢复。")) return;
  try {
    await api.deleteAllTasks(props.team);
    await load();
  } catch (e: any) {
    alert("清空失败: " + e.message);
  }
}

onMounted(() => { load(); timer = setInterval(load, 5000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="tasks">
    <div class="section-header">
      <h3 class="section-title">任务列表</h3>
      <div class="filter-bar">
        <button
          v-for="opt in statusOptions"
          :key="opt.value"
          class="filter-btn"
          :class="{ active: statusFilter === opt.value }"
          @click="statusFilter = opt.value"
        >{{ opt.label }}</button>
        <button v-if="tasks.length > 0" class="clear-btn" @click="handleDeleteAll">清空所有</button>
      </div>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <TaskTable v-else :tasks="filteredTasks" :team="team" @delete="handleDelete" />
  </div>
</template>

<style scoped>
.tasks {
  width: 100%;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.section-title {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-secondary);
}

.filter-bar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-btn {
  background: none;
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.78em;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.filter-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.clear-btn {
  background: none;
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.78em;
  color: var(--error);
  cursor: pointer;
  margin-left: 8px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.clear-btn:hover {
  color: #fff;
  background: var(--error);
  border-color: var(--error);
}

.loading {
  padding: var(--space-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
}
</style>
