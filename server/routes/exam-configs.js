const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

/** GET /api/exam-configs 获取所有模拟考试配置（用于 /exams 页展示与组卷） */
router.get(['/', ''], (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT id, name, subject, count, time, desc, badge, badge_color, sort_order
       FROM exam_configs ORDER BY sort_order ASC, id ASC`
    ).all();
    const list = rows.map(r => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      count: r.count,
      time: r.time,
      desc: r.desc || '',
      badge: r.badge || '',
      badgeColor: r.badge_color || '',
      sortOrder: r.sort_order,
    }));
    res.json({ list });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '获取考试配置失败' });
  }
});

module.exports = router;
