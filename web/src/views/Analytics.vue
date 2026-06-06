<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { api, type AIUsageResult } from "../api";

type TimeRange = "today" | "7d" | "30d";

const usage = ref<AIUsageResult | null>(null);
const teams = ref<string[]>([]);
const loading = ref(true);
const error = ref("");

const timeRange = ref<TimeRange>("7d");
const filterTeam = ref("");
const filterScene = ref("");

const SCENES = ["agent", "chat", "auto-reply", "task", "dispatch", "review", "analyze", "cloud_organize"];

const timeRangeLabel = computed(() => {
  const labels: Record<TimeRange, string> = { today: "今日", "7d": "近 7 天", "30d": "近 30 天" };
  return labels[timeRange.value];
});

function getFromTs(): number {
  const now = new Date();
  switch (timeRange.value) {
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case "7d": return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    case "30d": return now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }
}

async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    const [usageData, teamsData] = await Promise.all([
      api.getAIUsage({
        from: getFromTs(),
        team: filterTeam.value || undefined,
        scene: filterScene.value || undefined,
        group: filterTeam.value ? "scene" : "team",
      }),
      api.getTeams().catch(() => [] as Array<{ name: string }>) as Promise<Array<{ name: string }>>,
    ]);
    usage.value = usageData;
    teams.value = teamsData.map((t: { name: string }) => t.name);
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const teamRanking = computed(() => {
  if (!usage.value) return [];
  return [...usage.value.breakdown].sort((a, b) => (b.promptTokens + b.completionTokens) - (a.promptTokens + a.completionTokens));
});

let timer: ReturnType<typeof setInterval>;

onMounted(() => {
  refresh();
  timer = setInterval(refresh, 30000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="analytics">
    <h1 class="page-title">AI 用量</h1>

    <div v-if="loading && !usage" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else>
      <!-- Filters -->
      <div class="filters">
        <div class="filter-group">
          <label>时间范围</label>
          <select v-model="timeRange" @change="refresh()">
            <option value="today">今日</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
        </div>
        <div class="filter-group">
          <label>团队</label>
          <select v-model="filterTeam" @change="refresh()">
            <option value="">全部</option>
            <option v-for="t in teams" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label>场景</label>
          <select v-model="filterScene" @change="refresh()">
            <option value="">全部</option>
            <option v-for="s in SCENES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>

      <!-- Stats cards -->
      <div class="overview-cards" v-if="usage">
        <div class="overview-card">
          <div class="overview-value">{{ formatTokens(usage.total.promptTokens) }}</div>
          <div class="overview-label">Prompt Tokens</div>
        </div>
        <div class="overview-card">
          <div class="overview-value">{{ formatTokens(usage.total.completionTokens) }}</div>
          <div class="overview-label">Completion Tokens</div>
        </div>
        <div class="overview-card">
          <div class="overview-value">{{ usage.total.calls }}</div>
          <div class="overview-label">调用次数</div>
        </div>
      </div>

      <!-- Rankings -->
      <div class="ranking-section" v-if="usage && usage.breakdown.length > 0">
        <div class="ranking-panel">
          <h3 class="ranking-title">{{ filterScene ? '场景排行' : '排行' }}</h3>
          <div class="ranking-list">
            <div v-for="item in teamRanking" :key="item.key" class="ranking-item">
              <span class="ranking-key">{{ item.key }}</span>
              <div class="ranking-bar-wrapper">
                <div class="ranking-bar" :style="{ width: Math.max(5, ((item.promptTokens + item.completionTokens) / (usage?.total.promptTokens + usage?.total.completionTokens || 1)) * 100) + '%' }"></div>
              </div>
              <span class="ranking-value">{{ formatTokens(item.promptTokens + item.completionTokens) }}</span>
              <span class="ranking-calls">{{ item.calls }}次</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="usage" class="empty">暂无用量数据</div>
    </template>
  </div>
</template>

<style scoped>
.analytics {
  max-width: 900px;
}

.page-title {
  font-size: 1.4em;
  font-weight: 700;
  margin-bottom: var(--space-xl);
}

.loading, .error {
  color: var(--text-muted);
  padding: var(--space-xl);
}

.error { color: var(--error); }

.filters {
  display: flex;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-group label {
  font-size: 0.78em;
  font-weight: 500;
  color: var(--text-muted);
}

.filter-group select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: 0.85em;
  outline: none;
  transition: border-color 0.15s;
}

.filter-group select:focus { border-color: var(--accent); }

.overview-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}

.overview-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  box-shadow: var(--shadow-sm);
}

.overview-value {
  font-size: 1.8em;
  font-weight: 700;
  color: var(--accent);
}

.overview-label {
  font-size: 0.82em;
  color: var(--text-muted);
  margin-top: var(--space-xs);
}

.ranking-section {
  margin-top: var(--space-xl);
}

.ranking-panel {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  box-shadow: var(--shadow-sm);
}

.ranking-title {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-lg);
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.ranking-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 6px 0;
}

.ranking-key {
  width: 120px;
  font-size: 0.85em;
  font-weight: 500;
  color: var(--text-primary);
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-bar-wrapper {
  flex: 1;
  height: 8px;
  background: var(--glass-bg-light);
  border-radius: 4px;
  overflow: hidden;
}

.ranking-bar {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
  transition: width 0.3s;
  min-width: 4px;
}

.ranking-value {
  font-size: 0.82em;
  font-weight: 600;
  color: var(--text-secondary);
  width: 60px;
  text-align: right;
}

.ranking-calls {
  font-size: 0.75em;
  color: var(--text-muted);
  width: 50px;
  text-align: right;
}

.empty {
  padding: var(--space-2xl);
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9em;
}
</style>
