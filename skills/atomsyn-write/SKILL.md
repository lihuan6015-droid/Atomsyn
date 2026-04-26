---
name: atomsyn-write
description: "沉淀经验到用户的本地Atomsyn知识库(产品方法论+个人经验碎片)。核心判断: 这段对话中是否产生了「如果不记下来,未来的自己或未来的AI就不会知道」的认知? 如果是,在自然停顿时简短问一句'要沉淀到Atomsyn吗?'。不打断正在进行的工作流,不沉淀可搜索的通用知识。用户说 记下来/存到atomsyn/remember/crystallize/别让我忘了/沉淀一下 时立即执行。"
allowed-tools: Bash
---

# atomsyn-write — 让 AI 帮用户把经验沉淀进本地知识库

这是 Atomsyn "Agent 双向接口"的**写入半边**。

## 主动建议哲学

人性是懒惰的 —— 用户不会主动说"帮我存一下"。**你的职责是在恰当的时机主动建议沉淀**,但绝不在用户专注工作时打断。

### 何时主动建议 vs 何时不动

| 场景 | 行为 |
|---|---|
| 一段深度技术讨论/决策/复盘刚结束 | ✅ 简短问一句"这个洞察要沉淀到 Atomsyn 吗?" |
| 用户踩了一个坑并解决了 | ✅ "这个踩坑经验要记下来吗?" |
| 一个开发任务完成,有可复用的模式 | ✅ "要把这个模式沉淀下来吗?" |
| 用户明确说记下来/存到 atomsyn | ✅ 立即执行 |
| 用户正在编程中途 | ❌ 不打断 |
| 闲聊 | ❌ 不触发 |
| 简单问答(标准答案) | ❌ 没有沉淀价值 |
| 对话刚开始,还没产生有价值的内容 | ❌ 不触发 |

**关键**: 主动建议 ≠ 主动执行。除非用户明确说"记下来",否则只是**提议**,由用户决定。系统会自动关联相关方法论,用户完全无需维护。

**核心使命**: 当用户说"帮我记下来"的时候,你要把**当前对话里最近那一段有价值的学习**,结构化成一张符合 schema 的 `experience` 原子卡片,写进用户电脑上的 Atomsyn 数据目录。这样未来任何 AI (同一个会话 / 新开会话 / 甚至换一个工具比如 Cursor) 都可以通过 `atomsyn-read` 把它作为上下文调用回来。

---

## 核心哲学 (调用之前先读一遍)

用户**不是让你总结整段对话**。用户是让你**保存某一个特定的学习点** —— 那种他六个月后、或者在另一个项目里、又或者另一个 AI 在帮他的时候,能派上用场的东西。

- **只挑真正有用的信号**: 只沉淀用户明确表达过兴趣、好奇、或者"这个我要记住"的内容。不要把每一段话都变成原子。
- **自包含**: 你写的这张卡片,必须让一个**完全没有上下文**的未来 agent 也能读懂并用起来。细节要够,能让人冷启动就上手。
- **诚实**: 如果某个细节对话里其实没讲清楚,就标 `<待补充>`,**不要瞎编**。编造会污染用户的知识库,最终摧毁用户对整个系统的信任。
- **尊重用户主权**: 你写的是用户自己电脑上的文件。这个文件他可以随时打开、编辑、删除。写的东西要经得起他亲眼看。

---

## 什么时候调用

### ✅ 应该调用
- 用户明确说: 帮我记下来 / 这个要记住 / 存到我的 atomsyn / 存到 Atomsyn / 加到我的知识库 / 加到 Atomsyn / 以后还会用到 / 把这个经验保存一下 / Atomsyn 记一下 / 别让我忘了 / 这个我要收藏
- 用户说英文: save to my atomsyn / save to Atomsyn / remember this for me / crystallize this / sink this in
- 用户引用"atomsyn"或"Atomsyn"或"我的知识库"并且明确要保存某个东西

### ❌ 不应该调用
- 用户只是让你总结("我们刚才都聊了什么")
- 用户是让你在当前代码库写文档(直接用 Write 写到他指定的文件)
- 用户只是让你在**当前会话里**记住(那是会话内的工作记忆,不是持久化原子)
- 内容很琐碎(一句话的小 tip、常识)
- 对话里其实没覆盖的内容你要大量编造才能凑出一张卡片

---

## 两种模式决策 (最重要 · 读完再行动)

**在调用任何命令之前,先判断是新建还是更新**:

| 场景 | 模式 | 命令 |
|---|---|---|
| 用户描述的是**全新的学习点**,之前没记过 | 🆕 新建 | `atomsyn-cli write --stdin` |
| 用户说"更新/补充/修正/合并到"**已有**的 atom | 🔄 更新 | 先 `atomsyn-cli find` 或 `atomsyn-cli get` 拿 id,再 `atomsyn-cli update --id <id> --stdin` |
| 不确定是否存在相似经验 | 先查 | `atomsyn-cli find --query "关键词"` 看 top 结果,再决定 |

**更新模式的关键**: 绝对不要用 write 再手动删旧文件。`atomsyn-cli update` 会:
- 按 id 定位文件(无论当前在哪个 slug 文件夹)
- merge 调用方传入的字段到已有 atom(id / createdAt / locked / userDemoted 保持,其他字段 caller 提供就覆盖)
- 如果新 name 产生新 slug → 原子迁移: 写入新 slug 目录 → 删除旧文件 → 如果旧目录空了就 rmdir
- 一次调用,**冷启动新会话**也能安全执行,不需要任何前置清理

## 执行步骤 (CLI-first · V1.5 正式契约)

**核心原则**: 你(agent)**不直接写磁盘,不自己构造 id/kind/schemaVersion/timestamps**。你只做一件事: 从对话里**提炼用户视角的内容字段**,把 JSON 通过 stdin 送给 CLI。所有 schema 合规性、路径解析、索引重建、锁冲突检测、usage 日志,**全部由 CLI 承担**。这样不管 schema 以后怎么演进、不管数据目录在哪,你的写入都稳定。

### Step 1 · 提炼用户视角的字段

从当前对话里,抽取**最小自包含的那一段**,组装成下面这份**精简 JSON**(这是 CLI 的正式输入契约)。

#### ⚠️ 硬性约束速查 (构造 JSON 前必读)

| 字段 | 必填 | 约束 |
|---|---|---|
| `name` | **必填** | ≤120 字符。**不要用 `title`**, CLI 只认 `name` |
| `sourceContext` | **必填** | ≤300 字符 |
| `insight` | **必填** | 50-4000 字符 |
| `tags` | **必填** | **1-8 个**字符串数组,多了会被拒绝 |
| `role` | **必填** | 先查 taxonomy 复用已有值 |
| `situation` | **必填** | 先查 taxonomy 复用已有值 |
| `activity` | **必填** | 先查 taxonomy 复用已有值 |
| `insight_type` | **必填** | 只能从 8 个枚举值中选 |
| `confidence` | **仅 ingest** | write 模式不要传此字段 |
| `title` | **不存在** | CLI 不认此字段,用 `name` |
| 传输方式 | — | **用临时文件 `--input`**,不要 echo pipe |

```json
{
  "name": "人类可读的中文/英文标题 (必填, ≤120 字符)",
  "sourceContext": "1-2 句情境描述 (必填, ≤300 字符)",
  "insight": "核心学习, 要有推理过程不只是结论 (必填, 50-4000 字符)。你可以使用完整的 Markdown 语法排版，如果有配图请直接使用相对路径图片语法插入（例如：`![错误表现](error.png)`），图片后续步骤中会要求你移入。",
  "tags": ["1-8 个字符串标签"],
  "keySteps": ["可选 · 下次会怎么做的 3-6 条要点"],
  "role": "必填 · 角色维度 (产品 | 工程 | 设计 | 学习 | 研究 | ...)",
  "situation": "必填 · 情境维度 (踩坑当下 | 代码审查 | 对话AI | 复盘 | ...)",
  "activity": "必填 · 活动维度 (调试 | 分析 | 验证 | 试错 | ...)",
  "insight_type": "必填 · 洞察类型 (反直觉 | 方法验证 | 方法证伪 | 情绪复盘 | 关系观察 | 时机判断 | 原则提炼 | 纯好奇)",
  "sourceAgent": "可选 · 默认 claude-code",
  "codeArtifacts": [
    {
      "language": "ts",
      "code": "只放对话里真实出现的代码, 不要伪造",
      "filename": "可选",
      "description": "可选"
    }
  ],
  "screenshots": [
    "可选 · 在本字段仅填入关联的图片纯文件名，例如：[\"image.png\"]。不要包含任何路径。在拿到 CLI 的回调路径后，你再去执行对应的图片拷贝操作。"
  ],
  "relatedFrameworks": ["可选 · 相关方法论骨架 id"],
  "relatedAtoms": ["可选 · 用户之前沉淀的其他 atom id"],
  "sessionId": "可选 · 当前 AI 会话的 id"
}
```

**你不需要生成**: `id` / `schemaVersion` / `kind` / `subKind` / `createdAt` / `updatedAt` / `stats` —— CLI 会自动填。

**四维分类字段 (role / situation / activity / insight_type) 是必填的**, CLI 会校验。如果缺少会阻止写入并给出明确提示。你需要根据对话内容推断这四个字段:

- **role**: 用户在对话中扮演的角色 → 参考: 产品, 工程, 设计, 学习, 研究, 咨询, 决策, 创作, 协作, 教学, 辅导, 自我管理, 运营, 销售, 项目管理
- **situation**: 经验发生时的情境 → 参考: 会议, 访谈, 独立思考, 阅读, 对话AI, 复盘, 踩坑当下, 灵感闪现, 冲突, 决策关口, 紧急修复, 新功能开发, 架构重构, 代码审查, 方案评审
- **activity**: 用户正在做的事 → 参考: 分析, 判断, 说服, 倾听, 试错, 验证, 综合, 表达, 拒绝, 妥协, 观察, 提问, 记录, 教授, 调试
- **insight_type**: 洞察的性质 → 只能从以下选值: 反直觉, 方法验证, 方法证伪, 情绪复盘, 关系观察, 时机判断, 原则提炼, 纯好奇

**重要**: 上述候选值仅供参考, **必须先通过 Step 1.5 查询已有分类,优先复用已有维度值,避免维度膨胀**。比如系统里已有 `role: "工程"`, 就不要新造 `role: "软件工程"`。

**诚实约束**: 任何你没在对话里真实看到的字段,**不要编**。`insight` 字数不够就诚实承认"对话没覆盖到这么深",让用户决定是补充细节还是放弃沉淀。

### Step 1.5 · 查重 + 获取已有分类维度 (write / update 模式都必须执行)

在调用 write 或 update 之前,**先查一下已有经验和分类维度**:

```bash
atomsyn-cli find --query "<2-4 个关键词>" --with-taxonomy
```

返回 JSON 中包含:
- `results` 数组: 已有的相关经验, 每条包含 `{id, name, tags, role, situation, activity, insight_type, score}`
- `taxonomy` 对象: 系统中所有已有的维度值 `{roles, situations, activities, insight_types}`

**利用 taxonomy 信息**:
1. 如果 taxonomy 中有和你打算用的值相近的已有值, **使用已有值** (例如系统里有 "工程" 就不要写 "软件工程")
2. 如果发现相似经验 (score > 0), 考虑是否应该用 update 而非 write
3. 只有 taxonomy 中确实没有合适值时, 才引入新的维度值

### Step 2 · 如果是"更新模式",先查已有 atom

如果你在 Step 0 判断这是一次更新(用户提到"之前那条 / 合并进去 / 补充到"等),Step 1.5 已经执行了 find,直接用那里返回的结果。如果还没执行:

```bash
atomsyn-cli find --query "<2-4 个关键词>" --with-taxonomy
```

返回 stdout 是一份 JSON,`results` 数组里每条是 `{id, name, tags, role, situation, activity, insight_type, path, score}`,按命中分数降序。挑最相关那条的 `id`,如果不确定就把 top 3 快速报给用户让他选。

**如果找不到相似的**:告诉用户"atomsyn 里没有匹配的经验,我会新建一条",然后切到新建模式。

### Step 3 · 调用 atomsyn-cli (write 或 update)

**重要: 使用临时文件传 JSON,不要用 echo pipe。** JSON 内容经常包含换行符、引号等特殊字符,echo pipe 会导致 shell 转义错误。

**新建**:
```bash
# 1. 先把 JSON 写到临时文件 (用 Write tool,不要用 echo)
# Write to /tmp/atomsyn_write.json
# 2. 再用 --input 参数传给 CLI
atomsyn-cli write --input /tmp/atomsyn_write.json
```

**更新已有** (Step 2 拿到 id 之后):
```bash
# 同样先写临时文件,再传给 CLI
atomsyn-cli update --id <atomId> --input /tmp/atomsyn_write.json
```

`update` 是 **merge 语义**: 你只需要传要变/要补的字段(name / insight / keySteps / tags / codeArtifacts 等),CLI 会把它们合进已有原子,保留 id / createdAt / 用户的 locked/userDemoted 状态,自动更新 updatedAt,并在必要时原子迁移 slug 文件夹。如果只是补一条 keySteps 项,**也要把完整的新 keySteps 数组传过去**(覆盖不是 append,这样语义清晰)。

**降级路径** (在 Atomsyn 项目仓库内,`atomsyn-cli` 还没装到 PATH):
```bash
atomsyn-cli write --input /tmp/atomsyn_write.json
# 或
node /path/to/atomsyn/scripts/atomsyn-cli.mjs write --input /tmp/atomsyn_write.json
# 或
echo '<JSON>' | node /path/to/atomsyn/scripts/atomsyn-cli.mjs update --id <id> --stdin
```

判断方法: 先 `command -v atomsyn-cli`,有就用;没有就找项目内 `scripts/atomsyn-cli.mjs`。两条路都不通的话告诉用户"请先运行 `atomsyn-cli install-skill` 安装 CLI shim"。

**不要用 Read/Write 自己写 JSON 文件,也不要手动 rm 旧文件** —— 都会绕过 schema 校验和索引重建,污染用户知识库。更新流程**只**走 `atomsyn-cli update`,它会原子处理迁移和清理。

### Step 3 · 读 CLI 的成功回执

CLI 成功时会在 stdout 返回一份 JSON:
```json
{
  "ok": true,
  "atomId": "atom_exp_<slug>_<unix>",
  "name": "...",
  "path": "/绝对路径/到/写入的/文件.json",
  "dataDir": "...",
  "dataSource": "env" | "config" | "default",
  "hint": "Next time you search for tags [...] ..."
}
```

失败时 CLI 非零退出 + stderr 打印错误(例如 `insight must be 50-4000 characters` 或 `Atom is locked`)。你**读这份 stderr 告诉用户发生了什么**,不要 retry 同样的 payload —— 要么修正输入(比如 insight 太短补充内容)要么放弃。

### Step 3.4 · 处理 collision_candidates (V2.x cognitive-evolution)

CLI write/update 默认开启 collision check。如果新 atom 与库内已有 atom 强相似 (`tags` 70%+ 重叠 + insight 关键词 50%+ 或反义短语命中), stdout 会含 `collision_candidates` 字段, stderr 会有黄色 ⚠️ 提示:

```json
{
  "ok": true,
  "atomId": "atom_exp_xxx_<unix>",
  "...": "...",
  "collision_candidates": [
    { "id": "atom_exp_old_id", "name": "旧 atom 名", "score": 0.78, "reason": "tags 70% 重叠 + 含反义短语 '推翻'" }
  ],
  "hint": "本次写入已完成。如需取代旧 atom, 用 atomsyn-cli supersede --id <old> --input <这个文件>"
}
```

**写入已经成功** (exit 0), `collision_candidates` 仅是**警告**。下面三选一让用户裁决:

1. **不要重新调用 write/update** — 写入已完成
2. 用 AskUserQuestion 三选一展示给用户:
   - 选项 A · "保留新建, 旧的也留着" → 默认, 无后续操作
   - 选项 B · "用新的取代旧的" → 调 `atomsyn-cli supersede --id <旧 id> --input <刚才的临时 JSON 文件>` (但这会创建第二条新 atom! 推荐改走流程 C)
   - 选项 C · "并存 (fork)" → V2.x 不实现, 告诉用户"fork 暂未支持, 保持新建"
3. **流程 D · 干净 supersede (推荐)**:
   - 如果用户在 write 之前**已经怀疑会冲突**, 应该先 `atomsyn-cli find --query` 找到旧 id, 再**直接调** `atomsyn-cli supersede --id <旧 id> --input <新 atom JSON 文件>` —— **不调 write**, 避免双写
   - supersede 内部走"创建新 atom + 旧 atom archived + supersededBy 链接"的原子操作, 自动 rebuildIndex

**关键约束**:
- collision_candidates 是启发式信号, 不是真冲突 —— 让用户决定
- 用户说"算了不取代了" → 不再操作, 已写入的新 atom 保留
- 用户说"取代它" → 走流程 D (推荐) 或 supersede + archive 已写入的新 atom (避免多余的双 atom)
- **不要默默 supersede**: D-005 决策严禁 LLM 自动 mutate 知识库, 必须用户裁决

### Step 3.5 · 迁移配图 (如果有)

如果你在 Step 1 的 `screenshots` 或 `insight` 里引用了配图文件（纯文件名）：
由于你现在通过 Step 3 里的回调 `path` 字段知道了 JSON 文件的真实绝对路径（例如 `/Users/xxx/atomsyn/atoms/experience/slug/atom_exp_123.json`），你**必须**提取出它所在的父目录，并执行 Bash 的 `cp` 操作，将源图片文件复制到该目录下：
```bash
cp /原始系统路径/error.png /Users/xxx/atomsyn/atoms/experience/slug/
```
**这一步非常关键**，只有图片被真正物理移入与 JSON 相同的目录下，前端渲染引擎才能根据相对路径原生且安全地解析出图片。

### Step 4 · 给用户确认回执

返回一段简短说明,必须包含:

1. **沉淀了什么** —— 引用 `name`
2. **存到哪里** —— 写入文件的绝对路径
3. **以后怎么调出来** —— 一句话提示: "下次你(或者任何 AI)搜索 `[标签1, 标签2]` 或者问到 `<主题>` 的时候,atomsyn-read 会把这张卡片捞出来"
4. **用户现在可以做什么** —— "在 Atomsyn 桌面应用里随时可以审阅 / 编辑 / 锁定这张卡片"

示例:
> ✅ 已沉淀 **"Tauri macOS 公证流程的一个坑"** → `~/Library/Application Support/atomsyn/atoms/experience/tauri-macos/atom_exp_tauri-notarization-gotcha_1728443200.json`。标签 `tauri`, `macos`, `packaging`。下次任何 AI 聊到 Tauri 打包或 Mac 签名时,atomsyn-read 会把它自动推上来。随时可以在 Atomsyn 桌面应用里查看。

---

## V2.0 新增 · Fragment 碎片沉淀 (atomsyn-cli ingest)

V2.0 新增了 `ingest` 子命令,用于沉淀更轻量的碎片知识(fragment)。Fragment 有四维分类结构,适合快速记录零散的洞察、踩坑、灵感。

### 什么时候用 ingest (vs 旧的 write)

| 场景 | 用哪个 |
|---|---|
| 用户分享了一个简短的顿悟/踩坑/灵感 | `ingest` (fragment) |
| 用户想记录一段完整的经验(有 insight、keySteps、代码) | `write` (crystallized experience) |
| 不确定 | 如果内容 < 3 句话用 `ingest`,否则用 `write` |

### Fragment JSON 结构 (你需要生成这个)

```json
{
  "title": "简短标题 (max 80 chars)",
  "summary": "1-3 句话总结核心洞察 (10-500 chars)",
  "role": "产品 | 工程 | 设计 | 学习 | ...",
  "situation": "代码审查 | 对话AI | 踩坑当下 | ...",
  "activity": "调试 | 分析 | 验证 | ...",
  "insight_type": "反直觉 | 方法验证 | 方法证伪 | 情绪复盘 | 关系观察 | 时机判断 | 原则提炼 | 纯好奇",
  "tags": ["关键词1", "关键词2"],
  "rawContent": "用户原始说的话,完整保留",
  "confidence": 0.85
}
```

### 关键约束: 先查重再写入

**在调用 ingest 之前,必须先 find**:

```bash
atomsyn-cli find --query "<标题关键词>"
```

find 返回的结果现在包含四维字段 (`role`, `situation`, `activity`, `insight_type`),让你看到已有知识的分类。

**如果无命中**: find 会返回 `taxonomy` 字段,列出系统中所有已有的维度值。**优先使用已有维度值,避免发明新词造成维度膨胀**。比如系统里已有 `role: "工程"`,就不要新造 `role: "软件工程"`。

```bash
# 查重 + 获取已有维度
atomsyn-cli find --query "Tauri 打包"

# 确认无重复后写入
echo '<你生成的 fragment JSON>' | atomsyn-cli ingest --stdin
```

### ingest 的 dry-run 模式

```bash
echo '<JSON>' | atomsyn-cli ingest --stdin --dry-run
```

dry-run 不写入磁盘,只返回最终的 atom JSON,方便你确认结构正确。

---

## 反模式(绝对不要这么做)

❌ **每次聊天结束都来一张** —— 这不是自动总结器。只有用户开口要,你才动手。

❌ **编造 keySteps 或 codeArtifacts** —— 对话没提到的字段就留空,不要为了凑数字瞎编。

❌ **想更新却用 write + 手动 rm 旧文件** —— 这是 V1.5 早期犯过的错。冷启动新会话根本不知道要 rm 哪个文件,只能用 `atomsyn-cli update --id <id>` 让 CLI 原子处理迁移和清理。

❌ **自己用 Write/Bash 手写 JSON 文件到磁盘** —— 绕过 CLI 就绕过了 schema 校验和索引重建。V1.5 的正式契约是 **CLI-first**,所有写入必须过 `atomsyn-cli write --stdin` 或 `atomsyn-cli update --id <id> --stdin`。

❌ **在项目源码 checkout 里(git-tracked 的 `data/`)写入而不问用户** —— 如果当前 CWD 看起来像一份 Atomsyn 源码 checkout,且没设置 `ATOMSYN_DEV_DATA_DIR` 环境变量,先问用户是写进项目内 `data/`(dogfooding 模式,需要 env var)还是写到全局数据目录(默认行为)。

❌ **忽略 CLI 返回的非零退出码** —— 如果 CLI 报错(比如 `Atom is locked` 或 `insight 太短`),把 stderr 原文告诉用户,让他决定怎么办。不要强行 retry。

---

## 错误处理

| 情况 | 怎么办 |
|---|---|
| 数据目录无法创建(权限问题) | 放弃。告诉用户准确的失败路径,建议他检查权限或在 `~/.atomsyn-config.json` 里设置 `dataDir` |
| Schema 校验失败(缺必填字段) | 放弃。列出缺的字段。**不要写入半成品文件**。 |
| 检测到冲突原子 | 问用户: 新建 / 更新 / 放弃 |
| Usage log 追加失败 | 非致命。原子照写,在返回消息里提一句 log 失败即可 |

---

## V1.5 限制(V1.6+ 会放开)

- **跨 agent 分发**: 这个 skill 是给 Claude Code 写的。Cursor/Codex/Trae 用户目前需要手动安装(`atomsyn-cli install-skill --target cursor`)。V1.5 只打通 Claude + Cursor,Codex/Trae 延后。
- **无 LLM 辅助打标签**: 标签由你(运行 skill 的 agent)在写入时从对话派生。V1.6 可能加一遍 LLM 事后打标签的 pass。
- **无自动相似度检测**: Step 4 的重复检测是 string/id 匹配级别。V1.6 可能加 embedding 语义相似。
- **增量追加旧原子很简陋**: Step 4 的 (b) 选项能用但粗糙。V1.6 会有专门的 `atomsyn-cli append` 命令。

---

## 来源

这个 skill 是 `atomsyn-write-spike` 的生产版(见 `docs/plans/v1.5-spike-t0.1-result.md`),在 spike 基础上加了数据路径解析、重复/锁定检查、usage 日志、错误处理。它是 Atomsyn V1.5 Gap-2(Agent 双向接口)的承重组件。
