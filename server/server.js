const path = require('path');
// 本地配置阶跃星辰等密钥：在 server/.env 中设置 STEPFUN_API_KEY（该文件已在 .gitignore，勿提交）
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { getDb, initSchema } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// API 优先（避免被静态或后续路由抢占）
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/exam-configs', require('./routes/exam-configs'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/categories', require('./routes/admin-categories'));

// 静态文件（前端）
app.use(express.static(path.join(__dirname, '..')));

// 按访问路径分页：以下路径均返回 index.html，由前端根据 pathname 展示对应页面
const appPaths = ['/dashboard', '/subjects', '/exams', '/practice', '/mistakes', '/stats', '/membership', '/admin', '/exam', '/result'];
appPaths.forEach(p => {
  app.get(p, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 初始化数据库
initSchema(getDb());

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
  console.log('辽宁金融单招 · 在线备考平台 后端已启动: http://localhost:' + PORT);
});
