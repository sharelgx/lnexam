const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, initSchema } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// 静态文件（前端）
app.use(express.static(path.join(__dirname, '..')));

// API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));

// 默认首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 初始化数据库
initSchema(getDb());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('辽宁金融单招 · 在线备考平台 后端已启动: http://localhost:' + PORT);
});
