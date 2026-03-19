/**
 * 纸质试卷：组卷会话、打印用题目、拍照上传、客观题阅卷与错题入库
 * 通过 registerPaperSessionRoutes(router) 挂到已含 authMiddleware 的 users 路由上。
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../db');
const { composeFromExamConfig, composeFromKnowledge } = require('../lib/paper-compose');
const { recognizeAnswerSheet, mapParsedToQuestionAnswers, isStepfunConfigured } = require('../lib/stepfun-vision');

function uploadsDirForSession(userId, sessionId) {
  return path.join(__dirname, '..', 'data', 'uploads', 'paper', String(userId), String(sessionId));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadSession(db, sessionId, userId) {
  return db.prepare('SELECT * FROM paper_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
}

function stripQuestionForSheet(q) {
  let options = q.options;
  if (typeof options === 'string') {
    try {
      options = JSON.parse(options);
    } catch (_) {
      options = [];
    }
  }
  return {
    id: q.id,
    subject: q.subject || '',
    topic: q.topic || '',
    text: q.text,
    options: Array.isArray(options) ? options : [],
    answer: q.answer != null ? Number(q.answer) : null,
    explanation: q.explanation || '',
  };
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const sessionId = parseInt(req.params.id, 10);
      const dir = uploadsDirForSession(req.userId, sessionId);
      ensureDir(dir);
      cb(null, dir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '') || '.jpg';
      const safe = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8) + ext;
      cb(null, safe);
    },
  }),
  limits: { files: 8, fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype || '');
    if (ok) cb(null, true);
    else cb(new Error('仅支持 jpeg/png/gif/webp 图片'));
  },
});

function paperMulterErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ ok: false, message: err.message || '上传失败' });
  }
  if (err && err.message === '仅支持 jpeg/png/gif/webp 图片') {
    return res.status(400).json({ ok: false, message: err.message });
  }
  next(err);
}

/**
 * @param {import('express').Router} router 已挂载 authMiddleware 的 users 路由
 */
function resolvePaperUploadPath(dataRoot, userId, sessionId, relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  if (!rel || rel.includes('..')) return null;
  const prefix = `uploads/paper/${userId}/${sessionId}/`;
  if (!rel.startsWith(prefix)) return null;
  const full = path.normalize(path.join(dataRoot, ...rel.split('/')));
  const allowedRoot = path.normalize(path.join(dataRoot, 'uploads', 'paper', String(userId), String(sessionId)));
  if (full !== allowedRoot && !full.startsWith(allowedRoot + path.sep)) return null;
  return full;
}

function registerPaperSessionRoutes(router) {
  /**
   * 是否已配置阶跃星辰（仅布尔，不泄露密钥）。
   * 配置在库中或环境变量后，任意登录用户均可使用「AI识别答题卡」（共用平台密钥）。
   */
  router.get('/me/paper-ai/status', (req, res) => {
    res.json({
      ok: true,
      stepfunConfigured: isStepfunConfigured(),
      sharedForAllUsers: true,
    });
  });

  router.get('/me/paper-sessions', (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, mode, title, exam_config_id, status, score, total, question_count, created_at, graded_at
         FROM paper_sessions WHERE user_id = ? ORDER BY id DESC LIMIT 50`
      )
      .all(req.userId);
    res.json({
      ok: true,
      list: rows.map((r) => ({
        id: r.id,
        mode: r.mode,
        title: r.title,
        examConfigId: r.exam_config_id,
        status: r.status,
        score: r.score,
        total: r.total,
        questionCount: r.question_count,
        createdAt: r.created_at,
        gradedAt: r.graded_at,
      })),
    });
  });

  router.post('/me/paper-sessions', (req, res) => {
    const body = req.body || {};
    const mode = (body.mode || '').trim();
    const db = getDb();

    let composed;
    if (mode === 'exam_config') {
      composed = composeFromExamConfig(db, body.examConfigId);
    } else if (mode === 'knowledge') {
      composed = composeFromKnowledge(db, body.subject, body.allocations);
    } else {
      return res.status(400).json({ ok: false, message: 'mode 须为 exam_config 或 knowledge' });
    }

    if (composed.error) {
      return res.status(400).json({ ok: false, message: composed.error });
    }

    const meta = {
      ...composed.meta,
      timeMin: composed.timeMin,
    };

    const result = db
      .prepare(
        `INSERT INTO paper_sessions (user_id, mode, title, exam_config_id, meta_json, question_ids, question_count, status, uploads_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '[]')`
      )
      .run(
        req.userId,
        mode,
        composed.title,
        composed.examConfigId || null,
        JSON.stringify(meta),
        JSON.stringify(composed.questionIds),
        composed.questionIds.length
      );

    res.json({
      ok: true,
      session: {
        id: result.lastInsertRowid,
        mode,
        title: composed.title,
        examConfigId: composed.examConfigId,
        questionIds: composed.questionIds,
        questionCount: composed.questionIds.length,
        status: 'pending',
        meta,
      },
    });
  });

  router.get('/me/paper-sessions/:id', (req, res) => {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, message: '无效 id' });

    const row = loadSession(db, id, req.userId);
    if (!row) return res.status(404).json({ ok: false, message: '记录不存在' });

    let uploads = [];
    try {
      uploads = JSON.parse(row.uploads_json || '[]');
    } catch (_) {}

    res.json({
      ok: true,
      session: {
        id: row.id,
        mode: row.mode,
        title: row.title,
        examConfigId: row.exam_config_id,
        meta: row.meta_json ? JSON.parse(row.meta_json) : {},
        questionCount: row.question_count,
        status: row.status,
        score: row.score,
        total: row.total,
        uploads,
        createdAt: row.created_at,
        gradedAt: row.graded_at,
      },
    });
  });

  router.get('/me/paper-sessions/:id/sheet', (req, res) => {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, message: '无效 id' });

    const row = loadSession(db, id, req.userId);
    if (!row) return res.status(404).json({ ok: false, message: '记录不存在' });

    let questionIds = [];
    try {
      questionIds = JSON.parse(row.question_ids || '[]');
    } catch (_) {
      return res.status(500).json({ ok: false, message: '试卷数据损坏' });
    }

    const placeholders = questionIds.map(() => '?').join(',');
    if (!placeholders) return res.json({ ok: true, title: row.title, questions: [] });

    const rows = db
      .prepare(`SELECT id, subject, topic, text, options, answer, explanation FROM questions WHERE id IN (${placeholders})`)
      .all(...questionIds);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    const questions = questionIds.map((qid) => {
      const q = byId[qid];
      return q
        ? stripQuestionForSheet(q)
        : { id: qid, subject: '', topic: '', text: '（题目已删除）', options: [], answer: null, explanation: '' };
    });

    res.json({
      ok: true,
      title: row.title,
      sessionId: row.id,
      status: row.status,
      questions,
    });
  });

  /** 阶跃星辰视觉：根据已上传答题卡照片识别选项，返回 questionId -> 0..3 */
  router.post('/me/paper-sessions/:id/recognize', async (req, res) => {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, message: '无效 id' });

    const row = loadSession(db, id, req.userId);
    if (!row) return res.status(404).json({ ok: false, message: '记录不存在' });
    if (row.status === 'graded') {
      return res.status(400).json({ ok: false, message: '已阅卷，无需识别' });
    }

    let uploads = [];
    try {
      uploads = JSON.parse(row.uploads_json || '[]');
    } catch (_) {
      return res.status(400).json({ ok: false, message: '上传记录损坏' });
    }
    if (!uploads.length) {
      return res.status(400).json({ ok: false, message: '请先上传答题卡照片' });
    }

    let questionIds = [];
    try {
      questionIds = JSON.parse(row.question_ids || '[]');
    } catch (_) {
      return res.status(500).json({ ok: false, message: '试卷数据损坏' });
    }

    const dataRoot = path.join(__dirname, '..', 'data');
    const maxFiles = 6;
    const maxTotalBytes = 18 * 1024 * 1024;
    const imageParts = [];
    let totalBytes = 0;

    for (const u of uploads.slice(0, maxFiles)) {
      const full = resolvePaperUploadPath(dataRoot, req.userId, id, u.path);
      if (!full || !fs.existsSync(full)) continue;
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      totalBytes += stat.size;
      if (totalBytes > maxTotalBytes) {
        return res.status(400).json({ ok: false, message: '图片总体积过大，请减少张数或压缩后重试（约≤18MB）' });
      }
      const mime = (u.mimetype || '').toLowerCase();
      const buf = fs.readFileSync(full);
      imageParts.push({ buffer: buf, mimeType: mime || 'image/jpeg' });
    }

    if (!imageParts.length) {
      return res.status(400).json({ ok: false, message: '未找到有效上传图片文件' });
    }

    try {
      const { parsed, model, rawContent } = await recognizeAnswerSheet(imageParts, questionIds.length, id);
      const { answers, recognizedCount } = mapParsedToQuestionAnswers(parsed, questionIds);
      console.log(`[recognize] session=${id} model=${model} recognized=${recognizedCount}/${questionIds.length}`);
      console.log('[recognize] parsed JSON:', JSON.stringify(parsed).slice(0, 500));
      console.log('[recognize] mapped answers (qid→idx):', JSON.stringify(answers).slice(0, 500));
      res.json({
        ok: true,
        answers,
        recognizedCount,
        totalQuestions: questionIds.length,
        model,
        rawContent: rawContent ? rawContent.slice(0, 300) : '',
        notice: '识别结果由 AI 生成，提交前请在答题页核对',
      });
    } catch (e) {
      const code = e.code || '';
      if (code === 'STEPFUN_NOT_CONFIGURED') {
        return res.status(503).json({ ok: false, message: e.message });
      }
      if (code === 'STEPFUN_API_ERROR' && e.status === 401) {
        return res.status(502).json({ ok: false, message: '阶跃星辰密钥无效或已过期，请检查 STEPFUN_API_KEY' });
      }
      console.error('[paper recognize]', e);
      return res.status(502).json({ ok: false, message: e.message || '识别失败' });
    }
  });

  router.post('/me/paper-sessions/:id/uploads', upload.array('photos', 8), (req, res) => {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, message: '无效 id' });

    const row = loadSession(db, id, req.userId);
    if (!row) return res.status(404).json({ ok: false, message: '记录不存在' });
    if (row.status === 'graded') {
      return res.status(400).json({ ok: false, message: '已阅卷，不能再上传' });
    }

    let uploads = [];
    try {
      uploads = JSON.parse(row.uploads_json || '[]');
    } catch (_) {}

    const relBase = path.join('uploads', 'paper', String(req.userId), String(id));
    const now = new Date().toISOString();
    for (const f of req.files || []) {
      uploads.push({
        filename: f.filename,
        path: relBase.replace(/\\/g, '/') + '/' + f.filename,
        size: f.size,
        mimetype: f.mimetype,
        uploadedAt: now,
      });
    }

    db.prepare('UPDATE paper_sessions SET uploads_json = ?, status = ? WHERE id = ? AND user_id = ?').run(
      JSON.stringify(uploads),
      uploads.length ? 'uploaded' : row.status,
      id,
      req.userId
    );

    res.json({ ok: true, uploads });
  });

  router.use(paperMulterErrorHandler);

  router.post('/me/paper-sessions/:id/grade', (req, res) => {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, message: '无效 id' });

    const row = loadSession(db, id, req.userId);
    if (!row) return res.status(404).json({ ok: false, message: '记录不存在' });
    if (row.status === 'graded') {
      return res.status(400).json({ ok: false, message: '该试卷已阅卷' });
    }

    const answers = (req.body && req.body.answers) || {};
    if (typeof answers !== 'object') {
      return res.status(400).json({ ok: false, message: 'answers 格式错误' });
    }

    let questionIds = [];
    try {
      questionIds = JSON.parse(row.question_ids || '[]');
    } catch (_) {
      return res.status(500).json({ ok: false, message: '试卷数据损坏' });
    }

    const placeholders = questionIds.map(() => '?').join(',');
    const qrows = questionIds.length
      ? db.prepare(`SELECT id, topic, answer FROM questions WHERE id IN (${placeholders})`).all(...questionIds)
      : [];
    const answerById = Object.fromEntries(qrows.map((r) => [r.id, { answer: r.answer, topic: r.topic }]));

    let correct = 0;
    let wrong = 0;
    let blank = 0;
    const wrongIds = [];
    const details = [];

    for (let i = 0; i < questionIds.length; i++) {
      const qid = questionIds[i];
      const meta = answerById[qid];
      const raw = answers[qid];
      const userAns = raw === undefined || raw === null || raw === '' ? undefined : Number(raw);

      if (!meta) {
        blank++;
        details.push({ id: qid, ok: false, blank: true });
        continue;
      }
      if (userAns === undefined || Number.isNaN(userAns)) {
        blank++;
        details.push({ id: qid, ok: false, blank: true, correctIndex: meta.answer });
        continue;
      }
      if (userAns === meta.answer) {
        correct++;
        details.push({ id: qid, ok: true, correctIndex: meta.answer });
      } else {
        wrong++;
        wrongIds.push(qid);
        details.push({ id: qid, ok: false, blank: false, correctIndex: meta.answer });
      }
    }

    const total = questionIds.length;
    const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const insMistake = db.prepare('INSERT OR IGNORE INTO user_mistakes (user_id, question_id) VALUES (?, ?)');
    for (const qid of wrongIds) {
      insMistake.run(req.userId, qid);
    }

    const examName = `${row.title}（纸质卷）`;
    db.prepare(
      'INSERT INTO exam_records (user_id, exam_id, exam_name, score, total, answers, duration_sec) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(req.userId, `paper-${id}`, examName, correct, total, JSON.stringify(answers), null);

    const stmt = db.prepare('UPDATE user_stats SET exam_count = exam_count + 1 WHERE user_id = ?');
    stmt.run(req.userId);
    const hasRow = db.prepare('SELECT 1 FROM user_stats WHERE user_id = ?').get(req.userId);
    if (!hasRow) {
      db.prepare('INSERT INTO user_stats (user_id, exam_count) VALUES (?, 1)').run(req.userId);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE paper_sessions SET status = 'graded', score = ?, total = ?, graded_answers = ?, graded_at = ? WHERE id = ? AND user_id = ?`
    ).run(correct, total, JSON.stringify(answers), now, id, req.userId);

    const mistakes = db.prepare('SELECT question_id FROM user_mistakes WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);

    res.json({
      ok: true,
      result: {
        scorePct,
        correct,
        wrong,
        blank,
        total,
        wrongIds,
        details,
      },
      mistakeIds: mistakes.map((m) => m.question_id),
    });
  });
}

module.exports = { registerPaperSessionRoutes };
