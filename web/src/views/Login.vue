<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();
const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");

async function handleLogin() {
  const user = username.value.trim();
  const pass = password.value;
  if (!user || !pass) {
    error.value = "请输入用户名和密码";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const res = await api.adminAuth(user, pass);
    localStorage.setItem("admin_token", res.token);
    router.push("/");
  } catch (e: any) {
    error.value = e.message || "登录失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <span class="login-logo">E</span>
        <h1>Envoy Manager</h1>
        <p class="subtitle">管理后台登录</p>
      </div>

      <div class="fields">
        <div class="field">
          <label for="username">用户名</label>
          <input id="username" v-model="username" placeholder="输入管理员账号" :disabled="loading" @keydown.enter="handleLogin" />
        </div>
        <div class="field">
          <label for="password">密码</label>
          <input id="password" v-model="password" type="password" placeholder="输入密码" :disabled="loading" @keydown.enter="handleLogin" />
        </div>
      </div>

      <button class="login-btn" @click="handleLogin" :disabled="loading">
        <span v-if="loading" class="spinner"></span>
        <span>{{ loading ? "登录中..." : "登录" }}</span>
      </button>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-primary);
}

.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xl);
  width: 380px;
  padding: var(--space-2xl);
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
}

.login-logo {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.2em;
  margin-bottom: var(--space-sm);
}

.login-header h1 {
  margin: 0;
  font-size: 1.3em;
  font-weight: 700;
  color: var(--text-primary);
}

.subtitle {
  margin: 0;
  font-size: 0.85em;
  color: var(--text-muted);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.field label {
  font-size: 0.8em;
  font-weight: 500;
  color: var(--text-secondary);
}

input {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  font-size: 0.9em;
}

input:focus {
  border-color: var(--accent);
}

input::placeholder {
  color: var(--text-muted);
}

.login-btn {
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent);
  color: white;
  font-weight: 600;
  font-size: 0.95em;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

.login-btn:hover {
  background: var(--accent-hover);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error {
  color: var(--error);
  font-size: 0.8em;
  margin: 0;
}
</style>
