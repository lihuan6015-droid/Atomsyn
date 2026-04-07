---
name: atomsyn-read
description: 在回答用户问题之前,先到用户本地的 Atomsyn 知识库里查一下相关的过往经验,把命中的经验作为上下文注入到回答里。当用户说"我之前学过类似的吗 / 我的知识库里有没有 / Atomsyn 里有没有 / 从 Atomsyn 里找 / 看看我之前记过什么 / 调用我的经验 / 我以前是怎么做的 / 查一下 atomsyn / Atomsyn 有没有相关的 / check my atomsyn / check Atomsyn / use my past experiences"时触发。此外,在一个新会话开始处理实质性的编码/设计任务时,也应该**静默地主动调用一次**(一个会话一次预算),让用户的过往经验自动成为回答的底子,而不是被忽略。对于闲聊或与用户个人经验无关的通用问题,不要触发。
allowed-tools: Bash
---

# atomsyn-read — 让 AI 在回答之前先读用户自己的经验库

这是 Atomsyn V1.5 "Agent 双向接口"的**读取半边**(见 `docs/framing/v1.5-problem-framing.md` § 北极星 Demo 四幕 · 场景二)。

**核心使命**: 把用户之前通过 `atomsyn-write` 沉淀下来的 `experience` 经验原子捞出来,让任何 AI —— 当前这个会话、新开的会话、甚至完全换一个工具(Cursor / Codex / Trae)—— 都能用**用户自己的积累**回答问题,而不是每次都从零开始。

和 `atomsyn-write` 是一对。两者合起来才是 Atomsyn 的 L2(面向 AI)半边。没有 `atomsyn-read`,所有通过 `atomsyn-write` 沉淀的东西就变成了**只写不读的坟墓** —— 主权飞轮就转不起来。

---

## 核心哲学 (调用之前先读一遍)

用户每次跟 AI 重新解释自己的上下文,都要付**真实的代价** —— 时间、token 预算、认知负担。**atomsyn-read 的职责就是让这部分代价为零** —— 对于那些已经被用户沉淀过的上下文切片。

- **默认主动**: 和 `atomsyn-write` 不一样,`atomsyn-read` 应该在实质性任务开头**静默主动调用一次**。用户不想每次都说"查一下 atomsyn" —— 他希望他的知识库就那样**自然在场**。
- **空结果保持沉默**: 如果查询没捞到任何相关的东西,直接返回空手,**什么都不用说**。不要公告"我查了你的 atomsyn 没找到相关内容" —— 那是噪声,污染对话。
- **引用,不要改写**: 真的捞到原子时,把它作为**用户自己的话**引用回来。标出原子的 `name` 和 `id`,让用户能追溯上下文来源。
- **尊重校准**: `stats.locked: true` 的原子视为权威。`stats.userDemoted: true` 的原子被 `atomsyn-cli read` 自动过滤 —— 不要去覆盖这个行为。
- **不要伪造**: 没匹配到就不要虚构"用户大概会怎么想"。那会让整个机制失去意义。

---

## 什么时候调用

### ✅ 应该调用(显式)
- 用户说: 我之前学过类似的吗 / 我的知识库里有没有 / Atomsyn 里有没有 / 从 Atomsyn 里找 / 看看我之前记过什么 / 调用我的经验 / 我以前是怎么做的 / 查一下 atomsyn / Atomsyn 有没有相关的 / 我之前是不是踩过这个坑
- 用户说英文: check my atomsyn / check Atomsyn / use my past experiences / did I solve this before / what did we decide about
- 用户在任何检索语境里提到"我的 atomsyn / 我们的 atomsyn / 我的 Atomsyn / 我的知识库"

### ✅ 应该调用(静默 / 主动)
- 新会话开始,用户第一条消息是一个实质性任务(不是打招呼、不是琐碎问题)—— 在你第一次非琐碎回复之前,**静默调用一次**
- 用户让你做设计 / 架构 / 方法论决策 —— 他的过往决策很可能相关
- 用户提到某个工具、框架或项目名,很可能已经有沉淀过的经验挂在上面

### ❌ 不应该调用
- 纯闲聊、打招呼、或问你本身能力的元问题
- 有标准答案且跟用户个人无关的问题(比如"什么是哈希表")
- 用户明确说"这次不要参考我之前的"("先不看我之前的,冷答")
- 你在当前会话里已经为相似的查询调过一次了(心里记一下,不要反复打 CLI)

---

## 执行步骤

### Step 1 · 提取查询

从当前对话里,提炼一个**简洁的自然语言查询**(3-15 个词),抓住用户最可能需要匹配的东西。名词短语优于动词,具体词优于抽象词。例子:

| 用户消息 | 好查询 | 坏查询 |
|---|---|---|
| "帮我看看 Tauri 打包签名的坑" | `tauri macos packaging signing` | `help with tauri` |
| "我们之前是不是决定过用 skill 而不是 mcp" | `claude skill vs mcp sovereignty` | `what did we decide` |
| (静默,新会话开始一个 React 任务) | `react component pattern <项目名>` | `react` |

如果对话是中文,查询里可以混英文关键词 —— `atomsyn-cli read` 做子串匹配,两者都能处理。

### Step 2 · 调用 atomsyn-cli read

执行:
```bash
node <repo>/scripts/atomsyn-cli.mjs read --query "<你的查询>" --top 5
```
或者在 `atomsyn-cli` 已经在 `$PATH` 时:
```bash
atomsyn-cli read --query "<你的查询>" --top 5
```

CLI 会:
- 用跟 `atomsyn-write` 同样的规则解析数据目录(env → `~/.atomsyn-config.json` → 平台默认)
- 扫描 `<dataDir>/atoms/experience/**` (V1.5 范围 —— methodology 和 skill-inventory 归 GUI 管,不推给 agent)
- 过滤掉 `stats.userDemoted === true` 的原子
- 按关键词命中 + 时间新旧 + useCount 打分,返回 top-N 作为一整篇 markdown 到 stdout
- 往 `<dataDir>/growth/usage-log.jsonl` 追加一条 `{"action":"read",...}`,这样 GUI 的 Agent 活动 Feed 可以显示这次调用

### Step 3 · 读 markdown 输出

CLI 返回这种格式:

```markdown
# Atlas Read · N result(s) for "<查询>"

## 1. <原子名>  ·  Score: 24  ·  id=atom_exp_...
**Tags**: tag1, tag2 · **Source**: <sourceAgent>

> <sourceContext>

<insight 正文>

**Key steps:**
- ...

*Atom id*: `atom_exp_...`
---
## 2. ...
```

如果输出为空(没命中超过阈值)或者只有表头 —— **空手返回,什么都不要跟用户说**。这是空结果保持沉默的规则。

### Step 4 · 把内容注入你的回答

如果有命中:

1. **先用用户自己的话开头**,不要用你的综述。引用最相关那条原子的 `insight` 或 `keySteps`,并署名: "从你的 atomsyn 里 —— *'<原子名>'* (atom_exp_...)"
2. **先引用,再综合**。引用之后,再用你自己的话把它和当前问题连起来。
3. **露出 id**,让用户可以在 Atomsyn GUI 里打开那张原子去校准 / 锁定 / 降权。**同时**这个 id 可以被 `atomsyn-write` 的更新模式直接消费: 如果用户接下来说"补充到这条"或"把新坑也合进来",agent 应该用 `atomsyn-cli update --id <这个 id> --stdin` 而不是新建。
4. **尊重锁定**: 如果原子 `stats.locked: true`,就把它的内容当权威。即使你有不同意见,也必须明确把分歧讲出来并露出 atom id,**不要默默反驳**。

如果没命中,按你正常的思路回答 —— 不要提 atomsyn-read。

### Step 5 · (静默主动模式)单次调用预算

在主动调用模式(不是用户显式要求)下,遵守这个预算:

- **每会话一次**,在第一个实质性任务上
- **每主题转移一次**,如果用户明显切到新领域
- **不要刷** —— 刚调完 atomsyn-read 拿到 0 结果,不要换个措辞再来一次

用户显式要求("查一下 atomsyn")永远优先,不占预算。

---

## 反模式(绝对不要)

❌ **公告空结果** —— "我查了你的 atomsyn 没找到相关内容"是噪声。空结果就闭嘴。

❌ **把原子内容用自己的话改写但不引用** —— 毁了主权这一点。用户要看到的是**他自己的原话**回来,不是你的二次创作。

❌ **每条消息都调一次** —— atomsyn-read 不是中间件。用判断力: 只有用户的过往上下文真的可能相关时才调。

❌ **覆盖 locked 原子的结论** —— 被锁的原子说 X,你不同意可以,但必须明确说出分歧并露出 atom id,**不要默默反驳**。

❌ **从这个 skill 里写磁盘** —— atomsyn-read 是严格只读的。任何写(新建原子、更新)都走 `atomsyn-write`。

❌ **自己解析 CLI 输出想重构 JSON** —— markdown 就是契约。引用它,不要试图从 markdown 反推 atom JSON。

---

## 错误处理

| 情况 | 怎么办 |
|---|---|
| `atomsyn-cli read` 非零退出 | 记一下 stderr,**不要重试**。按正常思路回答问题,不加 atomsyn 上下文。 |
| 数据目录不存在 | 说明用户从没写过原子。静默 no-op,正常回答。 |
| 查询提取失败(对话太抽象) | 跳过这次调用。不要发空 `--query ""` 过去。 |
| Markdown 输出损坏 / 格式意外 | 退回"没匹配"行为。**不要让问答过程崩**。 |

**核心原则**: atomsyn-read 的失败**绝对不能**让用户体验降到"完全没有 atomsyn-read"之下的水平。帮不上忙的时候,就闭嘴。

---

## V1.5 限制(V1.6+ 会放开)

- **只做关键词打分**: V1.5 的 `atomsyn-cli read` 用简单子串 + 关键词重叠打分。V1.6 会加 embedding 语义检索。
- **只读 experience 原子**: V1.5 故意把 `methodology` 和 `skill-inventory` 排除在 agent 读取范围外(它们归 GUI 管 / L1)。V1.6 可能加 `--include methodology` flag。
- **没有对话感知的查询改写**: agent 从对话里朴素提取查询。V1.6 可能加 LLM 查询改写。
- **没有跨 agent 来源过滤**: `sourceAgent` 会记录但不用于过滤。V1.6 可能允许"只读我从 Cursor 写的经验"。
- **单次调用预算是本地约定**: 由调用方 agent 在会话内自觉执行。CLI 本身不限流。V1.6 可能加冷却期。

---

## 来源

这个 skill 和 `atomsyn-write` (V1.5 T-2.1 / T-2.2) 是一对,共同构成 V1.5 Gap-2(Agent 双向接口)的产品级实现。详见 `docs/plans/v1.5-implementation-plan.md` T-2.3 和 `docs/plans/v1.5-resume-state.md`。它驱动的 CLI 是 `scripts/atomsyn-cli.mjs` —— Atomsyn 整个 L2 叙事的承重组件。
