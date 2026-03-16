const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.use(adminOnly);

const roleLabel = { common: '普通类考生', math: '数学单科', chinese: '语文单科', admin: '管理员' };

// 用户列表
router.get('/users', (req, res) => {
  const db = getDb();
  const list = db.prepare(
    'SELECT id, username, name, phone, role, membership, membership_expires_at, created_at FROM users ORDER BY id DESC'
  ).all();
  res.json({
    ok: true,
    list: list.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      phone: u.phone,
      role: u.role,
      roleLabel: roleLabel[u.role] || u.role,
      membership: u.membership,
      membershipExpiresAt: u.membership_expires_at,
      createdAt: u.created_at
    }))
  });
});

// 设置会员（免费/VIP 及过期时间）
router.put('/users/:id/membership', (req, res) => {
  const { membership, membershipExpiresAt } = req.body || {};
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, message: '无效用户' });
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ ok: false, message: '用户不存在' });
  const m = membership === 'vip' ? 'vip' : 'free';
  const expires = membershipExpiresAt || null;
  db.prepare('UPDATE users SET membership = ?, membership_expires_at = ? WHERE id = ?').run(m, expires, id);
  res.json({ ok: true });
});

// 后台统计概览
router.get('/stats', (req, res) => {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const examCount = db.prepare('SELECT COUNT(*) as c FROM exam_records').get().c;
  const vipCount = db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE membership = 'vip' AND (membership_expires_at IS NULL OR membership_expires_at > datetime('now'))"
  ).get().c;
  res.json({
    ok: true,
    stats: { userCount, examCount, vipCount }
  });
});

module.exports = router;
