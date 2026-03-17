/**
 * 从 documents 导入 2023、2024、2025 年题库（数学/语文/职业素养），完全相同的题去重不重复插入。
 * 题目 ID：math_2024_1、chinese_2024_1、vocational_2024_1 等（按年份）。
 * 去重规则：题干(text)+答案(answer)+选项(options) 三者相同视为同一题，只保留一条。
 * 用法：node scripts/import-2024-2025-from-documents.js
 */
const path = require('path');
const fs = require('fs');
const { getDb, initSchema } = require('../db');

const DOCUMENTS = path.join(__dirname, '..', '..', 'documents');

const FILES = [
  { file: '2023年数学题库.json', subject: 'math', year: '2023' },
  { file: '2023年语文题库.json', subject: 'chinese', year: '2023' },
  { file: '2023年职业素养题库.json', subject: 'vocational', year: '2023' },
  { file: '2024年数学题库.json', subject: 'math', year: '2024' },
  { file: '2024年语文题库.json', subject: 'chinese', year: '2024' },
  { file: '2024年职业素养题库.json', subject: 'vocational', year: '2024' },
  { file: '2025年数学题库.json', subject: 'math', year: '2025' },
  { file: '2025年语文题库.json', subject: 'chinese', year: '2025' },
  { file: '2025年职业素养题库.json', subject: 'vocational', year: '2025' }
];

const catCache = {};
function getCategoryId(db, categoryName) {
  if (!categoryName || !String(categoryName).trim()) return null;
  const name = String(categoryName).trim();
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
    `INSERT INTO questions (id, subject, topic, text, options, answer, explanation, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const existsStmt = db.prepare(
    'SELECT 1 FROM questions WHERE trim(text) = trim(?) AND answer = ? AND options = ? LIMIT 1'
  );

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const { file, subject, year } of FILES) {
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
    let inserted = 0;
    let skipped = 0;
    for (const q of list) {
      const text = (q.text || '').trim();
      const options = Array.isArray(q.options) ? q.options : [];
      const optionsStr = JSON.stringify(options);
      const answer = typeof q.answer === 'number' ? q.answer : parseInt(q.answer, 10);
      if (Number.isNaN(answer)) continue;
      const existing = existsStmt.get(text, answer, optionsStr);
      if (existing) {
        skipped++;
        continue;
      }
      const id = `${subject}_${year}_${q.no}`;
      const topic = slug(q.category_name || subject);
      const categoryId = getCategoryId(db, q.category_name);
      try {
        ins.run(id, subject, topic, text, optionsStr, answer, q.explanation || null, categoryId);
        inserted++;
      } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT' && e.message.includes('UNIQUE')) {
          skipped++;
        } else {
          throw e;
        }
      }
    }
    totalInserted += inserted;
    totalSkipped += skipped;
    console.log('  ' + file + ': 新增 ' + inserted + ' 题，去重跳过 ' + skipped + ' 题');
  }

  console.log('合计: 新增 ' + totalInserted + ' 题，去重跳过 ' + totalSkipped + ' 题。');
}

run();
