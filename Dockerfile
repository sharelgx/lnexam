# 辽宁金融单招在线备考平台 - 生产镜像（使用国内镜像源，避免 Docker Hub 超时）
FROM docker.m.daocloud.io/library/node:20-alpine

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制项目代码（.dockerignore 已排除 node_modules、.git、server/data 等）
COPY . .

# 安装后端依赖（仅生产）
RUN cd server && npm ci --omit=dev

# 确保数据目录存在（运行时由 volume 挂载）
RUN mkdir -p /app/server/data

EXPOSE 3030

ENV NODE_ENV=production
ENV PORT=3030

CMD ["node", "server/server.js"]
