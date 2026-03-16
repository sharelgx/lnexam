const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb, initSchema } = require('../db');

initSchema(getDb());
const db = getDb();

// 创建默认管理员（若不存在）
const adminUsername = 'admin';
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
if (!existing) {
  const password_hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, name, phone, role, membership) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(adminUsername, password_hash, '管理员', '', 'admin', 'vip');
  console.log('已创建默认管理员: 账号 admin 密码 admin123');
}

// 可选：创建演示学生账号
const demoUser = 'student001';
const demoExists = db.prepare('SELECT id FROM users WHERE username = ?').get(demoUser);
if (!demoExists) {
  const password_hash = bcrypt.hashSync('123456', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, name, phone, role, membership) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(demoUser, password_hash, '张同学', demoUser, 'common', 'free');
  console.log('已创建演示学生: 账号 student001 密码 123456');
}

// 分类种子：依据《辽宁金融职业学院2026单招数学题库知识点分类总结》及语文/职测题库结构
// 一级=科目，二级/三级=知识点（数学含三级：函数下分定义域、单调性、奇偶性）
function seedCategories() {
  const ins = db.prepare('INSERT INTO categories (parent_id, name, subject_key, level, sort_order) VALUES (?, ?, ?, ?, ?)');
  try {
    ins.run(0, '数学', 'math', 1, 1);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      db.exec('DROP TABLE IF EXISTS categories');
      db.exec(`CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        subject_key TEXT,
        level INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      ins.run(0, '数学', 'math', 1, 1);
    } else throw e;
  }
  ins.run(0, '语文', 'chinese', 1, 2);
  ins.run(0, '职业适应性测试', 'vocational', 1, 3);

  const mathId = db.prepare('SELECT id FROM categories WHERE subject_key = ?').get('math').id;
  const chineseId = db.prepare('SELECT id FROM categories WHERE subject_key = ?').get('chinese').id;
  const vocId = db.prepare('SELECT id FROM categories WHERE subject_key = ?').get('vocational').id;

  // 数学二级知识点（按《知识点分类总结》第一部分+第二部分：集合、不等式、函数、三角函数、数列等）
  const mathL2 = [
    '集合与常用逻辑用语', '不等式', '函数（定义域/单调性/奇偶性）', '函数最值与零点',
    '三角函数', '数列', '向量', '直线与圆', '圆锥曲线', '指数与对数', '概率与统计', '排列组合'
  ];
  mathL2.forEach((name, i) => {
    ins.run(mathId, name, null, 2, i + 1);
  });
  const funcId = db.prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?').get(mathId, '函数（定义域/单调性/奇偶性）').id;
  ['函数定义域求解', '函数单调性判断', '函数奇偶性判断'].forEach((name, i) => {
    ins.run(funcId, name, null, 3, i + 1);
  });

  // 语文二级知识点（《辽宁金融职业学院2026单招语文题库知识点分类总结》第一、二部分）
  const chineseL2 = [
    '字音辨析', '字形辨析', '成语与熟语运用', '文言文基础（实词/虚词/句式/翻译）',
    '古诗文默写与诗词鉴赏', '记叙文与说明文阅读', '文学常识、文化常识识记', '病句辨析、句式变换、情境表达'
  ];
  chineseL2.forEach((name, i) => {
    ins.run(chineseId, name, null, 2, i + 1);
  });

  // 职业适应性测试二级知识点（《辽宁金融职业学院2026单招职业适应性测试题库知识点分类总结》第一部分）
  const vocL2 = [
    '思想政治素养（政策/制度/党史/法治）', '职业素养与道德（职业道德/人生态度）',
    '国情社情与科技发展（资源/经济/科技/地理）', '院校特色常识'
  ];
  vocL2.forEach((name, i) => {
    ins.run(vocId, name, null, 2, i + 1);
  });

  console.log('已创建分类：数学（含三级知识点）、语文、职业适应性测试');
}

const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
if (catCount === 0) {
  seedCategories();
}

console.log('数据库初始化完成。');
