const express = require('express');
const { getDb } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);
router.use(adminOnly);

// 列表（扁平，便于管理）
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, parent_id, name, subject_key, level, sort_order FROM categories ORDER BY level ASC, sort_order ASC, id ASC'
  ).all();
  res.json({
    ok: true,
    list: rows.map(r => ({
      id: r.id,
      parentId: r.parent_id || 0,
      name: r.name,
      subjectKey: r.subject_key,
      level: r.level,
      sortOrder: r.sort_order
    }))
  });
});

// 新增
router.post('/', (req, res) => {
  const { parentId, name, subjectKey, level, sortOrder } = req.body || {};
  if (!name || !level) {
    return res.status(400).json({ ok: false, message: '缺少名称或层级' });
  }
  const db = getDb();
  const parent_id = parentId == null || parentId === '' ? 0 : parseInt(parentId, 10);
  const sort = sortOrder != null ? parseInt(sortOrder, 10) : 0;
  const levelNum = parseInt(level, 10);
  const sk = subjectKey || null;
  db.prepare(
    'INSERT INTO categories (parent_id, name, subject_key, level, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(parent_id, String(name).trim(), sk, levelNum, sort);
  const row = db.prepare('SELECT id, parent_id, name, subject_key, level, sort_order FROM categories WHERE id = last_insert_rowid()').get();
  res.json({
    ok: true,
    item: {
      id: row.id,
      parentId: row.parent_id || 0,
      name: row.name,
      subjectKey: row.subject_key,
      level: row.level,
      sortOrder: row.sort_order
    }
  });
});

// 更新
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { parentId, name, subjectKey, level, sortOrder } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, message: '无效ID' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ ok: false, message: '分类不存在' });
  const updates = [];
  const values = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(String(name).trim()); }
  if (parentId !== undefined) { updates.push('parent_id = ?'); values.push(parentId === '' || parentId == null ? 0 : parseInt(parentId, 10)); }
  if (subjectKey !== undefined) { updates.push('subject_key = ?'); values.push(subjectKey || null); }
  if (level !== undefined) { updates.push('level = ?'); values.push(parseInt(level, 10)); }
  if (sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(parseInt(sortOrder, 10)); }
  if (updates.length) {
    values.push(id);
    db.prepare('UPDATE categories SET ' + updates.join(', ') + ' WHERE id = ?').run(...values);
  }
  res.json({ ok: true });
});

// 删除（若有子节点需先删子节点或禁止删除）
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, message: '无效ID' });
  const db = getDb();
  const hasChild = db.prepare('SELECT 1 FROM categories WHERE parent_id = ?').get(id);
  if (hasChild) return res.status(400).json({ ok: false, message: '请先删除该分类下的子分类' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
