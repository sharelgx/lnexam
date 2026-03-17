/**
 * 将三科题目导出为 JSON 到项目根目录的 documents 文件夹，便于你编辑/AI 解析后再导入。
 * 用法：node scripts/export-questions-to-documents-json.js
 */
const path = require('path');
const fs = require('fs');

const mathData = require('./import-math-questions');
const chineseData = require('./import-chinese-questions');
const vocationalData = require('./import-vocational-questions');

const DOCUMENTS_DIR = path.join(__dirname, '..', '..', 'documents');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function toStandardQuestion(q, categoryName) {
  return {
    no: q.no,
    text: q.text,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation || '',
    category_name: categoryName || ''
  };
}

ensureDir(DOCUMENTS_DIR);

const mathList = mathData.MATH_QUESTIONS_DATA.map((q) =>
  toStandardQuestion(q, mathData.QUESTION_TO_KNOWLEDGE[q.no])
);
const chineseList = chineseData.CHINESE_QUESTIONS.map((q) =>
  toStandardQuestion(q, chineseData.Q2K[q.no])
);
const vocationalList = vocationalData.VOCATIONAL_QUESTIONS.map((q) =>
  toStandardQuestion(q, vocationalData.Q2K[q.no])
);

fs.writeFileSync(
  path.join(DOCUMENTS_DIR, 'math.json'),
  JSON.stringify(mathList, null, 2),
  'utf8'
);
fs.writeFileSync(
  path.join(DOCUMENTS_DIR, 'chinese.json'),
  JSON.stringify(chineseList, null, 2),
  'utf8'
);
fs.writeFileSync(
  path.join(DOCUMENTS_DIR, 'vocational.json'),
  JSON.stringify(vocationalList, null, 2),
  'utf8'
);

console.log('已导出到 documents/：');
console.log('  math.json: ' + mathList.length + ' 题');
console.log('  chinese.json: ' + chineseList.length + ' 题');
console.log('  vocational.json: ' + vocationalList.length + ' 题');
console.log('处理完后告诉我，我会用 import-questions-from-json 从 documents 导入到数据库。');
