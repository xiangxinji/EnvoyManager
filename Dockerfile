# ── EnvoyManager Dockerfile ──
# 构建命令（在项目根目录执行）:
#   docker build -f manager/Dockerfile -t envoy-manager .
#
# 运行:
#   docker run -d -p 8080:8080 -p 3001-3020:3001-3020 -v envoy-data:/root/.envoy envoy-manager

# ---- Stage 1: 构建 Web 前端 ----
FROM node:22-bookworm-slim AS web-builder

WORKDIR /build
COPY manager/web/package.json manager/web/package-lock.json ./
RUN npm ci
COPY manager/web/ .
RUN npm run build

# ---- Stage 2: 安装 Server 依赖（含 native addons） ----
FROM node:22-bookworm-slim AS server-deps

WORKDIR /build
COPY manager/server/package.json manager/server/package-lock.json ./
RUN npm ci

# ---- Stage 3: 运行时镜像 ----
FROM node:22-bookworm-slim

WORKDIR /app

# 拷贝 server 依赖
COPY --from=server-deps /build/node_modules ./manager/server/node_modules

# 拷贝 server 源码
COPY manager/server/ ./manager/server/

# 拷贝 envoy 运行时包（Team/Server/WebSocket 依赖）
COPY envoy/packages/ ./envoy/packages/

# 拷贝共享类型定义（tsx 运行时 type-only import 需要）
COPY shared/ ./shared/

# 拷贝构建好的 Web 前端
COPY --from=web-builder /build/dist ./manager/web/dist/

# envoy 的 transport.ts import 'ws'，需要从 /app/node_modules 可解析
# 将 manager/server/node_modules/ws 符号链接到 /app/node_modules
RUN mkdir -p /app/node_modules \
    && ln -s /app/manager/server/node_modules/ws /app/node_modules/ws

# 数据持久化目录
VOLUME /root/.envoy

# API 端口 + Team WebSocket 端口范围
EXPOSE 8080
EXPOSE 3001-3020

ENV MANAGER_PORT=8080
ENV ENVOY_TEAM_HOST=0.0.0.0
ENV NODE_ENV=production

WORKDIR /app/manager/server
CMD ["npx", "tsx", "index.ts"]
