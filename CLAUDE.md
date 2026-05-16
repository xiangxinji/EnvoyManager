# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

## 项目概述

EnvoyManager 是一个多 Agent 团队编排平台，后端使用 Hono（`server/`），前端使用 Vue 3（`web/`）。它管理由 AI 驱动的 Agent 团队（Envoy 客户端），每个团队运行独立的 WebSocket 服务器。系统通过 LLM 实现智能任务调度、对话、分析和审查。

UI 和 AI 提示词均使用中文。

## 开发命令

```bash
# 后端（端口 8080，自动重载）
cd server && npm run dev

# 前端（https://localhost:5180，/api 代理到后端）
cd web && npm run dev

# 构建前端
cd web && npm run build
```

项目未配置测试或 lint 命令，没有测试。

可通过 `MANAGER_PORT` 环境变量覆盖后端端口。首次启动默认管理员账号：`admin` / `admin123`。

## 架构

### 后端（`server/`）

**入口：** `index.ts` — 初始化加密模块、设置、恢复持久化的团队，然后在 8080 端口启动 Hono。

**外部依赖：** 服务端从 `../../envoy/packages/teams/team.js` 导入 `Team`，从 `../../envoy/packages/core/task.js` 导入 `Task`。这些来自同级 `envoy` monorepo，必须存在于对应相对路径。`Team` 类管理自己的 WebSocket 服务器（自动分配端口，从 3001 开始），内置心跳、任务生命周期和消息中继。

**共享类型：** `../../../shared/types/ai.js` 等导入路径引用 monorepo 根目录的 `shared/types/`（本仓库外部）。类型包括 `ModelPreset`、`SceneType`、`SceneConfig`、`AIConfig`、`ProviderType`、`ChatRequest`、`TaskGenerateRequest`、`TaskPlan`、`AnalyzeRequest`、`AnalysisResult`。

**路由分组**（每个注册为接收 Hono app 的函数）：
- `routes/admin.ts` — 管理员认证，会话令牌（24 小时有效期）
- `routes/users.ts` — 用户 CRUD、客户端认证。密码传输时 RSA 加密
- `routes/teams.ts` — 团队 CRUD、成员管理。接收 `teamInstances` Map 和 setup 回调
- `routes/messages.ts` — 聊天中继、任务提交、文件上传。接收 `teamInstances` Map
- `routes/dashboard.ts` — 聚合统计。接收 `teamInstances` Map
- `routes/ai.ts` — AI 配置/预设/场景 CRUD（仅管理员），AI 健康检查

**AI 服务**（`services/ai/`）：
- `provider.ts` — 将供应商名称 + 模型字符串解析为 Vercel AI SDK 的 `LanguageModelV1` 实例。支持 openai、anthropic、google、deepseek、openai-compatible
- `index.ts` — `createAIRoutes()` 工厂函数，将每个端点绑定到场景类型
- `chat.ts`、`task.ts`、`analyze.ts`、`agent.ts`、`dispatch.ts`、`review.ts` — 每个 AI 能力对应一个文件
- `prompts/` — 各场景的系统提示词，均为中文
- `constants.ts` — 支持的供应商列表和默认参数

**设置与持久化**（全部在 `~/.envoy/`）：
- `settings.ts` — 单例模块：管理员配置、AI 预设/场景 CRUD、`resolveForScene()` 运行时模型解析。包含从旧版单供应商格式到多预设格式的迁移逻辑
- `team-registry.ts` — 基于文件的团队元数据（`teams/{name}/meta.json`）、任务持久化、端口分配
- `user-registry.ts` — 用户注册表（`users.json`），bcrypt 密码哈希
- `crypto.ts` — RSA-2048 密钥对存储在 `~/.envoy/keys/`，用于密码加密

**认证流程：** 两套独立的认证系统 — 管理员认证（`Authorization` 头的 Bearer token）和客户端认证（`X-Envoy-Token` 头，携带团队上下文）。管理员令牌为 UUID，存储在内存中。

### 前端（`web/`）

**技术栈：** Vue 3 Composition API（`<script setup>`）、Vue Router、Vite + `@vitejs/plugin-basic-ssl`（Web Crypto API 要求 HTTPS）。

**Vite 代理：** 所有 `/api/*` 请求代理到 `http://localhost:8080`。

**关键文件：**
- `api.ts` — 完整的 API 客户端，使用 Web Crypto API 进行 RSA-OAEP 加密。所有密码字段在传输前客户端加密
- `router.ts` — 路由配置，带认证守卫（检查 `localStorage.getItem("admin_token")`）
- `useTheme.ts` — 深色/浅色主题切换 composable

**无状态管理库** — 视图直接通过 `api.ts` 获取数据，多个视图使用 `setInterval` 每 5 秒自动刷新。

## 关键模式

- **场景化 AI 路由：** 六个 AI 场景（chat、task、analyze、agent、dispatch、review），每个可配置不同的模型预设，支持按场景覆盖 temperature/maxTokens。`resolveForScene()` 在场景无显式绑定时回退到默认预设。
- **团队生命周期：** 创建团队时自动分配端口并启动 WebSocket 服务器。`teamInstances` Map（内存中，启动时从持久化数据填充）传递给需要直接访问 Team 实例的路由组。
- **任务持久化：** 任务状态在每个生命周期事件（`task:created`、`task:updated`、`task:completed`、`task:failed`）时通过团队内部服务器的事件监听器持久化为 JSON 文件。
- **基于文件的存储：** 所有状态以 JSON 文件存储在 `~/.envoy/`。无数据库。除 `settings.ts` 中的旧版 AI 配置迁移外，无其他迁移逻辑。
