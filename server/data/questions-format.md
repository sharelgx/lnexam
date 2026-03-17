# 三科题目 JSON 格式说明

给 AI 解析/生成题库时请严格按此格式输出，导入脚本会据此写入数据库。

---

## 通用单题结构

每道题为一条对象，字段如下：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `no` | number | 是 | 题号（同科内唯一，用于生成 id，如 math_1） |
| `text` | string | 是 | 题干正文 |
| `options` | string[] | 是 | 选项数组，如 `["A. xxx", "B. xxx", "C. xxx", "D. xxx"]`，顺序固定 |
| `answer` | number | 是 | 正确答案索引：0=A，1=B，2=C，3=D |
| `explanation` | string | 否 | 解析/详解，可空 |
| `category_name` | string | 否 | 知识点名称，须与系统分类**完全一致**（见下），用于关联 category_id |

---

## 科目与知识点名称（须完全一致）

### 数学 (subject: math)

二级知识点（任选其一填在 `category_name`）：
- 集合与常用逻辑用语
- 不等式
- 函数（定义域/单调性/奇偶性）
- 函数最值与零点
- 三角函数
- 数列
- 向量
- 直线与圆
- 圆锥曲线
- 指数与对数
- 概率与统计
- 排列组合

三级知识点（函数子分类，任选其一）：
- 函数定义域求解
- 函数单调性判断
- 函数奇偶性判断

### 语文 (subject: chinese)

二级知识点（任选其一）：
- 字音辨析
- 字形辨析
- 成语与熟语运用
- 文言文基础（实词/虚词/句式/翻译）
- 古诗文默写与诗词鉴赏
- 记叙文与说明文阅读
- 文学常识、文化常识识记
- 病句辨析、句式变换、情境表达

### 职业适应性测试 (subject: vocational)

二级知识点（任选其一）：
- 思想政治素养（政策/制度/党史/法治）
- 职业素养与道德（职业道德/人生态度）
- 国情社情与科技发展（资源/经济/科技/地理）
- 院校特色常识

---

## 文件格式

- **按科目分文件**：`math.json`、`chinese.json`、`vocational.json`。
- 每个文件是一个 **数组**，元素为上述单题对象，例如：

```json
[
  {
    "no": 1,
    "text": "题干内容...",
    "options": ["A. 选项A", "B. 选项B", "C. 选项C", "D. 选项D"],
    "answer": 0,
    "explanation": "解析（可选）",
    "category_name": "集合与常用逻辑用语"
  }
]
```

- 也可使用 **单文件合并格式**（见下方示例），键名为 `math`、`chinese`、`vocational`，值均为题目数组。

---

## 导入方式

把生成好的 JSON 放到 `server/data/` 下（或任意路径），然后执行：

```bash
cd server
node scripts/import-questions-from-json.js
```

默认读取 `server/data/math.json`、`server/data/chinese.json`、`server/data/vocational.json`。  
若使用单文件合并格式，将文件命名为 `questions-all.json` 并放在 `server/data/` 下即可。

导入前请先确保已执行过 `node scripts/init-db.js`（会创建分类），否则知识点关联会为空。
