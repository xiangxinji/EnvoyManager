# EnvoyManager

多 Agent 团队编排管理平台，提供 Web 界面创建和管理由 AI 驱动的 Agent 团队（Envoy 客户端）。每个团队包含一名 Leader 和若干 Member，系统通过 LLM 智能调度任务、收集执行结果并支持实时聊天。

## 技术栈

**服务端：** Hono + Vercel AI SDK + TypeScript
**前端：** Vue 3 + Vue Router + Vite
**数据存储：** 文件系统（`~/.envoy/`）

## 项目结构

```
EnvoyManager/
├── server/                  # 后端服务
│   ├── index.ts             # 入口
│   ├── crypto.ts            # RSA 密钥对生成与加解密
│   ├── settings.ts          # 管理员配置、AI 预设、场景配置
│   ├── team-registry.ts     # 团队元数据持久化
│   ├── user-registry.ts     # 用户注册表
│   ├── routes/              # API 路由
│   │   ├── admin.ts         # 管理员认证
│   │   ├── ai.ts            # AI 配置管理
│   │   ├── dashboard.ts     # 仪表盘统计
│   │   ├── messages.ts      # 消息中继、任务提交、附件上传
│   │   ├── teams.ts         # 团队 CRUD、成员管理
│   │   └── users.ts         # 用户 CRUD、客户端认证
│   └── services/ai/         # AI 服务
│       ├── chat.ts          # 对话（流式/非流式）
│       ├── dispatch.ts      # 智能任务调度
│       ├── review.ts        # 任务结果审查
│       ├── analyze.ts       # 执行结果分析
│       ├── task.ts          # 任务计划生成
│       ├── agent.ts         # Agent 推理（工具调用）
│       └── prompts/         # 各场景系统提示词
└── web/                     # 前端界面
    └── src/
        ├── views/           # 页面
        │   ├── Dashboard.vue    # 概览（统计 + 近期任务）
        │   ├── Login.vue        # 管理员登录
        │   ├── Teams.vue        # 团队列表
        │   ├── TeamDetail.vue   # 团队详情（成员、连接、任务）
        │   ├── TaskDetail.vue   # 任务详情（结果、资源）
        │   ├── Users.vue        # 用户管理
        │   ├── Models.vue       # AI 模型预设管理
        │   └── Settings.vue     # 管理员设置 + 场景配置
        ├── components/      # 可复用组件
        └── api.ts           # API 客户端（含 RSA 加密）
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装依赖

```bash
cd server && npm install
cd ../web && npm install
```

### 启动开发服务器

```bash
# 终端 1 — 后端（默认端口 8080）
cd server && npm run dev

# 终端 2 — 前端（https://localhost:5180）
cd web && npm run dev
```

首次启动时会自动创建默认管理员账号（`admin` / `admin123`）和 RSA 密钥对，存储在 `~/.envoy/` 目录下。

### 构建生产版本

```bash
cd web && npm run build
```

输出到 `web/dist/`。

## 核心功能

- **团队管理** — 创建/删除团队，每个团队自动启动 WebSocket 服务器
- **成员管理** — 添加 Leader 和 Member，查看在线连接状态
- **任务系统** — 提交任务（串行/并行模式），跟踪状态流转（pending → running → reviewing → completed/failed）
- **AI 调度** — 根据成员职责和能力智能匹配任务，生成执行计划
- **AI 对话** — 支持流式聊天，Agent 推理（工具调用），任务分析与结果审查
- **多模型支持** — OpenAI、Anthropic、Google、DeepSeek 及 OpenAI 兼容接口，可配置多个预设和场景参数
- **安全传输** — 密码通过 RSA-OAEP 加密传输，服务端 bcrypt 哈希存储

## Docker 部署

### 前置条件

- Docker 已安装
- `envoy/` 子模块已检出（在项目根目录执行）：

```bash
git submodule update --init
```

### 构建镜像

在项目根目录执行：

```bash
docker build -f manager/Dockerfile -t envoy-manager .
```

### 运行容器

#### 基础启动

```bash
docker run -d \
  --name envoy-manager \
  -p 8080:8080 \
  -p 3001-3020:3001-3020 \
  -v envoy-data:/root/.envoy \
  envoy-manager
```

#### 自定义配置

```bash
docker run -d \
  --name envoy-manager \
  -p 8080:8080 \
  -p 3001-3020:3001-3020 \
  -v envoy-data:/root/.envoy \
  -e MANAGER_CORS_ORIGINS=http://localhost:8080,tauri://localhost \
  envoy-manager
```

#### 使用 Docker Compose

```bash
cd manager
docker compose up -d
```

### 端口说明

| 端口 | 用途 | 可配置 |
|------|------|--------|
| 8080 | Manager API 服务 | `MANAGER_PORT` |
| 3001-3020 | Team WebSocket（每个团队分配一个，自动递增） | 自动从 3001 起 |

### Docker 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MANAGER_PORT` | `8080` | API 服务端口 |
| `ENVOY_TEAM_HOST` | `0.0.0.0` | Team WebSocket 绑定地址 |
| `MANAGER_CORS_ORIGINS` | Tauri 来源 | CORS 允许的来源，多个用逗号分隔 |
| `NODE_ENV` | `production` | 运行环境 |
| `ENVOY_DEFAULT_ADMIN_USERNAME` | `admin` | 首次启动默认管理员用户名 |
| `ENVOY_DEFAULT_ADMIN_PASSWORD` | `admin123` | 首次启动默认管理员密码 |

### 数据持久化

容器内数据存储在 `/root/.envoy/`，建议挂载 Docker Volume 或宿主机目录：

```bash
# 使用 Docker Volume
-v envoy-data:/root/.envoy

# 或挂载宿主机目录
-v /path/to/envoy-data:/root/.envoy
```

### 常用操作

```bash
# 查看日志
docker logs -f envoy-manager

# 停止
docker stop envoy-manager

# 重启
docker restart envoy-manager

# 删除容器（数据保留在 volume 中）
docker rm envoy-manager

# 删除数据卷（谨慎，不可恢复）
docker volume rm envoy-data
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MANAGER_PORT` | `8080` | 后端服务端口 |

## 数据存储

所有数据保存在 `~/.envoy/` 目录：

```
~/.envoy/
├── keys/                    # RSA 密钥对
├── manager.json             # 管理员凭证、AI 预设、场景配置
├── users.json               # 用户注册表
├── teams/{name}/            # 团队数据
│   ├── meta.json            # 团队元数据
│   └── tasks/{id}/          # 任务数据
│       ├── task.json        # 任务状态
│       └── resources/       # 任务资源文件
└── attachments/             # 聊天附件
```
