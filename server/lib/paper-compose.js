function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getQuestionsBySubject(db, subject) {
  return db.prepare('SELECT id FROM questions WHERE subject = ?').all(subject);
}

/**
 * 按模拟考配置组卷（与前端 startExam 逻辑一致）
 */
function composeFromExamConfig(db, examConfigId) {
  const cfg = db.prepare('SELECT * FROM exam_configs WHERE id = ?').get(examConfigId);
  if (!cfg) return { error: '考试配置不存在' };

  let pool = [];
  if (cfg.subject === 'all') {
    const n = Math.floor(cfg.count / 3);
    const m = shuffle(getQuestionsBySubject(db, 'math')).slice(0, n);
    const c = shuffle(getQuestionsBySubject(db, 'chinese')).slice(0, n);
    const v = shuffle(getQuestionsBySubject(db, 'vocational')).slice(0, cfg.count - n * 2);
    pool = shuffle([...m, ...c, ...v]);
  } else {
    pool = shuffle(getQuestionsBySubject(db, cfg.subject)).slice(0, cfg.count);
  }

  if (!pool.length) return { error: '题库暂无题目，无法组卷' };

  return {
    title: cfg.name,
    examConfigId: cfg.id,
    timeMin: cfg.time,
    questionIds: pool.map((r) => r.id),
    meta: {
      subject: cfg.subject,
      count: cfg.count,
      time: cfg.time,
    },
  };
}

/**
 * 按知识点（分类）组卷：allocations: { categoryId, count }[]
 */
function composeFromKnowledge(db, subject, allocations) {
  const sub = String(subject || '').trim().toLowerCase();
  if (!['math', 'chinese', 'vocational'].includes(sub)) {
    return { error: '科目无效' };
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { error: '请至少选择一个知识点并指定题数' };
  }

  const picked = [];
  const seen = new Set();

  for (const row of allocations) {
    const categoryId = parseInt(row.categoryId, 10);
    const count = parseInt(row.count, 10);
    if (isNaN(categoryId) || categoryId <= 0 || isNaN(count) || count <= 0) {
      return { error: '知识点或题数无效' };
    }
    if (count > 200) return { error: '单个知识点题数过大' };

    const rows = db
      .prepare('SELECT id FROM questions WHERE subject = ? AND category_id = ?')
      .all(sub, categoryId);
    const slice = shuffle(rows).slice(0, count);
    for (const r of slice) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        picked.push(r.id);
      }
    }
  }

  if (!picked.length) return { error: '所选知识点下没有可用题目' };

  const title = `知识点组卷（${sub === 'math' ? '数学' : sub === 'chinese' ? '语文' : '职测'}·${picked.length}题）`;

  return {
    title,
    examConfigId: null,
    timeMin: Math.max(15, Math.ceil(picked.length * 2)),
    questionIds: picked,
    meta: { subject: sub, allocations },
  };
}

module.exports = { composeFromExamConfig, composeFromKnowledge, shuffle };
