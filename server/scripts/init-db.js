const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, initSchema } = require('../db');

initSchema(getDb());
const db = getDb();

// 创建默认管理员（若不存在）
const adminUsername = 'admin';
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
if (!existing) {
  const password_hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, name, phone, role, membership) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(adminUsername, password_hash, '管理员', '', 'admin', 'vip');
  console.log('已创建默认管理员: 账号 admin 密码 admin123');
}

// 可选：创建演示学生账号
const demoUser = 'student001';
const demoExists = db.prepare('SELECT id FROM users WHERE username = ?').get(demoUser);
if (!demoExists) {
  const password_hash = bcrypt.hashSync('123456', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, name, phone, role, membership) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(demoUser, password_hash, '张同学', demoUser, 'common', 'free');
  console.log('已创建演示学生: 账号 student001 密码 123456');
}

console.log('数据库初始化完成。');
