<script setup lang="ts">
import { ref, onMounted } from "vue";
import { api, type UserInfo } from "../api";

const users = ref<UserInfo[]>([]);
const loading = ref(true);
const error = ref("");
const showCreate = ref(false);
const showEdit = ref(false);
const editTarget = ref<UserInfo | null>(null);
const editResponsibilities = ref("");
const editCapabilities = ref("");
const editSaving = ref(false);
const newName = ref("");
const newPass = ref("");
const newRole = ref<"leader" | "member">("member");
const newResponsibilities = ref("");
const newCapabilities = ref("");
const creating = ref(false);
const newNickname = ref("");
const editNickname = ref("");
const editAvatarFile = ref<File | null>(null);
const editAvatarPreview = ref("");

async function refresh() {
  try {
    users.value = await api.getUsers();
    error.value = "";
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function handleCreate() {
  const username = newName.value.trim();
  const password = newPass.value;
  if (!username || !password) return;
  creating.value = true;
  try {
    await api.createUser(username, password, newRole.value, newResponsibilities.value.trim() || undefined, newCapabilities.value.trim() || undefined, newNickname.value.trim() || undefined);
    newName.value = "";
    newPass.value = "";
    newRole.value = "member";
    newResponsibilities.value = "";
    newCapabilities.value = "";
    newNickname.value = "";
    showCreate.value = false;
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function handleDelete(username: string) {
  if (!confirm(`确定要删除用户 "${username}" 吗？`)) return;
  try {
    await api.deleteUser(username);
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  }
}

function openEdit(u: UserInfo) {
  editTarget.value = u;
  editResponsibilities.value = u.responsibilities;
  editCapabilities.value = u.capabilities;
  editNickname.value = u.nickname || "";
  editAvatarPreview.value = u.avatar_url || "";
  editAvatarFile.value = null;
  showEdit.value = true;
}

async function handleEditSave() {
  if (!editTarget.value) return;
  editSaving.value = true;
  try {
    await api.updateUser(editTarget.value.username, {
      responsibilities: editResponsibilities.value.trim(),
      capabilities: editCapabilities.value.trim(),
      nickname: editNickname.value.trim() || null,
    });
    if (editAvatarFile.value) {
      await api.uploadAvatar(editTarget.value.username, editAvatarFile.value);
    }
    showEdit.value = false;
    editTarget.value = null;
    editAvatarFile.value = null;
    editAvatarPreview.value = "";
    await refresh();
  } catch (e: any) {
    error.value = e.message;
  } finally {
    editSaving.value = false;
  }
}

function handleAvatarSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  editAvatarFile.value = file;
  editAvatarPreview.value = URL.createObjectURL(file);
}

onMounted(refresh);
</script>

<template>
  <div class="users-page">
    <div class="page-header">
      <h1 class="page-title">用户管理</h1>
      <button class="btn-create" @click="showCreate = true">新增用户</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <div class="table-wrap">
        <table v-if="users.length > 0">
          <thead>
            <tr>
              <th>头像</th>
              <th>用户名</th>
              <th>昵称</th>
              <th>角色</th>
              <th>职责</th>
              <th>能力</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.username">
              <td class="avatar-cell">
                <img v-if="u.avatar_url" :src="u.avatar_url" class="avatar-img" />
                <span v-else class="avatar-placeholder">{{ u.username.charAt(0).toUpperCase() }}</span>
              </td>
              <td class="name-cell">{{ u.username }}</td>
              <td class="nickname-cell">{{ u.nickname || '-' }}</td>
              <td>
                <span class="role-badge" :class="u.role">{{ u.role }}</span>
              </td>
              <td class="desc-cell">{{ u.responsibilities || '-' }}</td>
              <td class="desc-cell">{{ u.capabilities || '-' }}</td>
              <td>{{ new Date(u.createdAt).toLocaleString() }}</td>
              <td class="actions-cell">
                <button class="btn-edit" @click="openEdit(u)">编辑</button>
                <button class="btn-delete" @click="handleDelete(u.username)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">暂无用户，点击上方按钮新增</div>
      </div>
    </template>

    <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
      <div class="modal">
        <h3>新增用户</h3>
        <div class="field">
          <label>用户名</label>
          <input v-model="newName" placeholder="输入用户名" @keydown.enter="handleCreate" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="newPass" type="password" placeholder="输入密码" @keydown.enter="handleCreate" />
        </div>
        <div class="field">
          <label>角色</label>
          <div class="role-select">
            <button class="role-btn" :class="{ active: newRole === 'leader' }" @click="newRole = 'leader'">Leader</button>
            <button class="role-btn" :class="{ active: newRole === 'member' }" @click="newRole = 'member'">Member</button>
          </div>
        </div>
        <div class="field">
          <label>昵称</label>
          <input v-model="newNickname" placeholder="输入昵称（选填）" @keydown.enter="handleCreate" />
        </div>
        <div v-if="newRole === 'member'" class="field">
          <label>职责描述</label>
          <textarea v-model="newResponsibilities" placeholder="描述成员的职责（选填）" rows="2" @keydown.enter.ctrl="handleCreate"></textarea>
        </div>
        <div v-if="newRole === 'member'" class="field">
          <label>能力描述</label>
          <textarea v-model="newCapabilities" placeholder="描述成员的技能和能力（选填）" rows="2" @keydown.enter.ctrl="handleCreate"></textarea>
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showCreate = false; error = ''">取消</button>
          <button class="btn-confirm" :disabled="creating || !newName.trim() || !newPass" @click="handleCreate">
            {{ creating ? "创建中..." : "创建" }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showEdit" class="modal-overlay" @click.self="showEdit = false">
      <div class="modal">
        <h3>编辑用户 - {{ editTarget?.username }}</h3>
        <div class="field">
          <label>昵称</label>
          <input v-model="editNickname" placeholder="输入昵称（选填）" />
        </div>
        <div class="field avatar-upload-field">
          <label>头像</label>
          <div class="avatar-upload-area">
            <img v-if="editAvatarPreview" :src="editAvatarPreview" class="avatar-preview" />
            <span v-else class="avatar-placeholder avatar-placeholder-lg">{{ editTarget?.username?.charAt(0).toUpperCase() || '?' }}</span>
            <label class="avatar-upload-btn">
              选择图片
              <input type="file" accept="image/*" hidden @change="handleAvatarSelect" />
            </label>
          </div>
        </div>
        <div class="field">
          <label>职责描述</label>
          <textarea v-model="editResponsibilities" placeholder="描述成员的职责（选填）" rows="2"></textarea>
        </div>
        <div class="field">
          <label>能力描述</label>
          <textarea v-model="editCapabilities" placeholder="描述成员的技能和能力（选填）" rows="2"></textarea>
        </div>
        <div v-if="error" class="error">{{ error }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="showEdit = false; error = ''">取消</button>
          <button class="btn-confirm" :disabled="editSaving" @click="handleEditSave">
            {{ editSaving ? "保存中..." : "保存" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-page {
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

.loading {
  color: var(--text-muted);
  padding: var(--space-xl);
}

.error {
  color: var(--error);
  font-size: 0.82em;
}

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

.name-cell {
  font-weight: 600;
  color: var(--text-primary);
}

.desc-cell {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82em;
}

.actions-cell {
  display: flex;
  gap: var(--space-sm);
}

.btn-edit {
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.82em;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}

.btn-edit:hover {
  background: var(--accent-light);
}

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.82em;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}

.btn-delete:hover {
  color: var(--error);
  background: rgba(255, 69, 58, 0.1);
}

.empty {
  padding: var(--space-2xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88em;
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

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.field label {
  font-size: 0.82em;
  font-weight: 500;
  color: var(--text-secondary);
}

.field input {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9em;
  outline: none;
}

.field input:focus {
  border-color: var(--accent);
}

.field textarea {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9em;
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.field textarea:focus {
  border-color: var(--accent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-md);
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

.role-select {
  display: flex;
  gap: var(--space-sm);
}

.role-btn {
  flex: 1;
  padding: 8px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.85em;
  font-weight: 600;
  cursor: pointer;
}

.role-btn.active {
  border-color: var(--accent);
  background: var(--accent-light);
  color: var(--accent);
}

.role-badge {
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.role-badge.leader {
  background: rgba(255, 159, 10, 0.12);
  color: #ff9f0a;
}

.role-badge.member {
  background: var(--accent-light);
  color: var(--accent);
}

.avatar-cell {
  width: 40px;
}

.avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-light, rgba(0, 122, 255, 0.1));
  color: var(--accent, #007aff);
  font-size: 0.82em;
  font-weight: 600;
}

.avatar-placeholder-lg {
  width: 48px;
  height: 48px;
  font-size: 1.1em;
}

.nickname-cell {
  font-size: 0.88em;
  color: var(--text-secondary);
}

.avatar-upload-field .avatar-upload-area {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.avatar-preview {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border);
}

.avatar-upload-btn {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.82em;
  cursor: pointer;
}

.avatar-upload-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
