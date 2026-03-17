/**
 * 从 documents 导入 2022 年数学/语文复习题库，题目 ID 使用 math_2022_1、chinese_2022_1 等，不覆盖现有题库。
 * 用法：node scripts/import-2022-from-documents.js
 */
const path = require('path');
const fs = require('fs');
const { getDb, initSchema } = require('../db');

const DOCUMENTS = path.join(__dirname, '..', '..', 'documents');

const FILES = [
  { file: '2022年数学复习题库.json', subject: 'math' },
  { file: '2022年语文复习题库.json', subject: 'chinese' }
];

const catCache = {};
function getCategoryId(db, categoryName) {
  if (!categoryName || !categoryName.trim()) return null;
  const name = categoryName.trim();
  if (catCache[name] !== undefined) return catCache[name];
  let row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (!row) row = db.prepare('SELECT id FROM categories WHERE name LIKE ?').get('%' + name + '%');
  catCache[name] = row ? row.id : null;
  return catCache[name];
}

function slug(str) {
  return (str || 'other').replace(/[（）/、\s]/g, '_').slice(0, 30);
}

function run() {
  initSchema(getDb());
  const db = getDb();

  const ins = db.prepare(
    `INSERT OR REPLACE INTO questions (id, subject, topic, text, options, answer, explanation, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let total = 0;
  for (const { file, subject } of FILES) {
    const full = path.join(DOCUMENTS, file);
    if (!fs.existsSync(full)) {
      console.warn('  未找到: ' + file);
      continue;
    }
    const list = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (!Array.isArray(list)) {
      console.warn('  ' + file + ': 非数组，已跳过');
      continue;
    }
    let count = 0;
    for (const q of list) {
      const id = `${subject}_2022_${q.no}`;
      const topic = slug(q.category_name || subject);
      const optionsStr = JSON.stringify(Array.isArray(q.options) ? q.options : []);
      const answer = typeof q.answer === 'number' ? q.answer : parseInt(q.answer, 10);
      const categoryId = getCategoryId(db, q.category_name);
      ins.run(id, subject, topic, q.text || '', optionsStr, answer, q.explanation || null, categoryId);
      count++;
      total++;
    }
    console.log('  ' + file + ': 导入 ' + count + ' 题');
  }
  console.log('2022 题库共导入 ' + total + ' 道题。');
}

run();
