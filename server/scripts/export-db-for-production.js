/**
 * 方案一：导出当前数据库为单文件，用于上传到线上替换，使线上与本地一致（含解析等）。
 * 用法：node scripts/export-db-for-production.js
 * 输出：server/data/lnexam-production.db.gz（可直接上传到服务器后解压替换）
 */
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'lnexam.db');
const outPath = path.join(dataDir, 'lnexam-production.db');
const gzPath = path.join(dataDir, 'lnexam-production.db.gz');

async function run() {
  if (!fs.existsSync(dbPath)) {
    console.error('未找到数据库: ' + dbPath);
    process.exit(1);
  }

  console.log('正在备份数据库（只读打开，不影响本地服务）...');
  const db = new Database(dbPath, { readonly: true });
  try {
    await db.backup(outPath);
    console.log('已生成: ' + outPath);
  } finally {
    db.close();
  }

  console.log('正在压缩...');
  const gzip = zlib.createGzip();
  const inp = fs.createReadStream(outPath);
  const out = fs.createWriteStream(gzPath);
  await new Promise((resolve, reject) => {
    inp.pipe(gzip).pipe(out);
    out.on('finish', resolve);
    inp.on('error', reject);
    gzip.on('error', reject);
    out.on('error', reject);
  });

  fs.unlinkSync(outPath);
  const stat = fs.statSync(gzPath);
  console.log('已生成: ' + gzPath + ' (' + (stat.size / 1024).toFixed(1) + ' KB)');
  console.log('');
  console.log('下一步：');
  console.log('  1. 将 lnexam-production.db.gz 上传到服务器'); 
  console.log('  2. 在服务器上：停止服务 → 解压并覆盖 server/data/lnexam.db → 启动服务');
  console.log('  解压示例: gunzip -c lnexam-production.db.gz > server/data/lnexam.db');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
