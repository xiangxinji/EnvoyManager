<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { api, type TeamMember, type ServerClientInfo } from "../api";

const props = defineProps<{ team: string }>();

const leader = ref<{ username: string; nickname: string | null; avatar_url: string | null } | null>(null);
const members = ref<TeamMember[]>([]);
const onlineClients = ref<ServerClientInfo[]>([]);
let timer: ReturnType<typeof setInterval>;

async function load() {
  try {
    const [cfg, clients] = await Promise.all([
      api.getConfiguredMembers(props.team),
      api.getMembers(props.team),
    ]);
    leader.value = cfg.leader;
    members.value = cfg.members;
    onlineClients.value = clients;
  } catch {}
}

function isOnline(username: string): boolean {
  return onlineClients.value.some(c => c.id === username && c.status === "online");
}

const showAddModal = ref(false);
const addUsername = ref("");
const addResponsibilities = ref("");
const addCapabilities = ref("");
const adding = ref(false);
const addError = ref("");

async function handleAdd() {
  if (!addUsername.value.trim()) return;
  adding.value = true;
  addError.value = "";
  try {
    await api.addTeamMember(props.team, addUsername.value.trim(), addResponsibilities.value, addCapabilities.value);
    showAddModal.value = false;
    addUsername.value = "";
    addResponsibilities.value = "";
    addCapabilities.value = "";
    await load();
  } catch (e: any) {
    addError.value = e.message;
  } finally {
    adding.value = false;
  }
}

const removing = ref<string | null>(null);

const removeError = ref("");

async function handleRemove(username: string) {
  removing.value = username;
  removeError.value = "";
  try {
    await api.removeTeamMember(props.team, username);
    await load();
  } catch (e: any) {
    removeError.value = e.message;
    setTimeout(() => { removeError.value = ""; }, 4000);
  } finally {
    removing.value = null;
  }
}

function displayName(m: { username: string; nickname?: string | null }): string {
  return m.nickname || m.username;
}

function closeAddModal() {
  showAddModal.value = false;
  addUsername.value = "";
  addResponsibilities.value = "";
  addCapabilities.value = "";
  addError.value = "";
}

onMounted(() => { load(); timer = setInterval(load, 5000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="members">
    <div class="section-header">
      <h3 class="section-title">团队成员</h3>
      <button class="add-btn" @click="showAddModal = true">添加成员</button>
    </div>

    <div v-if="leader" class="member-card leader">
      <div class="member-avatar">{{ (leader.nickname || leader.username).charAt(0).toUpperCase() }}</div>
      <div class="member-info">
        <div class="member-name">
          {{ displayName(leader) }}
          <span class="role-badge leader-badge">Leader</span>
        </div>
        <div class="member-meta">{{ leader.username }}</div>
      </div>
      <div class="online-dot" :class="{ online: isOnline(leader.username), offline: !isOnline(leader.username) }" :title="isOnline(leader.username) ? '在线' : '离线'" />
    </div>

    <div v-if="members.length > 0" class="members-list">
      <div v-for="m in members" :key="m.username" class="member-card">
        <div class="member-avatar">{{ (m.nickname || m.username).charAt(0).toUpperCase() }}</div>
        <div class="member-info">
          <div class="member-name">{{ displayName(m) }}</div>
          <div class="member-meta">
            <span>{{ m.username }}</span>
            <span v-if="m.responsibilities" class="resp">{{ m.responsibilities }}</span>
          </div>
        </div>
        <div class="member-actions">
          <div class="online-dot small" :class="{ online: isOnline(m.username), offline: !isOnline(m.username) }" />
          <button class="remove-btn" :disabled="removing === m.username" @click="handleRemove(m.username)">
            {{ removing === m.username ? "移除中..." : "移除" }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="leader" class="empty">暂无其他成员</div>

    <div v-if="removeError" class="remove-error">{{ removeError }}</div>

    <div v-if="onlineClients.length > 0" class="online-section">
      <h4 class="sub-title">在线连接</h4>
      <div v-for="c in onlineClients" :key="c.id" class="client-row">
        <div class="online-dot online small" />
        <span>{{ c.id }}</span>
        <span class="client-role">{{ c.role }}</span>
        <span class="client-queue" v-if="c.queueLength > 0">队列: {{ c.queueLength }}</span>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay">
        <div class="modal-content">
          <h3 class="modal-title">添加团队成员</h3>
          <div v-if="addError" class="modal-error">{{ addError }}</div>
          <div class="form-group">
            <label>用户名</label>
            <input v-model="addUsername" placeholder="输入用户名" @keydown.enter="handleAdd" />
          </div>
          <div class="form-group">
            <label>职责</label>
            <input v-model="addResponsibilities" placeholder="可选" />
          </div>
          <div class="form-group">
            <label>能力</label>
            <input v-model="addCapabilities" placeholder="可选" />
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="closeAddModal">取消</button>
            <button class="confirm-btn" :disabled="adding || !addUsername.trim()" @click="handleAdd">
              {{ adding ? "添加中..." : "添加" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.members {
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

.add-btn {
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

.add-btn:hover { opacity: 0.85; }

.member-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-sm);
  transition: border-color 0.15s;
}

.member-card.leader {
  border-left: 3px solid var(--accent);
}

.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--glass-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9em;
  color: var(--accent);
  flex-shrink: 0;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-name {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.member-meta {
  font-size: 0.8em;
  color: var(--text-muted);
  display: flex;
  gap: var(--space-sm);
  margin-top: 2px;
}

.role-badge {
  font-size: 0.7em;
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.leader-badge {
  background: rgba(48, 209, 88, 0.12);
  color: var(--status-completed);
}

.resp {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.online-dot.online { background: #34c759; }
.online-dot.offline { background: var(--text-muted); opacity: 0.4; }
.online-dot.small { width: 6px; height: 6px; }

.remove-btn {
  background: none;
  border: 1px solid var(--border);
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.75em;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.remove-btn:hover { color: #ff453a; border-color: #ff453a; }
.remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.empty {
  padding: var(--space-lg);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
}

.remove-error {
  background: rgba(255, 69, 58, 0.1);
  color: #ff453a;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82em;
  margin-top: var(--space-md);
}

.online-section {
  margin-top: var(--space-xl);
}

.sub-title {
  font-size: 0.88em;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-md);
}

.client-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px 0;
  font-size: 0.82em;
  color: var(--text-muted);
}

.client-role {
  font-size: 0.8em;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--glass-bg-light);
}

.client-queue {
  font-size: 0.8em;
  color: var(--accent);
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
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
}

.modal-title {
  font-size: 1.05em;
  font-weight: 600;
  margin-bottom: var(--space-lg);
  color: var(--text-primary);
}

.modal-error {
  background: rgba(255, 69, 58, 0.1);
  color: #ff453a;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.82em;
  margin-bottom: var(--space-md);
}

.form-group {
  margin-bottom: var(--space-md);
}

.form-group label {
  display: block;
  font-size: 0.82em;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
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
  transition: border-color 0.15s;
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
