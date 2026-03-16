const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lnexam.db');

function ensureDataDir() {
  const fs = require('fs');
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let db = null;

function getDb() {
  if (!db) {
    ensureDataDir();
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initSchema(dbInstance) {
  const d = dbInstance || getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'common',
      membership TEXT NOT NULL DEFAULT 'free',
      membership_expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL,
      text TEXT NOT NULL,
      options TEXT NOT NULL,
      answer INTEGER NOT NULL,
      explanation TEXT,
      category_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS exam_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      exam_id TEXT NOT NULL,
      exam_name TEXT,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      answers TEXT,
      duration_sec INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY,
      total_answered INTEGER DEFAULT 0,
      total_correct INTEGER DEFAULT 0,
      exam_count INTEGER DEFAULT 0,
      topic_stats TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_mistakes (
      user_id INTEGER NOT NULL,
      question_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_exam_records_user ON exam_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_mistakes_user ON user_mistakes(user_id);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL,
      subject_key TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

    CREATE TABLE IF NOT EXISTS exam_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      count INTEGER NOT NULL,
      time INTEGER NOT NULL,
      desc TEXT,
      badge TEXT,
      badge_color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_exam_configs_sort ON exam_configs(sort_order);
  `);
  // 种子：仅保留 4 个模拟考试配置
  const seed = [
    ['math-full', '数学模拟考试（满题）', 'math', 20, 60, '覆盖所有数学知识点，模拟真实考试', '完整版', '#dbeafe;color:#1d4ed8', 1],
    ['chinese-full', '语文模拟考试（满题）', 'chinese', 15, 60, '覆盖语文核心考点，模拟真实考试', '完整版', '#ede9fe;color:#5b21b6', 2],
    ['vocational-full', '职业适应性测试（满题）', 'vocational', 30, 45, '政治、历史、法律、职业道德、时事等综合测试', '完整版', '#ccfbf1;color:#0f766e', 3],
    ['all-three', '三科综合联考', 'all', 30, 60, '数学、语文、职测各10题，全面检验备考成果', '全科版', '#fef9c3;color:#713f12', 4],
  ];
  const ins = d.prepare(
    `INSERT OR IGNORE INTO exam_configs (id, name, subject, count, time, desc, badge, badge_color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  seed.forEach(row => ins.run(...row));
}

module.exports = { getDb, initSchema };
