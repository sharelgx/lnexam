#!/bin/bash
# 在 154 服务器上执行：找到约 20GB 挂载盘，在盘上创建 lnexam 目录并容器化部署
# 使用方式：上传到 154 后 chmod +x deploy-to-154.sh && ./deploy-to-154.sh
# 要求：154 上已安装 Docker、Docker Compose、Git；不影响现有 Metaseek 项目

set -e

echo "========== 1. 查找约 20GB 挂载盘 =========="
df -h
echo "---"
# 找出非根、非系统且容量约 20G 的挂载点（按实际调整）
MOUNT=$(df -h | awk '$2 ~ /G$/ { gsub(/G/,"",$2); if ($2+0 >= 15 && $2+0 <= 25 && $6 !~ /^\/(boot|etc|usr|var)$/) print $6 }' | head -1)
if [ -z "$MOUNT" ]; then
  # 若上面没匹配到，列出所有挂载供手动选择
  echo "未自动检测到约 20G 盘，请从上面 df -h 输出中选一个挂载点，并执行："
  echo "  export LNEXAM_ROOT=/你的挂载点/lnexam"
  echo "  sudo mkdir -p \$LNEXAM_ROOT && cd \$LNEXAM_ROOT"
  echo "  sudo git clone https://github.com/sharelgx/lnexam.git ."
  echo "  echo 'PORT=3001' | sudo tee .env"
  echo "  sudo docker compose up -d --build"
  exit 1
fi
LNEXAM_ROOT="$MOUNT/lnexam"
echo "使用挂载点: $MOUNT，项目目录: $LNEXAM_ROOT"

echo "========== 2. 创建目录 =========="
sudo mkdir -p "$LNEXAM_ROOT"
cd "$LNEXAM_ROOT"

echo "========== 3. 克隆或更新代码 =========="
if [ -f "docker-compose.yml" ]; then
  sudo git pull || true
else
  sudo git clone https://github.com/sharelgx/lnexam.git .
fi

echo "========== 4. 使用独立端口 3001（避免与 Metaseek 冲突）=========="
sudo tee docker-compose.override.yml << 'YAML'
services:
  lnexam:
    ports:
      - "3001:3000"
YAML

echo "========== 5. 构建并启动容器 =========="
sudo docker compose up -d --build

echo "========== 6. 检查容器 =========="
sudo docker compose ps

echo ""
echo "========== 部署完成 =========="
echo "Lnexam 运行在端口 3001，数据目录: $LNEXAM_ROOT"
echo ""
echo "请在同一台 154 上为 lnexam.metaseek.cc 配置 Nginx 反向代理（与 Metaseek 并存）："
echo "  sudo tee /etc/nginx/conf.d/lnexam.conf << 'NGINX'
server {
    listen 80;
    server_name lnexam.metaseek.cc;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "  # 若需 HTTPS: sudo certbot --nginx -d lnexam.metaseek.cc"
echo ""
