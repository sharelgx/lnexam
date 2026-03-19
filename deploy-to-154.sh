#!/bin/bash
# 在本地构建 amd64 镜像并部署到 154（需先启动 Docker Desktop）
# 使用 docker run 重启，避免服务器上 docker-compose 1.29 与新版 Docker 的 ContainerConfig 兼容问题
# 端口须与 nginx 反代一致：宿主机 3001 -> 容器内 PORT=3030
set -e
cd "$(dirname "$0")"
KEY="${HOME}/Downloads/mac.pem"
REMOTE="ubuntu@154.8.233.137"

echo "==> 构建 linux/amd64 镜像..."
docker buildx build --platform linux/amd64 -t lnexam:amd64 --load .

echo "==> 导出并上传到 154..."
docker save lnexam:amd64 | gzip -c > /tmp/lnexam-amd64.tar.gz
scp -o StrictHostKeyChecking=no -i "$KEY" /tmp/lnexam-amd64.tar.gz "$REMOTE:/tmp/"

echo "==> 154 上加载镜像并重启容器..."
ssh -o StrictHostKeyChecking=no -i "$KEY" "$REMOTE" "
  set -e
  gunzip -c /tmp/lnexam-amd64.tar.gz | docker load
  docker tag lnexam:amd64 lnexam:latest
  docker stop lnexam 2>/dev/null || true
  docker rm lnexam 2>/dev/null || true
  docker run -d --name lnexam --restart unless-stopped \
    -p 3001:3030 \
    -e NODE_ENV=production \
    -e PORT=3030 \
    -v lnexam-data:/app/server/data \
    lnexam:latest
  rm -f /tmp/lnexam-amd64.tar.gz
  echo '==> 健康检查:'
  sleep 2
  curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3001/ || true
"

echo "==> 完成。访问 https://lnexam.metaseek.cc/ 查看。"
