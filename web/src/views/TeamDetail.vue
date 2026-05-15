<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { api, type ServerClientInfo, type TaskInfo, type UserInfo, type TeamMember } from "../api";
import MemberTable from "../components/MemberTable.vue";
import TaskTable from "../components/TaskTable.vue";

const props = defineProps<{ name: string }>();

const members = ref<ServerClientInfo[]>([]);
const tasks = ref<TaskInfo[]>([]);
const loading = ref(true);
const error = ref("");
const teamLeader = ref("");
const configuredMembers = ref<TeamMember[]>([]);
const allUsers = ref<UserInfo[]>([]);
const showAddMember = ref(false);
const addUsername = ref("");
const addResponsibilities = ref("");
const addCapabilities = ref("");
const adding = ref(false);
let timer: ReturnType<typeof setInterval>;

async function refresh() {
  try {
    const [m, t, cfg, users] = await Promise.all([
      api.getMembers(props.name),
      api.getTasks(props.name),
      api.getConfiguredMembers(props.name),
      api.getUsers(),
    ]);
    members.value = m;
    tasks.value = t;
    teamLeader.value = cfg.leader;
    configuredMembers.value = cfg.members;
    allUsers.value = users;
    error.value = "";
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

const existingUsernames = computed(() => {
  const set = new Set(configuredMembers.value.map((m) => m.username));
  set.add(teamLeader.value);
  return set;
});

const availableMembers = computed(() =>
  allUsers.value.filter((u) => u.role === "member" && !existingUsernames.value.has(u.username))
);

async function handleAddMember() {
  const username = addUsername.value;
  if (!username) return;
  adding.value = true;
  try {
    await api.addTeamMember(props.name, username, addResponsibilities.value || undefined, addCapabilities.value || undefined);
    addUsername.value = "";
    addResponsibilities.value = "";
    addCapabilities.value = "";
    showAddMember.value = false;
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    adding.value = false;
  }
}

async function handleRemoveMember(username: string) {
  try {
    await api.removeTeamMember(props.name, username);
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  }
}

watch(() => props.name, refresh);

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="detail">
    <div class="detail-header">
      <h1 class="page-title">{{ name }}</h1>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">团队成员</h2>
          <button class="btn-add" @click="showAddMember = true">添加成员</button>
        </div>

        <div class="member-list">
          <div class="member-item leader">
            <span class="member-name">{{ teamLeader }}</span>
            <span class="role-badge leader-badge">Leader</span>
          </div>
          <div v-for="m in configuredMembers" :key="m.username" class="member-item">
            <span class="member-name">{{ m.username }}</span>
            <div class="member-desc-group">
              <span class="member-resp">{{ m.responsibilities || '-' }}</span>
              <span class="member-cap" :class="{ 'empty-cap': !m.capabilities }">{{ m.capabilities || '未设置' }}</span>
            </div>
            <span class="role-badge member-badge">Member</span>
            <button class="btn-remove" @click="handleRemoveMember(m.username)" title="移除">x</button>
          </div>
          <div v-if="configuredMembers.length === 0" class="empty-hint">暂未绑定成员</div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">在线连接 ({{ members.length }})</h2>
        <MemberTable :members="members" />
      </section>

      <section class="section">
        <h2 class="section-title">任务 ({{ tasks.length }})</h2>
        <TaskTable :tasks="tasks" :team="name" />
      </section>
    </template>

    <div v-if="showAddMember" class="modal-overlay" @click.self="showAddMember = false">
      <div class="modal">
        <h3>添加成员</h3>
        <select v-model="addUsername">
          <option value="" disabled>选择用户</option>
          <option v-for="u in availableMembers" :key="u.username" :value="u.username">
            {{ u.username }}
          </option>
        </select>
        <p v-if="availableMembers.length === 0" class="hint">暂无可添加的 Member 用户</p>
        <input
          v-model="addResponsibilities"
          placeholder="职责说明（可选）"
        />
        <input
          v-model="addCapabilities"
          placeholder="能力描述（可选）"
        />
        <div class="modal-actions">
          <button class="btn-cancel" @click="showAddMember = false">取消</button>
          <button class="btn-confirm" :disabled="adding || !addUsername" @click="handleAddMember">
            {{ adding ? "添加中..." : "添加" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail {
  width: 100%;
}

.detail-header {
  margin-bottom: var(--space-xl);
}

.page-title {
  font-size: 1.4em;
  font-weight: 700;
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

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-md);
}

.section-title {
  font-size: 1em;
  font-weight: 600;
  color: var(--text-secondary);
}

.btn-add {
  background: var(--accent);
  color: white;
  border: none;
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82em;
  cursor: pointer;
}

.btn-add:hover {
  background: var(--accent-hover);
}

.member-list {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.member-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.88em;
}

.member-item:last-child {
  border-bottom: none;
}

.member-item.leader {
  background: var(--bg-secondary);
}

.member-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.member-desc-group {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.member-resp {
  color: var(--text-muted);
  font-size: 0.85em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-resp:empty::before {
  content: '-';
}

.member-cap {
  font-size: 0.82em;
  padding: 1px 8px;
  border-radius: var(--radius-sm);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.member-cap:not(.empty-cap) {
  color: var(--accent);
  background: var(--accent-light);
}

.member-cap.empty-cap {
  color: var(--text-muted);
  background: var(--bg-secondary);
}

.role-badge {
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.leader-badge {
  background: var(--accent-light);
  color: var(--accent);
}

.member-badge {
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.btn-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.btn-remove:hover {
  color: var(--error);
  background: var(--bg-secondary);
}

.empty-hint {
  padding: var(--space-lg);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85em;
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

.modal {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  width: 380px;
  box-shadow: var(--shadow-md);
}

.modal h3 {
  margin-bottom: var(--space-lg);
  font-size: 1.1em;
}

.modal select,
.modal input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9em;
  outline: none;
  margin-bottom: var(--space-md);
}

.modal select:focus,
.modal input:focus {
  border-color: var(--accent);
}

.hint {
  color: var(--text-muted);
  font-size: 0.8em;
  margin-bottom: var(--space-sm);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.btn-cancel {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.88em;
}

.btn-confirm {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.88em;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
