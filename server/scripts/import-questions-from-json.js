/**
 * 从 JSON 文件导入题目到数据库
 * 用法：
 *   node scripts/import-questions-from-json.js [目录]
 * 默认读取 server/data/；若传入目录则从该目录读（例如从项目根执行时用 ../../documents）。
 * 支持：math.json、chinese.json、vocational.json 或 questions-all.json（{ math:[], chinese:[], vocational:[] }）。
 * 导入前请先执行 node scripts/init-db.js 以创建分类。
 */
const path = require('path');
const fs = require('fs');
const { getDb, initSchema } = require('../db');

const DATA_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'data');

function loadJson(filePath) {
  const full = path.isAbsolute(filePath) ? filePath : path.join(DATA_DIR, filePath);
  if (!fs.existsSync(full)) return null;
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

function ensureCategoryIdColumn(db) {
  try {
    db.prepare('ALTER TABLE questions ADD COLUMN category_id INTEGER').run();
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

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
  ensureCategoryIdColumn(db);

  const categoryCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (categoryCount === 0) {
    console.warn('未检测到分类数据，请先执行: node scripts/init-db.js');
  }

  let total = 0;
  const ins = db.prepare(
    `INSERT OR REPLACE INTO questions (id, subject, topic, text, options, answer, explanation, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // 优先单文件合并格式
  const allPath = path.join(DATA_DIR, 'questions-all.json');
  if (fs.existsSync(allPath)) {
    const all = loadJson('questions-all.json');
    if (all && typeof all === 'object') {
      for (const subject of ['math', 'chinese', 'vocational']) {
        const list = Array.isArray(all[subject]) ? all[subject] : [];
        for (const q of list) {
          const id = `${subject}_${q.no}`;
          const topic = slug(q.category_name || subject);
          const optionsStr = JSON.stringify(Array.isArray(q.options) ? q.options : []);
          const answer = typeof q.answer === 'number' ? q.answer : parseInt(q.answer, 10);
          const categoryId = getCategoryId(db, q.category_name);
          ins.run(id, subject, topic, q.text || '', optionsStr, answer, q.explanation || null, categoryId);
          total++;
        }
        if (list.length) console.log(`  ${subject}: ${list.length} 题`);
      }
      console.log(`已从 questions-all.json 导入共 ${total} 道题。`);
      return;
    }
  }

  // 分文件：math.json, chinese.json, vocational.json
  const files = [
    { file: 'math.json', subject: 'math' },
    { file: 'chinese.json', subject: 'chinese' },
    { file: 'vocational.json', subject: 'vocational' }
  ];

  for (const { file, subject } of files) {
    const list = loadJson(file);
    if (!Array.isArray(list) || list.length === 0) {
      if (fs.existsSync(path.join(DATA_DIR, file))) console.warn(`  ${file}: 非数组或为空，已跳过`);
      continue;
    }
    let count = 0;
    for (const q of list) {
      const id = `${subject}_${q.no}`;
      const topic = slug(q.category_name || subject);
      const optionsStr = JSON.stringify(Array.isArray(q.options) ? q.options : []);
      const answer = typeof q.answer === 'number' ? q.answer : parseInt(q.answer, 10);
      const categoryId = getCategoryId(db, q.category_name);
      ins.run(id, subject, topic, q.text || '', optionsStr, answer, q.explanation || null, categoryId);
      count++;
      total++;
    }
    console.log(`  ${file}: 导入 ${count} 题`);
  }

  console.log(`共导入 ${total} 道题。`);
}

run();
