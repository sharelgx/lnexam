/**
 * 视觉识别模块 - 智谱 GLM 多模态
 * 默认使用 glm-4v-plus（高精度），余额不足时自动降级到 glm-4v-flash（免费）
 * 密钥优先级：数据库 app_settings > 环境变量 GLM_API_KEY
 */

const { getDb } = require('../db');

const GLM_DEFAULT_BASE    = 'https://open.bigmodel.cn/api/paas/v4';
const GLM_DEFAULT_MODEL   = 'glm-4v-plus';
const GLM_FALLBACK_MODEL  = 'glm-4v-flash';

function readSetting(key) {
  try {
    const db = getDb();
    const r = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    if (r && r.value != null && String(r.value).trim() !== '') return String(r.value).trim();
  } catch (_) {}
  return '';
}

function getGlmConfig() {
  let apiKey = (process.env.GLM_API_KEY || '').trim();
  let base   = (process.env.GLM_API_BASE  || GLM_DEFAULT_BASE).trim();
  let model  = (process.env.GLM_VISION_MODEL || GLM_DEFAULT_MODEL).trim();
  const dk = readSetting('glm_api_key');
  if (dk) apiKey = dk;
  const dbB = readSetting('glm_api_base');
  if (dbB) base = dbB;
  const dbM = readSetting('glm_vision_model');
  if (dbM) model = dbM;
  return { apiKey, base: base.replace(/\/$/, ''), model };
}

function isConfigured() {
  return !!getGlmConfig().apiKey;
}

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end   = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function letterToIndex(ch) {
  if (ch == null || ch === '') return undefined;
  const c = String(ch).trim().toUpperCase();
  if (c === 'A') return 0;
  if (c === 'B') return 1;
  if (c === 'C') return 2;
  if (c === 'D') return 3;
  return undefined;
}

function buildPrompt(n, sessionId) {
  const keys = [];
  for (let i = 1; i <= n; i++) keys.push(`"${i}":null`);
  const exampleInner = keys.slice(0, Math.min(n, 5)).join(',') + (n > 5 ? ',...' : '');

  return `请仔细观察图中答题卡表格，识别学生涂黑的圆圈，输出每道题的作答选项。

【答题卡格式】
- 表格第一列是行标题，从上到下：题号行、A行、B行、C行、D行
- 第2列起每列是一道题（题号1~${n}，印在第一行）
- 每格有一个圆圈，学生选某题某选项时把对应行、对应列的圆圈用铅笔涂黑
- 例：第3题选B → B行、第3题列的圆圈被涂黑（内部深灰/黑色）

【识别规则】
- 逐列（逐题）扫描：找该列中哪一行圆圈被涂黑（内部有铅笔痕迹，非空心）
- 空心圆圈（仅有边框，内部白色）= 未选
- 若某列无涂黑圆圈 → 输出 null
- 若某列多个圆圈有涂黑痕迹 → 取涂得最深/最满的

试卷编号：${sessionId}，共 ${n} 题（题号1~${n}）。

直接输出裸JSON，不要markdown代码块，不要任何解释：
{${exampleInner}}`;
}

/**
 * 调用指定模型一次，余额不足时抛出 code='GLM_QUOTA_EXCEEDED'
 */
async function callOnce(apiKey, base, model, content, n) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120000);

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        max_tokens: Math.min(1024, 200 + n * 8),
        temperature: 0,
      }),
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      const err = new Error('GLM 接口请求超时，请稍后重试');
      err.code = 'STEPFUN_TIMEOUT';
      throw err;
    }
    throw e;
  }
  clearTimeout(timer);

  const rawText = await res.text();
  let data;
  try { data = JSON.parse(rawText); } catch (_) {
    const err = new Error(`GLM 返回非 JSON（HTTP ${res.status}）`);
    err.code = 'STEPFUN_BAD_RESPONSE';
    throw err;
  }

  if (!res.ok) {
    const errCode = String(data?.error?.code || '');
    const msg = data?.error?.message || data?.error?.msg || data?.message || rawText.slice(0, 200) || `HTTP ${res.status}`;
    // 余额不足：智谱错误码 1113
    if (errCode === '1113' || msg.includes('余额不足') || msg.includes('insufficient')) {
      const err = new Error(msg);
      err.code = 'GLM_QUOTA_EXCEEDED';
      throw err;
    }
    const err = new Error(`GLM 错误：${msg}`);
    err.code = 'STEPFUN_API_ERROR';
    err.status = res.status;
    throw err;
  }

  const msgContent = data.choices?.[0]?.message?.content;
  const contentStr = typeof msgContent === 'string' ? msgContent : JSON.stringify(msgContent || '');
  const parsed = extractJsonObject(contentStr);
  if (!parsed || typeof parsed !== 'object') {
    const err = new Error('模型未返回可解析的 JSON，请重试或改用手动点选答案');
    err.code = 'STEPFUN_PARSE_ERROR';
    err.rawSnippet = contentStr.slice(0, 500);
    throw err;
  }
  return { parsed, model, rawContent: contentStr };
}

/**
 * @param {Array<{ buffer: Buffer, mimeType: string }>} images
 * @param {number} questionCount
 * @param {number|string} sessionId
 */
async function recognizeAnswerSheet(images, questionCount, sessionId) {
  const { apiKey, base, model } = getGlmConfig();

  if (!apiKey) {
    const err = new Error('未配置智谱 GLM API：请在「后台管理 → API 配置」填写密钥，或设置环境变量 GLM_API_KEY');
    err.code = 'STEPFUN_NOT_CONFIGURED';
    throw err;
  }

  const n = Math.max(0, Math.floor(Number(questionCount) || 0));
  if (n === 0) {
    const err = new Error('题目数量为 0，无法识别');
    err.code = 'INVALID_COUNT';
    throw err;
  }

  const content = [{ type: 'text', text: buildPrompt(n, sessionId) }];
  for (const img of images) {
    const mime = (img.mimeType || 'image/jpeg').toLowerCase();
    const safeMime = /^image\/(jpeg|png|gif|webp)$/i.test(mime) ? mime : 'image/jpeg';
    content.push({ type: 'image_url', image_url: { url: `data:${safeMime};base64,${img.buffer.toString('base64')}` } });
  }

  // 先用配置模型（默认 glm-4v-plus），余额不足自动降级到免费版
  try {
    return await callOnce(apiKey, base, model, content, n);
  } catch (e) {
    if (e.code === 'GLM_QUOTA_EXCEEDED' && model !== GLM_FALLBACK_MODEL) {
      console.warn(`[GLM] ${model} 余额不足，自动降级到免费模型 ${GLM_FALLBACK_MODEL}`);
      return await callOnce(apiKey, base, GLM_FALLBACK_MODEL, content, n);
    }
    throw e;
  }
}

function mapParsedToQuestionAnswers(parsed, questionIds) {
  const byNum = {};
  for (const [k, v] of Object.entries(parsed)) {
    const num = parseInt(String(k).replace(/\D/g, '') || k, 10);
    if (!isNaN(num) && num >= 1) byNum[num] = v;
  }

  const out = {};
  let recognized = 0;
  for (let i = 0; i < questionIds.length; i++) {
    const qid = questionIds[i];
    const idx = letterToIndex(byNum[i + 1]);
    if (idx !== undefined) {
      out[qid] = idx;
      recognized++;
    }
  }
  return { answers: out, recognizedCount: recognized };
}

module.exports = {
  recognizeAnswerSheet,
  mapParsedToQuestionAnswers,
  extractJsonObject,
  letterToIndex,
  getGlmConfig,
  isConfigured,
  isStepfunConfigured: isConfigured,
};
