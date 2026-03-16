const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const roleLabel = { common: '普通类考生', math: '数学单科', chinese: '语文单科', admin: '管理员' };

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: '请填写账号和密码' });
  }
  const db = getDb();
  const user = db.prepare(
    'SELECT id, username, password_hash, name, phone, role, membership, membership_expires_at FROM users WHERE username = ?'
  ).get(String(username).trim());
  if (!user) {
    return res.status(401).json({ ok: false, message: '账号或密码错误' });
  }
  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ ok: false, message: '账号或密码错误' });
  }
  const isVip = user.membership === 'vip' && user.membership_expires_at && new Date(user.membership_expires_at) > new Date();
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  delete user.password_hash;
  res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      phone: user.phone,
      role: user.role,
      roleLabel: roleLabel[user.role] || user.role,
      membership: user.membership,
      membershipExpiresAt: user.membership_expires_at,
      isVip
    }
  });
});

router.post('/register', (req, res) => {
  const { name, phone, subject, password } = req.body || {};
  if (!name || !phone || !subject || !password) {
    return res.status(400).json({ ok: false, message: '请填写完整信息' });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, message: '密码至少6位' });
  }
  const username = String(phone).trim();
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(400).json({ ok: false, message: '该手机号已注册' });
  }
  const role = subject === 'common' ? 'common' : subject === 'math' ? 'math' : 'chinese';
  const password_hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(
    'INSERT INTO users (username, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(username, password_hash, String(name).trim(), username, role);
  const newUser = db.prepare(
    'SELECT id, username, name, phone, role, membership, membership_expires_at FROM users WHERE id = ?'
  ).get(db.prepare('SELECT last_insert_rowid()').get()['last_insert_rowid()']);
  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    ok: true,
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      phone: newUser.phone,
      role: newUser.role,
      roleLabel: roleLabel[newUser.role] || newUser.role,
      membership: newUser.membership,
      membershipExpiresAt: newUser.membership_expires_at,
      isVip: false
    }
  });
});

module.exports = router;
