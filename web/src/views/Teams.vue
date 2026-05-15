<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { api, type TeamInfo, type UserInfo } from "../api";
import TeamCard from "../components/TeamCard.vue";

const router = useRouter();
const teams = ref<TeamInfo[]>([]);
const loading = ref(true);
const error = ref("");
const showCreate = ref(false);
const newName = ref("");
const newLeader = ref("");
const creating = ref(false);
const leaders = ref<UserInfo[]>([]);
let timer: ReturnType<typeof setInterval>;

async function refresh() {
  try {
    const [teamList, users] = await Promise.all([api.getTeams(), api.getUsers()]);
    teams.value = teamList;
    leaders.value = users.filter((u) => u.role === "leader");
    error.value = "";
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  const name = newName.value.trim();
  const leader = newLeader.value;
  if (!name || !leader) return;
  creating.value = true;
  try {
    await api.createTeam(name, leader);
    newName.value = "";
    newLeader.value = "";
    showCreate.value = false;
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function handleDelete(name: string) {
  if (!confirm(`确定要删除团队 "${name}" 吗？`)) return;
  try {
    await api.deleteTeam(name);
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  }
}

function goToDetail(name: string) {
  router.push(`/teams/${name}`);
}

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="teams-page">
    <div class="page-header">
      <h1 class="page-title">团队管理</h1>
      <button class="btn-create" @click="showCreate = true">创建团队</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-if="teams.length === 0" class="empty">
      <p>暂无团队，点击上方按钮创建</p>
    </div>

    <div v-else class="team-grid">
      <TeamCard
        v-for="team in teams"
        :key="team.name"
        :team="team"
        @click="goToDetail(team.name)"
        @delete="handleDelete(team.name)"
      />
    </div>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <h3>创建团队</h3>
        <input
          v-model="newName"
          placeholder="输入团队名称"
          autofocus
        />
        <select v-model="newLeader">
          <option value="" disabled>选择 Leader</option>
          <option v-for="u in leaders" :key="u.username" :value="u.username">{{ u.username }}</option>
        </select>
        <p v-if="leaders.length === 0" class="hint">暂无 Leader 用户，请先在用户管理中创建</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showCreate = false">取消</button>
          <button class="btn-confirm" :disabled="creating || !newName.trim() || !newLeader" @click="handleCreate">
            {{ creating ? "创建中..." : "创建" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.teams-page {
  width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xl);
}

.page-title {
  font-size: 1.4em;
  font-weight: 700;
}

.btn-create {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.88em;
  font-weight: 500;
  cursor: pointer;
}

.btn-create:hover {
  background: var(--accent-hover);
}

.loading, .error {
  color: var(--text-muted);
  padding: var(--space-xl);
}

.error {
  color: var(--error);
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-lg);
}

.empty {
  grid-column: 1 / -1;
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-2xl);
  font-size: 0.9em;
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

.modal input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9em;
  outline: none;
  margin-bottom: var(--space-lg);
}

.modal input:focus {
  border-color: var(--accent);
}

.modal select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9em;
  outline: none;
  margin-bottom: var(--space-sm);
}

.modal select:focus {
  border-color: var(--accent);
}

.hint {
  color: var(--text-muted);
  font-size: 0.8em;
  margin-bottom: var(--space-lg);
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
