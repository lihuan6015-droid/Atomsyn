---
name: atomsyn-bootstrap
description: "把用户硬盘上散落的笔记 / 文档 / PDF / 聊天导出引导式地导入 Atomsyn 知识库, 双层产出 = N 条经验 atom + 1 条用户元认知画像 (profile, 证据驱动可跳过)。你 (外部 Agent) 用自己的能力 read 任何格式 (.md/.txt/.pdf/.docx/.xlsx/.pptx/.html/源代码/等), 用自己的 LLM 推理生成 atom JSON + profile JSON, 通过 atomsyn-cli write --stdin / write-profile --stdin 入库; cli 不调 LLM, 只做 triage + write + write-profile + reindex 这些工具操作。两步协议: 你先 markdown 报告候选 (含字段级 diff 校准如果是 rerun) 让用户审阅, 用户同意后才 cli 真写入。用户说 '初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把 ~/Documents 沉淀进来 / 把硬盘里的笔记倒进 atomsyn / cold-start atomsyn / import my notes' 时触发。"
allowed-tools: Bash, Read
---

# atomsyn-bootstrap — 引导式批量冷启动 (你 = 外部 Agent)

这是 Atomsyn V2.x "Agent 双向接口"的**冷启动入口**. 你 (Claude Code / Cursor / Codex 等成熟 Agent) 是**真正的执行者**, atomsyn-cli 仅在你需要扫盘列表 + 写库 + 重建索引时被调用. **cli 不调 LLM, 不复刻你的能力** —— 你已经能 read 文件 + reason, 不需要 cli 在内部再来一遍.

---

## 北极星 + 你的角色

> "**让你积累的认知, 在需要时醒来。**" 的**第一次唤醒**.

bootstrap 是仓库层 (Vault) 的冷启动入口. 没有它, 新用户面对空知识库, atomsyn-read 永远沉默, atomsyn-mentor 永远说"数据不足".

**你的角色**: 用户硬盘上有 N 个文件 (笔记 / PDF / 聊天导出 / 源代码 / 复盘文档 / 等), 你 (Agent) 用自己的全部能力 (Read 任何格式 + Bash 调标准工具如 pandoc/pdftotext) 把它们读懂, 用自己的 LLM 推理把每条值得保留的洞察抽成符合 schema 的 atom JSON, 通过 `atomsyn-cli write --stdin` 入库.

---

## atomsyn-cli 在本流程中的角色 = 工具

**你应该调用** ✅:
- `atomsyn-cli where` — 拿数据目录路径, 决定写入位置 + 检查现有 profile (rerun 判断)
- `atomsyn-cli bootstrap --path <X> --phase triage` — 扫盘列文件清单 (cli 仅列 metadata, 不读内容, 不调 LLM, 不需要 ATOMSYN_LLM_API_KEY)
- `atomsyn-cli write --stdin <atom JSON>` 或 `--input <file>` — 入库一条 experience atom (走 schema 校验 + collision 检测)
- `atomsyn-cli write-profile --stdin` 或 `--input <file>` — 入库 profile atom (D-011, 单例 + 自动 rerun 协议 + verified 重置)
- `atomsyn-cli find --query "..."` — 查重 (Step 3 前可选)
- `atomsyn-cli reindex` — 重建索引

**不要调用** ❌:
- `atomsyn-cli bootstrap --phase sampling` — 那是 GUI Wizard 用的, cli 内部要调 LLM, 你不需要
- `atomsyn-cli bootstrap --phase deep-dive` — 同上
- `atomsyn-cli bootstrap --commit` — 同上
- `atomsyn-cli bootstrap --mode agentic / --mode funnel` — 同上, 这是 cli 内置的 LLM 路径

如果用户问"为什么不直接调 sampling/deep-dive 让 cli 帮忙跑?", 回答:
> "你 (Agent) 已经有完整的 LLM 能力, 让 cli 再调一次 LLM 是浪费资源 + 凭证错位 (atomsyn-cli 的 LLM 是 GUI Wizard 用的, 跟你这里的 LLM 是两套). cli 在你这里仅做工具操作 — 列文件 / 写库 / 重建索引, 真正的思考归你做."

---

## 触发条件

### ✅ 显式触发

- 用户中文说: 初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把硬盘里的笔记沉淀一下 / 一口气倒进去 / 批量导入 atomsyn / 把 ~/Documents 沉淀进来
- 用户英文说: bootstrap atomsyn / initialize atomsyn / import my notes / batch import / cold-start atomsyn / first time using atomsyn / dump ~/Documents into atomsyn / onboard atomsyn

### ✅ 静默 / 主动触发 (谨慎)

- 跑 `atomsyn-cli where` 看 dataDir, `find <dataDir>/atoms -name 'atom_exp_*.json' | wc -l` 速查
- 如果 atom 总数 < 5 **并且**用户正在做实质性 AI 任务: **不自动触发**, 只**简短问一句**:
  > "你的 atomsyn 看起来很空 (只有 N 条 atom), 要不要先 bootstrap 一下, 把硬盘里已有的笔记一次性倒进来?"
- 用户说"不用" → 立即闭嘴, 当前会话不再追问
- 用户说"好" → 进入下面工作流

### ❌ 不触发

- 用户在做日常 write / read / mentor 操作时 — bootstrap 不抢戏
- 用户库里已经有 ≥ 50 条 atom 时, 不再静默建议
- 闲聊 / 元问题 / 简单问答

---

## 工作流 (Agent-driven, 7 步: 0/1/2/2.5/3/4/4.5/5)

### Step 0 · 启动前确认

1. 跑 `atomsyn-cli where` 拿到 dataDir, 让用户看一眼: "写入位置: `<dataDir>`"
2. 用 AskUserQuestion 确认范围:
   - 选项 A · "扫描 ~/Documents (常见 + 推荐起步)"
   - 选项 B · "我自己选目录 (一个或多个绝对路径)"
   - 选项 C · "放弃" → 退出, 不创建任何状态

### Step 1 · TRIAGE (扫盘列清单, cli 不调 LLM)

```bash
atomsyn-cli bootstrap --path <用户选的目录> --phase triage
# 多个目录: 重复 --path 即可
# 用户给了具体提示再加: --include-pattern "*.md,*.txt" / --exclude-pattern "node_modules/**"
```

cli 输出 markdown 表格 (文件类型 / 总数 / 大小 / 最近修改时间 + sensitive_skipped 列表). cli 内部**只读 metadata, 不读文件内容**, 不调 LLM.

如果用户根目录下有 `.atomsynignore`, 用 Read 读一眼让用户感知 ignore rules (cli 已自动应用, 不需要你重复过滤).

**关卡**: 用 AskUserQuestion:
- 选项 A · "范围对, 继续读文件" → 进入 Step 2
- 选项 B · "我要改 include/exclude" → 让用户给 pattern, 重跑 triage
- 选项 C · "看一下 sensitive_skipped 的具体文件" → 把 cli 的 stderr 列表给用户
- 选项 D · "放弃" → exit

### Step 2 · 你 (Agent) 自己读所有想读的文件

**关键**: cli 不会帮你读. 你用自己的工具读, 不要因为格式陌生就跳过.

| 格式 | 怎么读 |
|---|---|
| `.md` / `.txt` / `.json` / `.yaml` | Read 直接读 |
| `.pdf` | Read 直接读 (Claude Code Read 工具支持 PDF; Cursor / Codex 类似), 或 Bash `pdftotext <file> -` |
| `.docx` | Bash `pandoc -t plain <file>` 或 Read 直接读 (部分 Agent 原生支持) |
| `.xlsx` | Bash `xlsx2csv <file>` 或 `ssconvert <file> /dev/stdout` |
| `.pptx` | Bash `pandoc -f pptx -t plain <file>` |
| `.html` / `.epub` | Read 直接读 / Bash `pandoc -t plain` |
| 源代码 (`.py` / `.js` / `.ts` / 等) | Read 直接读, 关注 docstring / 顶部注释 / README |
| 历史 AI 聊天导出 (`.json` / `.md` / `.txt`) | Read 直接读 |
| `.xmind` / `.mmap` 等专有格式 | 尝试 unzip + 读 xml; 不行就跳, 在总结里告知用户 |
| 图片 / 音视频 | 跳过 (你不能直接处理), 在总结里列出 |
| 其他陌生格式 | 用你的判断: 能读就读, 不能读就跳, 跳之前在用户提示里告知 |

**目标**: 提取每个文件里**值得作为 atom 保留的核心洞察**. 不是逐字翻译, 是抽 1-3 个最有价值的 insight per file (有的文件可能 0 条, e.g. 只是 todo list).

**预算建议**: 单次会话处理 ≤ 50 个文件比较舒服; 超过 50 个先选最近 30 天修改的 + README/复盘类, 让用户决定是否分批跑.

### Step 2.5 · 你 (Agent) 抽象 profile 候选 (证据驱动, 可整段跳过)

**前提**: bootstrap 双层产出 = N 条 experience atom + **1 条 profile atom** (用户元认知画像). profile 让未来 Agent (你 / 新会话 / 其他工具) 通过 atomsyn-read 在新会话开始时更懂用户. 这是 bootstrap 的核心承诺, 不是可选附加项, 但**证据不足时必须跳过**.

**铁律 (D-011 of chat-as-portal)**:

- **证据驱动**: profile 每个字段必须有具体 atom 证据 (来自 Step 2 已读文件 + Step 3 候选 atom). 没证据的字段**直接跳过** (不要给中性默认值或 placeholder)
- **不强制**: 如果文档里完全没有 profile 相关信息 (e.g. 用户给的全是他人会议纪要, 没有自己的痕迹), **完全跳过 profile 写入** (B-I5). Step 3 报告里告诉用户"未抽象出可信画像"即可
- **不无中生有**: 永远不要为了"凑齐 schema" 填 placeholder. 比如**禁止**给 preferences 5 维全默认 0.5

**字段抽取规则** (按证据来源):

| 字段 | 证据来源 | 何时跳过 |
|---|---|---|
| `identity.role` (string) | 文档中明确自述 (e.g. "我是产品经理 / 工程师 / 学生 / 创业者") | 没明确自述时跳过 |
| `identity.working_style` (string) | 多个文档体现的工作模式 (e.g. "小步迭代 + 重视架构") | 单一文档不足以推断时跳过 |
| `identity.primary_languages` (string[]) | 源代码 / 文档明确提及的技术栈 | 没技术内容时跳过 |
| `identity.primary_tools` (string[]) | 文档明确提及的工具 (Cursor / Linear / Figma 等) | 没明确提及时跳过 |
| `preferences` (5 维 0-1 数值, plan-tune 兼容) | 复盘文档反映的范围/风险/详尽/自主/架构偏好 | **整段 preferences OMIT** 如果证据不足. **禁止** 部分填或给 0.5 默认 |
| `knowledge_domains` (string[]) | 已读文档主题归纳 (e.g. ["产品创新", "AI 应用"]) | 完全没读到主题时跳过 (罕见) |
| `recurring_patterns` (string[], 每条 ≤ 200 字) | 反复出现的工作模式 / 思维偏好 / 痛点 | 文档量太少 (≤ 3 个) 时跳过 |
| `evidence_atom_ids` | Step 4 cli write 后回写的 atom_id 列表 | 不在 Step 2.5 填, Step 4.5 前最后填 |

**preferences 5 维特别说明** (plan-tune 兼容 ~/.gstack/developer-profile.json):

| 维度 | 0 ↔ 1 | 例: 证据片段 |
|---|---|---|
| `scope_appetite` | 小步 ↔ 完整 | "先做最简版本验证" → 偏低 0.3-0.4 |
| `risk_tolerance` | 谨慎 ↔ 激进 | "事前验尸先谋败再谋成" → 偏低 0.4 |
| `detail_preference` | 简洁 ↔ 详尽 | 文档平均长度 + 注释密度 |
| `autonomy` | 咨询 ↔ 委托 | 决策时是否常征求团队意见 |
| `architecture_care` | 速度 ↔ 设计 | 提架构 / 设计的频率与深度 |

**preferences 整段跳过的判断**: 如果 5 维里能给出有证据值的 ≤ 2 个, 整段 OMIT (不要 partial). 这是为了避免"半吊子画像" 误导未来的 Agent.

**重跑场景** (Step 2.5 起手就检测): `atomsyn-cli where` 输出 `skills` 段里如果 `dataDir/atoms/profile/main/atom_profile_main.json` 已存在 (用 `find` 速查或 `Read` 直接读), 这是 rerun. Step 3 markdown 报告必须含**新旧字段级 diff**, 见 Step 3 详细说明.

**输出**: Step 2.5 内部不调 cli, 不输出磁盘. 输出形式 = 在 Step 3 markdown 报告中追加 "Profile 候选" 段.

### Step 3 · 生成 markdown 候选报告 (你输出, 不调 cli)

**核心**: 你不直接调 cli write. 你**先生成 markdown 报告**, 列出准备入库的所有候选 atom, 让用户审阅 + 删 + 改 + 加, 然后再调 cli write.

**报告格式 (含 experience 候选 + profile 候选, profile 可能跳过)**:

```markdown
# Bootstrap 候选报告

数据来源: <用户选的目录>
共扫描 N 个文件 (X 个跳过 — 见末尾"跳过列表"), 提取 M 个 experience 候选 + 1 条 profile 候选 (或跳过 profile)

---

## Experience 候选 (M 条)

### 候选 1 / M: <name>
- **来源文件**: <文件相对路径>
- **insight (50-4000 字符)**: <核心洞察, 完整段落, 不抽象总结>
- **tags** (1-8 个): [tag1, tag2, ...]
- **role / situation / activity / insight_type**: 产品 / 复盘 / 分析 / 原则提炼
- **原文片段** (≤ 200 字, 引用自原文): <原文片段>

### 候选 2 / M: ...

---

## Profile 候选 (initial 场景 — dataDir 无现有 profile)

> ⚠️ 已基于 Step 2 已读文件抽象. 你审阅后我会调 cli write-profile 入库.
> 默认 verified=false (D-007 of bootstrap-skill: v1 仅观察). 入库后请去 ProfilePage 切 verified=true 才被未来 v2 的 atomsyn-read 自动注入.

### identity (含 N 个证据字段)
- **role**: 产品经理 / 创新教练 (证据: <文件 X 自述; 文件 Y "我作为产品经理..."> )
- **working_style**: 小步迭代 + 数据驱动 (证据: 文件 Z 多次"先 MVP 验证再放量")
- **primary_languages**: ["JavaScript", "Python"] (证据: 源代码片段)
- **primary_tools**: ["Cursor", "Linear", "Figma"] (证据: 复盘文档明确提及)

### preferences (5 维, 0-1 数值, plan-tune 兼容)
- **scope_appetite**: 0.4 (证据: 多次"先做最简版本验证")
- **risk_tolerance**: 0.55 (证据: 平衡决策模式)
- **detail_preference**: 0.7 (证据: 文档详尽度高)
- **autonomy**: 0.5 (证据: 决策时常征求团队意见)
- **architecture_care**: 0.65 (证据: 多次提及架构设计)

> **如果 5 维证据不足 ≤ 2 维**, 这一整段 OMIT, 报告里写: "preferences 段跳过 (证据不足, D-011 evidence-driven 铁律)".

### knowledge_domains (3 个领域)
- 产品创新 / AI 应用 / 用户访谈

### recurring_patterns (3 条)
1. 先 dry-run 再 commit (来自 atom_X / atom_Y)
2. VOC 中重视反向证据 (来自 atom_Z)
3. 用画面感测需求清晰度 (来自 atom_W)

### evidence_atom_ids (Step 4 后回填)
- 占位 — 待 M 条 experience 入库后回填它们的真实 atom_id

---

或: Profile 候选 (跳过场景) — 当文档里没有可信画像证据时

> ⚠️ 已读文档中未抽象出可信画像数据 (e.g. 文档全是他人会议纪要 / 文档量过少). 跳过 profile 写入. 你可以稍后在 ProfilePage 手动建立画像, 或者下次 bootstrap 多导入文档后再尝试.

---

或: Profile 候选 (rerun 场景) — 当 dataDir 已有 profile 时, **新旧字段级 diff**

> ⚠️ 检测到现有 profile (创建于 X 天前, lastAccessedAt: Y). 下面是新数据 vs 现有数据的字段级 diff. 请逐字段决定 (D-011 校准协议):

| 字段 | 旧值 | 新值 | 选项 |
|---|---|---|---|
| identity.role | "产品经理" | "产品经理 / 创新教练" | (a) keep_old / (b) use_new / (c) merge ("产品经理 / 创新教练") |
| preferences.scope_appetite | 0.4 | 0.5 | (a) keep_old / (b) use_new |
| knowledge_domains | [产品创新, AI 应用] | [产品创新, AI 应用, 用户访谈] | (a) keep_old / (b) use_new / (c) merge (并集) |
| recurring_patterns | [...3 条] | [...4 条] | (a) keep_old / (b) use_new / (c) merge (并集去重) |

**说明 rerun 后 verified 行为**: cli write-profile 在 trigger=bootstrap_rerun 时会**强制 reset verified=false** (D-011 校准协议). 这是因为字段已变, 用户需要去 ProfilePage 重新看一眼. 旧版本会自动入 previous_versions 历史栈, 不丢失.

请回复你对每个字段的选择 (e.g. "1=use_new, 2=keep_old, 3=merge, 4=merge"). 我用你确认的合并版本调 cli write-profile 入库.

---

## 跳过列表

| 文件 | 原因 |
|---|---|
| photos/IMG_001.jpg | 图片格式, Agent 不处理 |
| backup.zip | 压缩包, 需要 unzip 后再扫 |
```

**告诉用户**:
> "上面是我从 N 个文件里抽出来的 M 个 experience 候选 + 1 条 profile 候选 (或 profile 跳过 / rerun diff). 你可以告诉我:
> - '全部 OK, 都入库' → 调 cli write 入 experience + cli write-profile 入 profile
> - 'Experience 第 X / Y 删掉, profile 用新值' → 根据具体调整入库
> - 'Profile 跳过, 只入 experience' → 仅入 experience, profile 不写
> - '放弃' → 一个都不入, 候选丢弃 (硬盘不动)
> 任何时候可中断, 没你确认我不会写库 (B-I3)."

**关卡**: 用 AskUserQuestion 确认 (rerun 场景下 profile 字段级选择是必须的, 不能模糊跳过).

### Step 4 · cli write --stdin 入库 (用户同意后才走)

对每个保留的候选, 构造完整 atom JSON (符合 atomsyn-write 的 schema, 见 atomsyn-write SKILL.md), 通过 cli 入库. 推荐**用临时文件 + `--input`** 而不是 echo pipe (避免 shell 转义错误):

```bash
# 1. 写到临时文件
cat > /tmp/atomsyn_bootstrap_atom_001.json <<'EOF'
{
  "name": "<候选 1 name>",
  "sourceContext": "<文件相对路径> · bootstrap from <session 日期>",
  "insight": "<完整 insight, 50-4000 字符>",
  "tags": ["tag1", "tag2"],
  "role": "产品",
  "situation": "复盘",
  "activity": "分析",
  "insight_type": "原则提炼",
  "stats": {
    "imported": true,
    "bootstrap_session_id": "<可选标识 e.g. boot_2026_04_28>",
    "useCount": 0,
    "usedInProjects": []
  }
}
EOF

# 2. 通过 cli 入库
atomsyn-cli write --input /tmp/atomsyn_bootstrap_atom_001.json
```

**重要约束**:
- `stats.imported = true` 让 cognitive-evolution 的 staleness 兜底生效 (createdAt 兜底, 防"刚 import 立即 stale")
- `confidence` 不传 (write 模式由 cli 自动填; ingest 模式才有 confidence; 见 atomsyn-write SKILL.md)
- 一次循环一条 atom, 失败就跳到下一条 (cli 报错 stderr 给用户看), 整批跑完后总结 N 写入 / M 失败
- 如果 cli stdout 含 `collision_candidates`, 走 atomsyn-write SKILL.md Step 3.4 的处理逻辑 (用 AskUserQuestion 让用户裁决)

### Step 4.5 · cli write-profile 入库 (D-011 · 仅 Step 2.5 没跳过 profile 时)

**前提**: Step 2.5 抽出了 profile 候选, Step 3 用户审阅过 (initial 场景接受新值, 或 rerun 场景做了字段级选择). 如果 Step 2.5 整段跳过了 profile (证据不足), **直接跳到 Step 5**, 不调 write-profile.

**回填 evidence_atom_ids** (Step 4 cli write 完成后, Step 4.5 之前):

Step 4 每次 cli write 成功的回执含 `atomId` 字段. 收集所有成功 write 的 atom_id 列表, 填入 profile 候选的 `evidence_atom_ids`. 这是未来 GUI ProfilePage 显示"基于 N 条 atom" 链接的关键。

**构造完整 profile JSON** (符合 `skills/schemas/profile-atom.schema.json`):

```json
{
  "name": "用户元认知画像 - 2026-04-28 (基于混沌创新院 16 文档)",
  "source_summary": "扫描 ~/Documents/混沌, 14 个文件, 关于产品创新方法论 + 拾光留声机项目复盘",
  "inferred_at": "2026-04-28T...",
  "identity": {
    "role": "产品经理 / 创新教练",
    "working_style": "小步迭代 + 数据驱动",
    "primary_languages": ["JavaScript", "Python"],
    "primary_tools": ["Cursor", "Linear", "Figma"]
  },
  "preferences": {
    "scope_appetite": 0.4,
    "risk_tolerance": 0.55,
    "detail_preference": 0.7,
    "autonomy": 0.5,
    "architecture_care": 0.65
  },
  "knowledge_domains": ["产品创新", "AI 应用", "用户访谈"],
  "recurring_patterns": [
    "先 dry-run 再 commit",
    "VOC 中重视反向证据",
    "用画面感测需求清晰度"
  ],
  "evidence_atom_ids": ["atom_exp_xxx_<unix>", "atom_exp_yyy_<unix>", ...]
}
```

**入库**:

```bash
# 1. 写到临时文件
cat > /tmp/atomsyn_bootstrap_profile.json <<'EOF'
{...上面的 JSON...}
EOF

# 2. cli write-profile (自动判断 trigger)
atomsyn-cli write-profile --input /tmp/atomsyn_bootstrap_profile.json
```

**cli 自动判断 trigger**:
- dataDir 无现有 profile → `trigger=bootstrap_initial` (新建)
- dataDir 有现有 profile → `trigger=bootstrap_rerun` (旧快照入 previous_versions, 顶层覆写, **强制 reset verified=false**)

**输出回执**:
```json
{
  "ok": true,
  "profileId": "atom_profile_main",
  "path": "<dataDir>/atoms/profile/main/atom_profile_main.json",
  "trigger": "bootstrap_initial",  // 或 bootstrap_rerun
  "isInitial": true,
  "isRerun": false,
  "previousVersionsCount": 0,
  "evidenceCount": 16,
  "verified": false,
  "verifiedAt": null,
  "hint": "Profile created (verified=false). Please go to Atomsyn ProfilePage to calibrate."
}
```

**重要约束 (D-011)**:
- cli 拒接受空 payload (`preferences/identity/knowledge_domains/recurring_patterns` 至少 1 个非空), 否则 exit 4 — **这是 evidence-driven 的硬护栏**, 不要用 placeholder 绕过它
- rerun 场景 SKILL Step 3 必须做字段级 diff (用户校准) 才能调 write-profile, **不要把 raw 新数据直接写**
- profile 默认 `verified=false`, 用户需要去 GUI ProfilePage 校准 verified=true 后未来 v2 才被 read 自动注入

### Step 5 · cli reindex + 引导用户

```bash
atomsyn-cli reindex
```

reindex 重建 `<dataDir>/index/knowledge-index.json`, 让 atomsyn-read / atomsyn-mentor / GUI 立即看到新 atom.

**最后告知用户** (根据 Step 2.5 / Step 4.5 是否写 profile 分两类):

**A. 含 profile 入库**:
> "✅ Bootstrap 完成! 写入 N 条 experience atom + 1 条 profile atom 到 `<dataDir>/atoms/`. 索引已重建. 跳过 X 条 (见上)."
>
> "下一步:
> - 在桌面应用打开 Atlas 页, 看 N 条新 atom 进入双骨架
> - 在 Cursor / Claude Code 起新会话, 问相关问题, atomsyn-read 会自然召回这些 atom
> - **去 ProfilePage 校准画像**: profile 当前 verified=false (D-007 v1 仅观察), 校准 verified=true 后未来 v2 的 read 会在新会话注入 profile. **rerun 场景特别提醒**: 这次校准后旧 profile 自动入 previous_versions 历史栈, 不丢失."

**B. profile 跳过 (Step 2.5 证据不足)**:
> "✅ Bootstrap 完成! 写入 N 条 experience atom 到 `<dataDir>/atoms/experience/`. 索引已重建. 跳过 X 条 (见上)."
>
> "Profile 候选**未生成** (源文档证据不足, D-011 evidence-driven). 下一步:
> - 在桌面应用打开 Atlas 页, 看新 atom 进入双骨架
> - 在 Cursor / Claude Code 起新会话, 问相关问题, atomsyn-read 会自然召回这些 atom
> - 去 ProfilePage 手动建立画像 (你比文档更懂自己), 或下次 bootstrap 多导入文档后再让 Agent 抽象"

---

## 5 条不可变承诺 (Iron Promises)

- **B-I1 · 永不绕过 cli write / write-profile**: 所有 atom 写入必须通过 `atomsyn-cli write --stdin` (experience) 或 `atomsyn-cli write-profile --stdin` (profile), 不直接 Write atom JSON 到 disk (会绕过 schema 校验 + collision 检测 + applyProfileEvolution 单例语义 + 索引重建)
- **B-I2 · 两步协议 (Agent-driven 版本)**: Step 3 先 markdown 报告 (用户审阅) → Step 4 + 4.5 cli 入库 (用户同意后才写). 即使用户说"快点全入库", 也必须先报告再写. rerun 场景的 profile 字段级 diff 是必经关卡, 不能跳
- **B-I3 · 用户主权**: 任何写入前用 AskUserQuestion 等用户确认, 用户说"放弃" → 立即停止, 当前会话不再追问
- **B-I4 · 隐私边界**: 强敏感关键字 (`sk-...` / `api_key=...` / `BEGIN PRIVATE KEY` / `.pem` / `.key` 文件) 整文件跳过, 弱敏感 (email / phone / 身份证号) 在 atom JSON 里 redact (用 `<redacted>` 占位)
- **B-I5 · profile 证据驱动 (D-011)**: profile 每个字段必须有具体 atom / 文档证据. 没证据的字段直接跳过 (preferences 5 维**整段** OMIT 如果 ≤ 2 维有证据). 完全没证据时整个 profile 跳过 (用户在 ProfilePage 手动建立). **永不无中生有**给 placeholder 数值 / 文字

---

## 反模式 (绝对不要)

❌ **调 `atomsyn-cli bootstrap --phase sampling/deep-dive/commit`** — 那是 GUI Wizard 用的, 你不需要 (D-008)
❌ **因为不熟悉文件格式就跳过** — 先尝试 Read / Bash + 标准工具 (pandoc / pdftotext / xlsx2csv) 转换. SKILL.md 没有"v1 仅支持 X 格式" 的限制 (D-009)
❌ **把每个文件压缩成一个 atom** — 一个文件常含多个洞察, 拆成多条比"一文件一 atom" 更有未来召回价值
❌ **自己 Write 文件到 `<dataDir>/atoms/`** — 必须通过 cli write
❌ **跳过 Step 3 markdown 报告直接 write** — 违反 B-I2 两步协议
❌ **静默触发后用户说"不用"还反复劝** — 礼貌闭嘴
❌ **假装自己已经处理完了** — 真正写入要走 cli, cli 报错就告诉用户实情, 不要假报"已入库"
❌ **profile 字段填 placeholder 凑齐 schema** (B-I5) — 没证据就 OMIT 整个字段; preferences 5 维不能 partial; 完全没证据就整段 profile 跳过. cli `write-profile` 内部已经会拒空 payload (exit 4), 但你也不要靠 cli 拦你 — 在 Step 2.5 就要严格证据驱动
❌ **rerun 场景跳过字段级 diff 直接覆写** — D-011 校准协议强制要求字段级 AskUserQuestion. 即使新数据看起来更全, 也必须让用户决定 keep_old / use_new / merge. 旧 profile 是用户校准过的, 不应被 Agent 单方面覆写

---

## 错误处理速查

| 情况 | 怎么办 |
|---|---|
| `atomsyn-cli where` 显示 dataDir 不存在 | 告诉用户 "Atomsyn 数据目录未初始化, 先打开桌面应用一次创建数据目录" |
| `bootstrap --phase triage` 路径不存在 (exit 2) | 让用户检查路径 |
| 单个文件 read 失败 (PDF 损坏 / 编码错误等) | 跳过该文件, 在最终总结里列入"跳过列表" |
| `cli write` schema 校验失败 (e.g. insight 太短 / tags 太多) | stderr 给用户看, 当前 atom 跳过, 继续下一条 |
| `cli write` 返回 `collision_candidates` | 走 atomsyn-write SKILL.md Step 3.4: AskUserQuestion 三选一 (保留并存 / supersede / 丢弃新建) |
| `cli write-profile` exit 4 "Profile payload is empty" | D-011 拒空 payload — Step 2.5 没找到证据但仍调了 cli, 违反 B-I5. 修复: Step 2.5 证据不足时整段跳过 profile, 不要调 write-profile |
| `cli write-profile` 返回 trigger=bootstrap_rerun + verified reset | 预期行为 (D-011 校准协议). Step 5 文案要特别提醒用户 "rerun 后旧 profile 已入 previous_versions, 当前 verified=false 请去 ProfilePage 重新校准" |
| 用户主动 Ctrl-C | 优雅停止, 已写入的 atom 保留 (它们已通过 schema 校验, 是合法 atom) |
| `cli reindex` 失败 (exit 1) | 警告用户但不阻塞: "atom 已写入, 但索引重建失败. 请稍后手动跑 atomsyn-cli reindex 或重启桌面应用" |

**核心原则**: 失败要诚实告诉用户, 不要假报成功. 真实情况比"看起来完成了"重要.

---

## 与其他 atomsyn skill 的协作

| Skill | 角色 | 与 bootstrap 的关系 |
|---|---|---|
| **atomsyn-bootstrap** (本 skill) | 冷启动批量入库 | Step 4 内部调 `cli write` 复用 atomsyn-write 的 schema 契约 |
| **atomsyn-write** | 单点沉淀 (单 atom) | 与本 skill 共享 atom JSON schema; collision 处理逻辑沿用 Step 3.4 |
| **atomsyn-read** | 检索召回 | bootstrap 完成后用户立即享受 read 召回新 atom (atomsyn-read SKILL.md 自动消费) |
| **atomsyn-mentor** | 复盘教练 | bootstrap 大批量入库后, mentor 报告会从"数据不足"变成"已积累 N 条 in X 领域" |

---

## v1 已知限制 (v2+ 视反馈再放开)

- **profile 默认 verified=false** (B-I3 of bootstrap-skill, D-007) — agent-driven bootstrap 写出的 profile, atomsyn-read v1 不自动注入. 用户需在 ProfilePage 切 verified=true, v2 才考虑让 read 在新会话注入 profile 作为 system prompt. **rerun 时 verified 强制 reset 为 false**, 确保用户每次重要变更都重新校准
- **文件格式覆盖 = 你 (Agent) 的能力** — 上限取决于用户机器装的工具 (pandoc / pdftotext / xlsx2csv 等). 这是**特性不是 bug**: 我们不限制你
- **没有断点续传** — 中途 Ctrl-C 后已 write 的 atom 保留, 但当前会话状态丢失, 下次重头跑 (Step 1 triage 可重跑成本极低)
- **没有跨会话 dedup** — 同一份文件跑两次 bootstrap 会重复入库 (但 cli 的 `collision_candidates` 会警告用户; profile 会自动走 rerun 协议有字段级校准)
- **不处理图片 / 音视频** — Agent 能力边界

---

**来源**: 这个 SKILL.md 是 chat-as-portal change (D-008/D-009/D-010) 的产物, 完全基于"外部 Agent 视角" 重写, 与之前 bootstrap-tools v2 的"cli 自带 LLM" 模式有意识地分离 (cli 自带 LLM 模式仍为 GUI Wizard 服务, 见 D-001 of chat-as-portal). 完整背景见 `openspec/archive/2026/04/2026-04-chat-as-portal/` (本 change 归档后).
