const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// 公开：获取分类树（一级=科目，二三级=知识点）
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, parent_id, name, subject_key, level, sort_order FROM categories ORDER BY sort_order ASC, id ASC'
  ).all();
  const byParent = {};
  rows.forEach(r => {
    const pid = r.parent_id || 0;
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push({
      id: r.id,
      parentId: r.parent_id || 0,
      name: r.name,
      subjectKey: r.subject_key,
      level: r.level,
      sortOrder: r.sort_order,
      children: []
    });
  });
  function tree(pid) {
    return (byParent[pid] || []).map(node => {
      node.children = tree(node.id);
      return node;
    });
  }
  res.json({ ok: true, tree: tree(0) });
});

module.exports = router;
