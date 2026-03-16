const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const roleLabel = { common: '普通类考生', math: '数学单科', chinese: '语文单科', admin: '管理员' };

// 当前用户信息（含会员与统计）
router.get('/me', (req, res) => {
  const db = getDb();
  const u = db.prepare(
    'SELECT id, username, name, phone, role, membership, membership_expires_at FROM users WHERE id = ?'
  ).get(req.userId);
  if (!u) return res.status(404).json({ ok: false, message: '用户不存在' });
  const isVip = u.membership === 'vip' && u.membership_expires_at && new Date(u.membership_expires_at) > new Date();
  const stats = db.prepare('SELECT total_answered, total_correct, exam_count, topic_stats FROM user_stats WHERE user_id = ?').get(req.userId);
  res.json({
    ok: true,
    user: {
      id: u.id,
      username: u.username,
      name: u.name,
      phone: u.phone,
      role: u.role,
      roleLabel: roleLabel[u.role] || u.role,
      membership: u.membership,
      membershipExpiresAt: u.membership_expires_at,
      isVip: !!isVip
    },
    stats: stats ? {
      totalAnswered: stats.total_answered,
      totalCorrect: stats.total_correct,
      examCount: stats.exam_count,
      topicStats: stats.topic_stats ? JSON.parse(stats.topic_stats) : {}
    } : { totalAnswered: 0, totalCorrect: 0, examCount: 0, topicStats: {} }
  });
});

// 同步学习统计（累计答题、正确数、考试次数、知识点统计）
router.put('/me/stats', (req, res) => {
  const { totalAnswered, totalCorrect, examCount, topicStats } = req.body || {};
  const db = getDb();
  const existing = db.prepare('SELECT user_id FROM user_stats WHERE user_id = ?').get(req.userId);
  const topicStr = topicStats != null ? JSON.stringify(topicStats) : null;
  if (existing) {
    db.prepare(
      'UPDATE user_stats SET total_answered = COALESCE(?, total_answered), total_correct = COALESCE(?, total_correct), exam_count = COALESCE(?, exam_count), topic_stats = COALESCE(?, topic_stats) WHERE user_id = ?'
    ).run(
      totalAnswered ?? undefined,
      totalCorrect ?? undefined,
      examCount ?? undefined,
      topicStr ?? undefined,
      req.userId
    );
  } else {
    db.prepare(
      'INSERT INTO user_stats (user_id, total_answered, total_correct, exam_count, topic_stats) VALUES (?, ?, ?, ?, ?)'
    ).run(req.userId, totalAnswered || 0, totalCorrect || 0, examCount || 0, topicStr || '{}');
  }
  res.json({ ok: true });
});

// 考试记录列表
router.get('/me/exam-history', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, exam_id, exam_name, score, total, duration_sec, created_at FROM exam_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.userId);
  res.json({
    ok: true,
    list: rows.map(r => ({
      id: r.id,
      examId: r.exam_id,
      examName: r.exam_name,
      score: r.score,
      total: r.total,
      durationSec: r.duration_sec,
      createdAt: r.created_at
    }))
  });
});

// 提交考试记录
router.post('/me/exam-record', (req, res) => {
  const { examId, examName, score, total, answers, durationSec } = req.body || {};
  if (examId == null || score == null || total == null) {
    return res.status(400).json({ ok: false, message: '缺少考试信息' });
  }
  const db = getDb();
  db.prepare(
    'INSERT INTO exam_records (user_id, exam_id, exam_name, score, total, answers, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    req.userId,
    String(examId),
    String(examName || examId),
    Number(score),
    Number(total),
    answers ? JSON.stringify(answers) : null,
    durationSec != null ? Number(durationSec) : null
  );
  const stmt = db.prepare('UPDATE user_stats SET exam_count = exam_count + 1 WHERE user_id = ?');
  stmt.run(req.userId);
  const hasRow = db.prepare('SELECT 1 FROM user_stats WHERE user_id = ?').get(req.userId);
  if (!hasRow) {
    db.prepare('INSERT INTO user_stats (user_id, exam_count) VALUES (?, 1)').run(req.userId);
  }
  res.json({ ok: true });
});

// 错题列表
router.get('/me/mistakes', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT question_id FROM user_mistakes WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json({ ok: true, mistakeIds: rows.map(r => r.question_id) });
});

// 同步错题（全量替换）
router.put('/me/mistakes', (req, res) => {
  const { mistakeIds } = req.body || {};
  const ids = Array.isArray(mistakeIds) ? mistakeIds : [];
  const db = getDb();
  db.prepare('DELETE FROM user_mistakes WHERE user_id = ?').run(req.userId);
  const insert = db.prepare('INSERT INTO user_mistakes (user_id, question_id) VALUES (?, ?)');
  for (const qid of ids) {
    if (qid) insert.run(req.userId, String(qid));
  }
  res.json({ ok: true });
});

module.exports = router;
