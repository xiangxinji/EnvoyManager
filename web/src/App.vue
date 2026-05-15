<script setup lang="ts">
import { useRouter } from "vue-router";
import { useTheme } from "./useTheme";

const router = useRouter();
const { theme, toggle } = useTheme();

const navItems = [
  { path: "/", label: "概览" },
  { path: "/teams", label: "团队" },
  { path: "/users", label: "用户" },
  { path: "/models", label: "模型" },
  { path: "/settings", label: "设置" },
];
</script>

<template>
  <div class="layout" v-if="$route.path !== '/login'">
    <nav class="sidebar">
      <div class="nav-header">
        <span class="logo">E</span>
        <span class="brand">Envoy Manager</span>
      </div>
      <ul class="nav-list">
        <li
          v-for="item in navItems"
          :key="item.path"
          :class="{ active: $route.path === item.path || (item.path !== '/' && $route.path.startsWith(item.path)) }"
          @click="router.push(item.path)"
        >
          {{ item.label }}
        </li>
      </ul>
      <div class="nav-footer">
        <button class="theme-btn" @click="toggle" :title="theme === 'dark' ? '浅色模式' : '深色模式'">
          <svg v-if="theme === 'dark'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
    </nav>
    <main class="main">
      <router-view />
    </main>
  </div>
  <router-view v-else />
</template>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.nav-header {
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border);
}

.logo {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.85em;
}

.brand {
  font-weight: 600;
  font-size: 0.9em;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  flex: 1;
}

.nav-list li {
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.88em;
  font-weight: 500;
  color: var(--text-secondary);
  transition: background 0.1s;
}

.nav-list li:hover {
  background: var(--sidebar-hover);
  color: var(--text-primary);
}

.nav-list li.active {
  background: var(--sidebar-active);
  color: var(--text-primary);
}

.nav-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.theme-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
}

.theme-btn:hover {
  color: var(--text-primary);
  background: var(--border);
}

.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}
</style>

<style>
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f7f8fa;
  --text-primary: #1a1a2e;
  --text-secondary: #555770;
  --text-muted: #8e8ea0;
  --border: #e8e8ef;
  --accent: #5b6abf;
  --accent-hover: #4a59ae;
  --accent-light: #eef0ff;
  --sidebar-hover: rgba(0, 0, 0, 0.04);
  --sidebar-active: rgba(91, 106, 191, 0.1);
  --card-bg: #ffffff;
  --card-border: #e8e8ef;
  --card-hover: #f7f8fa;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --status-running: #34c759;
  --status-reviewing: #5ac8fa;
  --status-pending: #ff9f0a;
  --status-completed: #30d158;
  --status-failed: #ff453a;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --error: #ff453a;
}

html.dark {
  --bg-primary: #0f0f1a;
  --bg-secondary: #161625;
  --text-primary: #e8e8f0;
  --text-secondary: #a0a0b8;
  --text-muted: #5a5a72;
  --border: #2a2a3e;
  --accent: #7b8aff;
  --accent-hover: #6a79ee;
  --accent-light: rgba(123, 138, 255, 0.12);
  --sidebar-hover: rgba(255, 255, 255, 0.04);
  --sidebar-active: rgba(123, 138, 255, 0.12);
  --card-bg: #1a1a2e;
  --card-border: #2a2a3e;
  --card-hover: #22223a;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --error: #ff6b6b;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
</style>
