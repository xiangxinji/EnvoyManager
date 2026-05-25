<script setup lang="ts">
import { ref, watch } from "vue";
import TeamOverview from "../components/TeamOverview.vue";
import TeamMembers from "../components/TeamMembers.vue";
import TeamTasks from "../components/TeamTasks.vue";
import CloudBrowser from "../components/CloudBrowser.vue";
import BrainsBrowser from "../components/BrainsBrowser.vue";

const props = defineProps<{ name: string }>();

const activeTab = ref("overview");

const tabs = [
  { key: "overview", label: "概览" },
  { key: "members", label: "成员" },
  { key: "tasks", label: "任务" },
  { key: "cloud", label: "云资源" },
  { key: "brains", label: "知识库" },
];

watch(() => props.name, () => {
  activeTab.value = "overview";
});
</script>

<template>
  <div class="detail">
    <div class="detail-header">
      <h1 class="page-title">{{ name }}</h1>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>

    <div class="tab-content">
      <TeamOverview v-if="activeTab === 'overview'" :team="name" />
      <TeamMembers v-else-if="activeTab === 'members'" :team="name" />
      <TeamTasks v-else-if="activeTab === 'tasks'" :team="name" />
      <CloudBrowser v-else-if="activeTab === 'cloud'" :team="name" />
      <BrainsBrowser v-else-if="activeTab === 'brains'" :team="name" />
    </div>
  </div>
</template>

<style scoped>
.detail {
  width: 100%;
}

.detail-header {
  margin-bottom: var(--space-lg);
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

.tab-bar {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-xl);
}

.tab-btn {
  background: none;
  border: none;
  padding: var(--space-sm) var(--space-lg);
  font-size: 0.88em;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.tab-content {
  min-height: 400px;
}
</style>
