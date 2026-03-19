#!/bin/bash
# 在本地构建 amd64 镜像并部署到 154（需先启动 Docker Desktop）
set -e
cd "$(dirname "$0")"
KEY="${HOME}/Downloads/mac.pem"
REMOTE="ubuntu@154.8.233.137"
REMOTE_DIR="/data/disk/lnexam"

echo "==> 构建 linux/amd64 镜像..."
docker buildx build --platform linux/amd64 -t lnexam:amd64 --load .

echo "==> 导出并上传到 154..."
docker save lnexam:amd64 | gzip -c > /tmp/lnexam-amd64.tar.gz
scp -o StrictHostKeyChecking=no -i "$KEY" /tmp/lnexam-amd64.tar.gz "$REMOTE:/tmp/"

echo "==> 154 上加载镜像并重启容器..."
ssh -o StrictHostKeyChecking=no -i "$KEY" "$REMOTE" "
  gunzip -c /tmp/lnexam-amd64.tar.gz | docker load
  docker tag lnexam:amd64 lnexam:latest
  cd $REMOTE_DIR
  printf 'services:\n  lnexam:\n    ports:\n      - \"3001:3030\"\n' > docker-compose.override.yml
  docker stop lnexam 2>/dev/null || true
  docker rm lnexam 2>/dev/null || true
  docker-compose up -d
  rm -f /tmp/lnexam-amd64.tar.gz
"

echo "==> 完成。访问 https://lnexam.metaseek.cc/dashboard 查看新功能。"
