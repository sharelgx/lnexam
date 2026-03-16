/**
 * 按文档重新创建科目与知识点分类（数学/语文/职业适应性测试）。
 * 以《辽宁金融职业学院2026单招数学题库知识点分类总结》第一、二部分为主，
 * 数学一级科目下为二级知识点，其中「函数（定义域/单调性/奇偶性）」下再设三级。
 * 语文、职测参考 documents 内题库知识点分类。
 * 用法：node scripts/seed-categories.js
 */
const path = require('path');
const { getDb, initSchema } = require('../db');

initSchema(getDb());
const db = getDb();

function seedCategories() {
  db.exec('DELETE FROM categories');
  const ins = db.prepare('INSERT INTO categories (parent_id, name, subject_key, level, sort_order) VALUES (?, ?, ?, ?, ?)');

  ins.run(0, '数学', 'math', 1, 1);
  ins.run(0, '语文', 'chinese', 1, 2);
  ins.run(0, '职业适应性测试', 'vocational', 1, 3);

  const mathId = db.prepare('SELECT id FROM categories WHERE subject_key = ?').get('math').id;
  const chineseId = db.prepare('SELECT id FROM categories WHERE subject_key = ?').get('chinese').id;
  const vocId = db.prepare('SELECT id FROM categories WHERE subject_key = ?').get('vocational').id;

  const mathL2 = [
    '集合与常用逻辑用语', '不等式', '函数（定义域/单调性/奇偶性）', '函数最值与零点',
    '三角函数', '数列', '向量', '直线与圆', '圆锥曲线', '指数与对数', '概率与统计', '排列组合'
  ];
  mathL2.forEach((name, i) => ins.run(mathId, name, null, 2, i + 1));

  const funcId = db.prepare('SELECT id FROM categories WHERE parent_id = ? AND name = ?').get(mathId, '函数（定义域/单调性/奇偶性）').id;
  ['函数定义域求解', '函数单调性判断', '函数奇偶性判断'].forEach((name, i) => ins.run(funcId, name, null, 3, i + 1));

  // 语文（《2026单招语文题库知识点分类总结》第一、二部分）
  const chineseL2 = [
    '字音辨析', '字形辨析', '成语与熟语运用', '文言文基础（实词/虚词/句式/翻译）',
    '古诗文默写与诗词鉴赏', '记叙文与说明文阅读', '文学常识、文化常识识记', '病句辨析、句式变换、情境表达'
  ];
  chineseL2.forEach((name, i) => ins.run(chineseId, name, null, 2, i + 1));

  // 职业适应性测试（《2026单招职业适应性测试题库知识点分类总结》第一部分）
  const vocL2 = [
    '思想政治素养（政策/制度/党史/法治）', '职业素养与道德（职业道德/人生态度）',
    '国情社情与科技发展（资源/经济/科技/地理）', '院校特色常识'
  ];
  vocL2.forEach((name, i) => ins.run(vocId, name, null, 2, i + 1));

  console.log('已按文档重新创建分类：数学（含三级知识点）、语文、职业适应性测试');
}

seedCategories();
