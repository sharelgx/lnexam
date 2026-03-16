# 辽宁金融单招在线备考平台 - 生产镜像
FROM node:20-alpine

# 安装 better-sqlite3 编译依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制项目代码（.dockerignore 已排除 node_modules、.git、server/data 等）
COPY . .

# 安装后端依赖（仅生产）
RUN cd server && npm ci --omit=dev

# 确保数据目录存在（运行时由 volume 挂载）
RUN mkdir -p /app/server/data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server/server.js"]
