# ── EnvoyManager Dockerfile ──
# 构建命令（在项目根目录执行）:
#   docker build -f manager/Dockerfile -t envoy-manager .
#
# 运行:
#   docker run -d -p 443:443 -p 8080:8080 -p 3001-3020:3001-3020 -v envoy-data:/root/.envoy envoy-manager

# ---- Stage 1: 构建 Web 前端 ----
FROM node:22-bookworm-slim AS web-builder

WORKDIR /build
COPY manager/web/package.json ./
RUN npm install
COPY manager/web/ .
RUN npm run build

# ---- Stage 2: 安装 Server 依赖（含 native addons） ----
FROM node:22-bookworm-slim AS server-deps

WORKDIR /build
COPY manager/server/package.json ./
RUN npm install

# ---- Stage 3: 运行时镜像 ----
FROM node:22-bookworm-slim

# openssl 用于生成自签 HTTPS 证书
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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

# envoy 的 transport.ts import 'ws'，需要在 /app/node_modules 安装 ws
RUN mkdir -p /app/node_modules \
    && npm install --prefix /app ws

# 数据持久化目录
VOLUME /root/.envoy

# HTTPS + HTTP + Team WebSocket 端口
EXPOSE 443
EXPOSE 8080
EXPOSE 3001-3020

ENV MANAGER_PORT=8080
ENV ENVOY_TEAM_HOST=0.0.0.0
ENV NODE_ENV=production

# 入口脚本：自动生成自签证书 + 启动 server
COPY manager/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /app/manager/server
CMD ["/app/entrypoint.sh"]
