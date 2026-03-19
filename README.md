# 辽宁金融职业学院 · 单招在线备考平台

在线做题网站，支持后台管理、会员系统（免费 / VIP）。

## 功能概览

- **用户系统**：注册、登录（JWT）
- **会员系统**：免费用户 / VIP 会员（到期时间可配置）
- **做题与统计**：知识点复习、专项练习、模拟考试、错题本、学习报告
- **后台管理**（管理员）：用户列表、设置 VIP、**分类管理**（一级=科目，二/三级=知识点）、数据概览
- **按路径分页**：`/` 登录，`/dashboard` 学习中心，`/subjects` 知识点复习，`/exams` 模拟考试，`/practice` 专项练习，`/mistakes` 错题本，`/stats` 学习报告，`/membership` 会员中心，`/admin` 后台管理

## 快速启动

### 1. 安装后端依赖并初始化数据库

```bash
cd server
npm install
node scripts/init-db.js
```

### 2. 启动服务

```bash
cd server
npm start
```

浏览器访问：**http://localhost:3030**

### 默认账号

| 角色   | 账号        | 密码      |
|--------|-------------|-----------|
| 管理员 | `admin`      | `admin123` |
| 学生   | `student001`| `123456`   |

管理员登录后可在侧栏进入「后台管理」，为用户设置 VIP 及到期时间。

## 项目结构

```
lnexam/
├── index.html          # 前端单页（含题目与样式）
├── server/
│   ├── server.js       # Express 入口
│   ├── db.js           # SQLite 数据库
│   ├── middleware/     # 认证中间件
│   ├── routes/         # auth、users、admin 等接口
│   ├── scripts/
│   │   └── init-db.js  # 初始化库表与默认账号
│   └── data/           # SQLite 数据文件（自动创建）
└── README.md
```

## API 说明

- `POST /api/auth/login` — 登录
- `POST /api/auth/register` — 注册
- `GET /api/users/me` — 当前用户信息与统计（需登录）
- `PUT /api/users/me/stats` — 同步学习统计
- `PUT /api/users/me/mistakes` — 同步错题
- `GET /api/users/me/exam-history` — 考试记录
- `POST /api/users/me/exam-record` — 提交考试记录
- `GET /api/categories` — 分类树（一级科目、二三级知识点）
- `GET /api/admin/users` — 用户列表（管理员）
- `PUT /api/admin/users/:id/membership` — 设置会员（管理员）
- `GET /api/admin/stats` — 后台概览（管理员）
- `GET/POST/PUT/DELETE /api/admin/categories` — 分类管理（管理员）

生产环境部署时请设置环境变量 `JWT_SECRET` 和 `PORT`。

## Docker 部署（推荐：与宿主机其他项目隔离）

在服务器上可完全用容器独立运行，不污染本机 Node 环境、不占用除指定端口和卷以外的资源。

### 一键启动

```bash
# 构建并后台运行
docker compose up -d --build

# 查看日志
docker compose logs -f
```

访问：**http://服务器IP:3030**

### 常用命令

```bash
# 停止
docker compose down

# 停止并删除数据卷（慎用，会清空数据库）
docker compose down -v

# 仅重新构建镜像
docker compose build --no-cache
```

### 数据持久化

数据库文件通过 Docker 卷 `lnexam-data` 持久化，容器删除或重建后数据仍保留。卷位置可由 Docker 管理，如需备份可执行：

```bash
docker compose exec lnexam cat /app/server/data/lnexam.db > backup.db
```

### 自定义端口

在 `docker-compose.yml` 中修改 `ports`，例如改为 `"8080:3030"` 即对外使用 8080 端口。
