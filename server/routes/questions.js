/**
 * 公开：按科目、分类获取题目（用于知识点练习等）
 * GET /api/questions?subject=math
 * GET /api/questions?subject=math&category_id=4
 */
const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// 列表：必须放在 /:id 之前；同时匹配 '' 与 '/'（Express 挂载后 path 可能为空）
router.get(['/', ''], (req, res) => {
  const subject = (req.query.subject || '').trim().toLowerCase();
  const categoryId = req.query.category_id ? parseInt(req.query.category_id, 10) : null;

  if (!subject) {
    return res.status(400).json({ ok: false, error: '缺少 subject' });
  }

  const db = getDb();
  let sql = 'SELECT id, text, options, answer, explanation FROM questions WHERE subject = ?';
  const params = [subject];

  if (categoryId != null && !isNaN(categoryId)) {
    sql += ' AND category_id = ?';
    params.push(categoryId);
  }

  sql += ' ORDER BY id ASC';

  const rows = db.prepare(sql).all(...params);
  const questions = rows.map((r) => ({
    id: r.id,
    text: r.text,
    options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
    answer: r.answer,
    explanation: r.explanation || ''
  }));

  res.json({ ok: true, questions });
});

// 按 id 获取单题（用于错题本等）
router.get('/:id', (req, res) => {
  const id = (req.params.id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: '缺少题目 id' });

  const db = getDb();
  const r = db.prepare('SELECT id, subject, text, options, answer, explanation FROM questions WHERE id = ?').get(id);
  if (!r) return res.status(404).json({ ok: false, error: '题目不存在' });

  res.json({
    ok: true,
    question: {
      id: r.id,
      subject: r.subject,
      text: r.text,
      options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
      answer: r.answer,
      explanation: r.explanation || ''
    }
  });
});

module.exports = router;
