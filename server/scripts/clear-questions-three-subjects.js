const { getDb } = require('../db');
const db = getDb();
const r = db.prepare("DELETE FROM questions WHERE subject IN ('math', 'chinese', 'vocational')").run();
console.log('已删除三科题目:', r.changes, '条');
