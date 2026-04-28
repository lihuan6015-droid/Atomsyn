---
change_id: 2026-04-bootstrap-tools
title: Bootstrap v2 — Agent-driven 文档探索 + 工具集 + 入口扩展
status: proposed
created: 2026-04-27
owner: 主 agent + 用户
supersedes: ""
related: 2026-04-bootstrap-skill (v1 已合并, 本 change 是 v2 增量)
---

# Proposal · Bootstrap v2 — Agent-driven 文档探索 + 工具集 + 入口扩展

## 1 · 摘要 (TL;DR)

bootstrap-skill v1 (已合并) 是"硬编码 5 层 funnel + 单目录扫描 + 仅文本扩展名" 架构。dogfood 后用户暴露 3 个核心痛点: (1) GUI Wizard 文件选择器只能选单目录, 不能选 .md / .docx 等具体文件; (2) ChatInput 的 / 命令面板缺 `/bootstrap`, 用户在对话流中无入口; (3) 真实硬盘是混合内容 (4400+ 文件 / 中文目录名 / 代码 + PDF + 笔记 + 图片混杂), 硬编码 funnel 不知道哪些子目录有价值, 出 noise 多。

本 change 引入 **Bootstrap v2**: (A) 文档解析层加 `.docx` / `.pdf` (mammoth + pdfjs-dist); (B) ChatInput 加 `/bootstrap [path]` 命令 + 路径粘贴智能识别; (C) Wizard dialog 改为多文件 / 目录混选; (D) **核心新增**: Agent 工具集 (`glob` / `grep` / `ls` / `stat` / `read`) 暴露给 LLM 通过 tool-use, 让 LLM 探索式决定如何处理目录 (先 `ls` 看子目录命名 → 根据"竞赛材料 / 调研日志 / UI 设计"等中文语义动态分桶 → 针对性 `glob` + `read`), 取代 v1 的硬编码 funnel; (E) Tauri capabilities 扩展 fs:scope 到 `~/Documents/**` 等常用路径。同时把 v1 的 12 项手动验证项工程化为本 change 的 G/V 任务。

## 2 · 背景 (Context)

**当前系统状态 (bootstrap-skill v1 已交付)**:

- CLI: `atomsyn-cli bootstrap --path <dir> --dry-run` 启动 3 阶段 funnel, 写入 `~/.atomsyn/bootstrap-sessions/<id>.{json,md}`
- GUI: 聊天页 "初始化向导"按钮 → 5 屏 Wizard (paths → triage → sampling → dryrun → commit)
- API: 8 个端点双通道 (profile 4 + bootstrap session 4)
- 文档解析支持 (TEXT_EXTS): `.md / .markdown / .txt / .json / .jsonl / .yaml / .yml / .ts / .tsx / .js / .jsx / .mjs / .cjs / .py / .rs / .go / .java / .kt / .swift / .html / .css / .scss / .less / .toml / .ini / .cfg / .conf / .sh / .bash / .zsh / .fish / .sql`

**dogfood 暴露的痛点 (来自用户 2026-04-27 反馈)**:

1. **痛点 1 · 文档选择器单一**: BootstrapWizard 第一屏只能 `dialog.open({ directory: true, multiple: false })` — 选单目录, 不能选具体的 .md / .docx 文件。用户场景: "我想只导入这 5 个 PRD" 无法做到, 只能选父目录然后让 funnel 全扫
2. **痛点 2 · 对话流缺入口**: 用户在 ChatPage 与 AI 对话时, 想触发 bootstrap 必须中断对话流去点"初始化向导"按钮。命令面板 (`/`) 已有 `/read /write /mentor` 但缺 `/bootstrap`
3. **痛点 3 · 硬编码 funnel 处理混合目录效果差**: 真实"开发过程资料"目录是 4437 文件 / 9 个中文子目录 (10月材料 / Langgraph调试日志 / UI设计 / 竞赛材料 / 我的研究 / ...) + 大量 .py / .pyc / .jpg / .pdf 混杂。v1 funnel 不区分 "Langgraph调试日志" (技术日志, 高价值) vs "10月材料" (混杂, 中价值) vs ".pyc 文件" (零价值)。Phase 2 sampling 抽 30 个文件就硬投 LLM, 经常错过子目录语义信号
4. **痛点 4 · 文档类型限制**: 用户的 PRD / 调研报告大量是 .docx, 论文是 .pdf。v1 全跳过, "导入存量素材"承诺打折
5. **痛点 5 · Tauri scope 限制**: 即使 GUI 选了 ~/Documents/X, packaged Tauri 模式因为 fs:scope 不含 ~/Documents 会报权限错

**强依赖**: bootstrap-skill v1 已合并, 本 change 在其基础上增量。复用 session 机制 / privacy / ignore / applyProfileEvolution / commit 端到端协议, 仅替换 triage + 5 层归类的内部实现。

**这个想法的来源**:

用户 2026-04-27 跑 dogfood 时的反馈: "聊天界面初始化向导无法选择 .md 和 .docx 等文档 / 在聊天输入框中也需要支持 / 调用对应 bootstrap 并支持用户自己复制本地磁盘文件路径的方式 / 让 Agent 去读取并解析的功能实现 / 提供原子工具例如 glob grep 等各类文件读取搜索工具集供 Agent 使用 / 例如根据先通过 glob ls 等命令获取目录下的文件夹, 根据不同文件命名有针对性的解析提取"。

## 3 · 痛点 (Problem)

**谁痛**: 所有跑 bootstrap 的用户 (新用户首跑 + 老用户重跑)。痛感强度: dogfood 第 1 次跑 `~/Documents/开发过程资料` 就遇到 4 个痛点中的 3 个。

**不解决会怎么样**:

- bootstrap-skill v1 的北极星指标 1 (产出 ≥ 1 profile + ≥ 20 atom) 在真实混合目录上达成困难: funnel 卡在 .pyc / 图片 / 二进制文件浪费 LLM 调用, 而真正高价值的 .docx / .pdf 全跳过
- 北极星 Demo 场景 ("两个月前的顿悟会安静地出现") 兑现不了: 用户的复盘文档大多是 .docx, 没进库
- "认知双向操作系统"承诺被打折: GUI 入口割裂 (聊天 vs 向导), 不是 conversational 体验

**具体场景** (主 agent 在 2026-04-27 dogfood 跑实际):

> 用户 A 打开 Atomsyn 聊天页, 想说 "我把 ~/Documents/开发过程资料 倒进来"。但当前要: (1) 找到"初始化向导"按钮 (2) 点开 (3) 在 dialog 选目录 (4) 切到终端 copy 命令 (5) 跑 CLI (6) 等待 ~30 分钟 funnel (7) 回 GUI 再 attach session — 7 步操作。理想流: 聊天里说 "/bootstrap ~/Documents/开发过程资料" + Agent 自动用工具集探索 + 给出 dry-run 报告 — 1 步。

## 4 · 提案 (Proposal)

### 一句话解

升级 bootstrap 三个层面: (i) 文档解析 (.docx + .pdf) (ii) 入口 (ChatInput / 命令 + 路径粘贴智能识别 + Wizard 多选) (iii) **架构 (硬编码 funnel → Agent-driven 工具集 + LLM tool-use)**。

### In-scope (本 change 必交付)

#### A · 文档解析层

- [ ] A1. `scripts/lib/bootstrap/extractors/` 新建目录, 拆分:
  - `markdown.mjs` (现有 .md 处理移过来)
  - `docx.mjs` (基于 [mammoth](https://github.com/mwilliamson/mammoth.js) 提 .docx 纯文本)
  - `pdf.mjs` (基于 [pdfjs-dist](https://github.com/mozilla/pdf.js) 提 .pdf 文本, 仅前 N 页)
  - `code.mjs` (现有源代码处理)
  - `text.mjs` (现有 .txt / .json / 配置文件)
- [ ] A2. `extractors/index.mjs` 统一调度: 按扩展名分发, 不存在 extractor 时跳过并记录 `unsupported_skipped[]`
- [ ] A3. `triage.mjs` TEXT_EXTS 扩展 + 调用新 extractor 集合
- [ ] A4. 隐私扫描器 (privacy.mjs) 在 extractor 输出后串行执行 (不变)
- [ ] A5. package.json 加 `mammoth` + `pdfjs-dist` 依赖, 跑 `npm install` 验证版本
- [ ] A6. 单元测试: extractor 各自一个 fixture (.docx fixture / .pdf fixture / .md fixture), 验证文本提取正确

#### B · ChatInput 入口扩展

- [ ] B1. `SkillCommandPalette.tsx` COMMANDS 加第 4 项 `/bootstrap` (icon: Sparkles, 描述 "导入硬盘上的笔记/文档/聊天历史")
- [ ] B2. ChatPage 监听 `/bootstrap` 选择: 不只是填入 `/bootstrap ` 文本, 而是直接打开 BootstrapWizard
- [ ] B3. 支持 `/bootstrap <path>` 语法: 用户输入完整命令含路径, 回车后启动 Wizard 并预填 path 到 paths 数组
- [ ] B4. ChatInput 新增 "粘贴路径智能识别": 用户粘贴 (paste) 内容时, 检测是否是绝对路径模式 (`/^[/~][^\s]+$/` 或 macOS `/Users/`, Windows `C:\`), 如果是 → 弹出小提示 "检测到本地路径, 是否启动 bootstrap 导入?"
- [ ] B5. Wizard PathsScreen `dialog.open()` 改为 `multiple: true` (允许多选目录) + 新增第 2 个按钮 "选具体文件" 用 `directory: false, multiple: true, filters: [{name: '文档', extensions: ['md', 'markdown', 'txt', 'docx', 'pdf', 'json', 'yaml']}]`

#### C · Agent 工具集 (核心新增)

- [ ] C1. `scripts/lib/bootstrap/agentTools.mjs` 新建, 暴露 5 个原子工具供 LLM tool-use:
  - `ls(path)` → 列子目录 + 文件名 (含中文)
  - `stat(path)` → 大小 / 修改时间 / 类型
  - `glob(pattern, root)` → 匹配文件路径列表 (含 ** 递归)
  - `grep(pattern, file)` → 文件内某 regex 匹配的前 N 行
  - `read(file, opts?)` → 提取文档内容 (走 extractor 链 + privacy 脱敏)
- [ ] C2. 新增 `scripts/lib/bootstrap/agentic.mjs` 替代旧 deepDive.mjs 的硬编码循环:
  - 接收 phase2 hypothesis + paths
  - 启动 LLM tool-use loop (Anthropic / OpenAI 都要支持): LLM 主动调 ls/glob/grep/read 探索目录, 决定哪些文件值得 deep-read, 哪些跳过
  - 每次 LLM 调用 tool 都记录到 session.agent_trace[] (供调试 + 用户审计)
  - 出口: 同样产出 markdown 候选列表 + profile_snapshot (与 v1 commit.md prompt 兼容)
- [ ] C3. CLI 新增 flag `--mode agentic|funnel` 默认 `agentic`, 老 funnel 走 `--mode funnel` 兜底
- [ ] C4. session 文件 schema 加 `agent_trace[]` 字段 (additive)
- [ ] C5. agentTools 必须有沙箱: `ls`/`glob` 不允许超出用户在 paths 数组明确给的 root; `read` 不允许读 .ssh/.env 等敏感路径 (复用 privacy + .atomsynignore)
- [ ] C6. dry-run markdown 报告新增 "Agent 探索路径" 章节, 把 agent_trace 渲染成人类可读的 timeline (帮用户审计 LLM 决策)

#### D · Tauri capabilities 扩展

- [ ] D1. `src-tauri/capabilities/default.json` fs:scope 加 `$HOME/Documents/**` + `$HOME/Downloads/**` + `$HOME/Desktop/**` (常用文档位置)
- [ ] D2. **可选**: 加 `$HOME/**` 但用户明确反对 — 倾向不做 (隐私边界过宽), 用户需自定义其他路径在 Settings 里点"加可信路径"
- [ ] D3. cargo check 通过

#### E · 把 bootstrap-skill v1 的 12 项手动验证工程化为本 change 任务

(详见 § G + § V 章节, 不在 in-scope 单列)

#### F · 兼容性

- [ ] F1. v1 用户的 session JSON 在 v2 加载零异常 (agent_trace 字段缺失时 GUI 不报错)
- [ ] F2. 老的 `--mode funnel` 路径在本 change 内**不删**, 作为 v2 失败时的 fallback
- [ ] F3. extractor 链对 v1 已支持的扩展名输出与 v1 相同 (回归测试)

### Out-of-scope (本 change 不做, 留给后续)

- `.epub` / `.pages` / `.numbers` / `.key` 解析
- 二进制文档 OCR (扫描 PDF / 截图)
- 视频 / 音频 / 录音转录
- 自定义 fs:scope (用户在 Settings 里加路径) — v2.5
- LLM tool-use 跨会话状态保留 (本 change agentic loop 单 session 内一次性)
- bootstrap 进度可视化 (实时 SSE / WebSocket) — v3
- 多用户 profile (Atomsyn 永久 single-tenant)
- 写一个 Rust shell command 让 packaged Tauri 能 spawn `atomsyn-cli ingest` (bootstrap-skill v1 OQ-2 残留, v3 处理)

## 5 · 北极星对齐 (North Star Alignment)

| 维度 | 回答 |
|---|---|
| 主层 | **仓库层** (Vault) — 让"导入存量"实际可执行: 支持真实文档类型 + 在对话流中触发 + 智能探索混合目录 |
| 喂养下游 | **结构层**: agent_trace 记录的"哪些子目录被 LLM 判断为高价值"是结构层未来"语义骨架"的天然输入 (e.g. mentor 可学到"用户的'我的研究'目录通常含 deep insight"). **教练层**: dogfood 验证完整后, mentor 报告可基于 imported atom 给出更准的 gap 分析 |
| 来自上游 | bootstrap-skill v1 (复用 session / privacy / commit 协议) + cognitive-evolution (复用 staleness / supersede 兜底) + V1.5 L2 双层 (CLI / Skill 双入口) |
| 北极星主句关联 | "**让你积累的认知, 在需要时醒来**": v1 解决了"建账户", v2 解决"建账户的实际可行性"。没有 v2, 用户面对真实硬盘上的 .docx / 中文目录 / 混合内容时, "导入"承诺打折。v2 让 Demo 场景从 "Demo Friendly path 跑通" 升级到 "用户硬盘真实目录跑通" |

## 6 · 成功指标 (Success Metrics)

- **指标 1 · 文档类型覆盖率**: 在 `~/Documents/开发过程资料/` 跑 dry-run, 至少 ≥ 80% 的文本类文件被 extractor 处理 (.md/.txt/.json/.docx/.pdf), 不含 .py/.pyc/.jpg 等非文档。验证: 看 dry-run markdown 报告中 "已处理文件" 比例
- **指标 2 · 对话流入口转化**: dogfood 用户从启动 bootstrap 到拿到 dry-run 报告的总操作步数 ≤ 3 步 (`/bootstrap` → 选 path → 等结果)。当前 v1 是 7 步
- **指标 3 · Agent 探索质量**: 跑 fixture 目录后, agent_trace 应**至少 50% 调用是高价值** (即 read 的文件最终进了候选 markdown), 不是噪音遍历。验证: trace 中 read 次数 vs 候选 atom 数比 ≥ 1:1
- **指标 4 · 性能**: agentic 模式在 1000 文件目录上端到端 ≤ 20 分钟 (v1 funnel 串行 30 分钟基线), 因为 LLM 主动跳过低价值文件
- **指标 5 · v1 回归零破坏**: 老 session JSON 加载 / `--mode funnel` 走通 / 现有 BootstrapWizard 5 屏不破

## 7 · 风险与未知 (Risks & Unknowns)

### 已知风险

- **R1 · LLM tool-use 实现差异**: Anthropic 的 tool_use API 与 OpenAI 的 function calling 协议不同, llmClient.mjs 现在只做单轮对话。**缓解**: tool-use loop 单独抽到 agentic.mjs, llmClient 加 `chatWithTools()` 方法, 双模分支
- **R2 · LLM 工具失控**: LLM 可能在 ls / glob 上反复探索却不 read (浪费 token), 或者 read 太多 token 爆 context。**缓解**: 工具集层加硬上限 (ls 单次返回 ≤ 200 entries / read 单文件 ≤ 16KB / loop 总轮数 ≤ 30 / 总 input token ≤ 100k)
- **R3 · docx/pdf 解析失败率**: mammoth + pdfjs 对扫描件 / 加密 / 损坏文件会抛错。**缓解**: extractor 各自 try/catch, 失败入 `phase3_skipped[]` 并继续
- **R4 · Tauri scope 扩展放宽隐私边界**: 把 ~/Documents 加进 fs:scope 后, 任何前端代码都能读用户 Documents。**缓解**: 仅 bootstrap 路径才会真去读 (CLI-first 铁律仍守); 文档化告诉用户; 不加 ~/** 通配
- **R5 · agent_trace 让 dry-run markdown 变长**: 增加用户审计成本。**缓解**: trace 默认折叠, 用户主动展开 (GUI 控制)
- **R6 · 中文路径名/文件名编码**: macOS HFS+ NFD 标准化 vs JS NFC, glob 可能错过。**缓解**: agentTools 路径 normalize 用 `String.prototype.normalize('NFC')`, 测试用例必含中文目录
- **R7 · v1 commit prompt 与 v2 输出契约不一致**: v1 commit.md 假设 markdown 是 funnel 出的固定 schema, agentic 输出可能略有偏差。**缓解**: agentic 输出严格按 v1 markdown 模板 (5 层架构标题不变), commit prompt 不动

### 待澄清

- [ ] OQ-1 · agentic 模式默认还是 opt-in? **倾向**: 默认 agentic (因为 v1 funnel 在真实目录上效果差, 是已知 bug); funnel 留 fallback。**用户拍板**
- [ ] OQ-2 · ChatInput 路径粘贴智能识别的触发: 全自动 (粘贴即弹) vs 半自动 (右键菜单显式触发)? **倾向**: 全自动, 但带 dismiss 按钮和 "记住选择" 持久化
- [ ] OQ-3 · agent tool 调用记录 (agent_trace) 是否对接 cognitive-evolution 的 usage-log? **倾向**: 不对接, 单独存 session 里, 因为 trace 是 session 级而 usage-log 是用户级
- [ ] OQ-4 · 12 项手动验证项的整体优先级: 必须本 change 内全跑通 vs 部分留待 v3? **倾向**: 12 项中 V11/V12/V13 (GUI 校准 + dry-run/commit + 单例) 在 v2 dogfood 中顺带验证; G2/G2b/G3 (LLM 集成) 是本 change 自动化; E4/E5/V5/V6/V10 (Skill 真实触发 + 主题验收) 用户实机一次性走通

## 8 · 替代方案 (Alternatives Considered)

### 方案 A · "只加扩展名 + multiple dialog, 不加 agent 工具集"

- 描述: 仅做 in-scope §A + §B + §D, 不做 §C (保留 v1 funnel 架构)
- 利: 实施成本 30% (~3 周 → ~1 周), 风险低
- 弊: 不解决痛点 3 (混合目录效果差), 北极星 Demo 在真实硬盘上仍然不亮
- 为什么没选: 用户明确要求 "提供原子工具供 Agent 使用", 这是核心反馈, 不能阉割

### 方案 B · "纯 LLM, 不要工具集, 让 LLM 凭名字猜内容"

- 描述: 不实现 ls/glob/grep, 而是 phase 1 把整目录树名字 (10000 个 paths) 喂给 LLM, 让它一次性挑值得读的
- 利: 实施简单, 不用做 tool-use loop
- 弊: 10000 paths 容易爆 context; LLM 没看实际内容只能凭名字猜, 错率高; 不可解释 (没 trace)
- 为什么没选: 工具集 + tool-use loop 才是 industry standard 的 Agent 探索模式 (Cursor / Claude Code 自己就是这么做的)

### 方案 C · "做 GUI 进度面板 + SSE 不做架构升级"

- 描述: 不动 funnel 实现, 投入 GUI 实时进度可视化让 v1 体验"看上去顺一些"
- 利: 视觉冲击大, 用户感知"在工作"
- 弊: 治标不治本, 架构问题没解决
- 为什么没选: 用户痛点是产出质量, 不是体感等待

### 方案 D · "新建一个独立 import-cli 子项目, 不在 bootstrap 范畴内"

- 描述: 把 docx/pdf 解析 + Agent 工具单做一个 atomsyn-import 工具
- 利: 模块独立, 不污染 bootstrap
- 弊: 用户认知割裂, "bootstrap 还是 import?" 永远要解释; CLI 命令面拆分增加学习成本; 与 Skill / GUI 的双层架构脱节
- 为什么没选: bootstrap-skill 已是 V2.x 北极星投放点, 在它之上演化更连贯

## 9 · 上下游引用

- **战略锚点**: `docs/framing/v2.x-north-star.md` §1 三层架构 + §6 哲学 5 (CLI-first) + §6 哲学 7 (教练不居高临下)
- **idea 来源**: 用户与主 agent 的 dogfood 反馈 (2026-04-27), 已在主 agent 系统提示中沉淀
- **强依赖**: `openspec/changes/2026-04-bootstrap-skill/` (v1 已合并, 接口 / session / commit 协议复用)
- **强依赖**: `openspec/changes/2026-04-cognitive-evolution/` (已合并, applyProfileEvolution + staleness 复用)
- **设计参考**:
  - Claude Code / Cursor 的 tool-use loop 实现 (内置 ls/grep/read 工具)
  - mammoth.js (.docx → text) https://github.com/mwilliamson/mammoth.js
  - pdfjs-dist (.pdf → text) https://github.com/mozilla/pdf.js
- **影响的 specs**:
  - `openspec/specs/cli-contract.md` — bootstrap 子命令加 `--mode agentic|funnel` flag
  - `openspec/specs/skill-contract.md` — atomsyn-bootstrap SKILL.md 加 v2 触发关键字 "/bootstrap" + 工具集说明
  - `openspec/specs/data-schema.md` — bootstrap session schema 加 `agent_trace[]` 字段 (additive)
- **复用的接口**:
  - `scripts/lib/bootstrap/session.mjs` (createSession / loadSession / writeSession / failSession)
  - `scripts/lib/bootstrap/privacy.mjs` (scanText / isStrongSensitive / redactWeakInText)
  - `scripts/lib/bootstrap/ignore.mjs` (loadIgnoreForRoot / buildMatcher)
  - `scripts/lib/bootstrap/commit.mjs::runCommit` (commit 阶段不变)
  - `scripts/lib/evolution.mjs::applyProfileEvolution` (profile 单例语义不变)

## 10 · 残留任务回收 (来自 bootstrap-skill v1)

bootstrap-skill v1 留下 12 项手动验证项 (E4/E5 + G2/G2b/G3 + G4/G5 + V5/V6/V10/V11/V12)。本 change 实施过程中**自动满足**其中 8 项, 剩余 4 项作为本 change 的 dogfood 任务:

| v1 残留 | 本 change 处理方式 |
|---|---|
| E4 (Claude Code 真实触发 atomsyn-bootstrap) | 本 change G 组 dogfood 阶段实机验证 |
| E5 (Cursor 触发同) | 同上 |
| G2 (e2e dry-run 集成测试) | 本 change G 组用 fixture (`tests/fixtures/bootstrap-mixed/`) + mock LLM (含 tool-use 模拟) 实现 |
| G2b (e2e commit 集成测试) | 同上 |
| G3 (resume 集成测试) | 本 change G 组实现 |
| G4 (1000 文件性能) | 本 change G 组用 `~/Documents/开发过程资料` 作为 baseline (4437 文件) 实测 |
| G5 (dogfood 6 场景) | 本 change G 组挨条走 |
| V5 (write→read→update→mentor→bootstrap 端到端) | 本 change V 组 + 用户实机 |
| V6 (light + dark 主题验收) | 本 change V 组 (新增 ChatInput 路径粘贴 banner / agent_trace timeline) |
| V10 (Cursor + Claude Code 双工具识别 atomsyn-bootstrap) | 本 change V 组 + 用户实机 |
| V11 (GUI 校准模块端到端) | 本 change V 组 (复用 v1 ProfileCalibration, 加 v2 测试用例) |
| V12 (dry-run/commit 两阶段) | 本 change G 组自动化 + 用户实机 |
