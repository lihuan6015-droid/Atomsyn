# Decisions · 2026-04-bootstrap-tools

> **怎么用**: 设计阶段把可预见的关键决策写进来。实施阶段如发现 design 偏离, 不要直接改 design, 而是: (1) 这里追加新决策 (2) design.md §6 决策矩阵更新 (3) 必要时把旧决策标 `superseded`。
>
> **核心原则**: 决策的"理由"和"备选方案"才是这份文档的真正价值。

---

## D-001 · agentic 模式默认 (funnel 留 fallback)

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent (待用户确认)

### 背景

bootstrap-skill v1 是硬编码 5 层 funnel, 在真实混合目录上效果差 (proposal §3 痛点 3)。v2 引入 Agent 工具集 + LLM tool-use loop。需要决定: agentic 是默认模式还是 opt-in?

### 决策

**默认 `--mode agentic`**, 老 funnel 走 `--mode funnel` 兜底。CLI / GUI / Skill 描述均以 agentic 为主线。

### 理由

1. funnel 在真实目录效果差是已知 bug, 不是 "性能优化路径", 默认它就是默认 bug
2. agentic 是真正解决方案, 但 LLM tool-use 本身有不确定性 → 留 funnel fallback 保守
3. 用户不需要为新功能学新 flag, 体感无门槛升级

### 备选方案

- **agentic opt-in (`--mode agentic` 显式开)**: 用户不知道自己在跑老 bug, 体感差
- **funnel 删除**: v2 dogfood 期不能删, 万一 LLM 协议错误退路要有

### 后果

正向:
- 用户首次跑就拿到最佳体验
- v2 dogfood 数据全是 agentic 真实使用反馈

负向:
- LLM tool-use loop 失败时用户可能困惑 (缓解: 自动 fallback funnel + WARN)
- v1 既有用户重跑 bootstrap 结果不同 (可接受: 这是升级)

---

## D-002 · 路径粘贴检测全自动 + dismiss 持久化

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent (待用户确认)

### 背景

ChatInput 检测用户粘贴绝对路径模式后, 弹"是否启动 bootstrap?"提示。触发方式可全自动 (粘贴即弹) 或半自动 (右键菜单)。

### 决策

**全自动弹小提示**, 但加 (i) dismiss 按钮 (ii) "记住选择 30 天" 持久化到 localStorage `atomsyn:bootstrap-paste-dismissed`。

### 理由

1. 半自动 (右键菜单) 用户发现率低, 心理摩擦大
2. 全自动可能干扰对话流, 但加 dismiss + 持久化让用户可一次性关掉
3. 与 macOS 系统级 "粘贴位置后建议打开应用"的交互一致, 用户已有心智模型

### 备选方案

- **半自动 (右键菜单)**: 隐藏太深
- **全自动无 dismiss**: 反复打扰用户
- **不做检测**: 入口缺失, 用户痛点 #2 不解

### 后果

正向: 自然引导新用户发现 bootstrap; 老用户可一次 dismiss
负向: dismiss 后该用户永远看不到 (缓解: Settings 里加 "重置 bootstrap 提示" 按钮 — out-of-scope, v3)

---

## D-003 · agent_trace 落 session 不入 usage-log

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent (待用户确认)

### 背景

agentic loop 每次 LLM tool 调用都生成一条 trace 记录 (tool / args / result_summary / duration)。落地选择: (i) 落 `~/.atomsyn/bootstrap-sessions/<id>.json` 的 `agent_trace[]` 字段 (ii) 同步入 `data/growth/usage-log.jsonl`

### 决策

**仅落 session.agent_trace[]**, 不入 usage-log。

### 理由

1. trace 是 session 级 (每次 bootstrap run 都重置), usage-log 是用户级 (跨 session 累积) — 语义不同
2. 单次 bootstrap 可能产生 100+ trace 条目, 入 usage-log 会污染 mentor 的统计
3. usage-log 仅落 `bootstrap.started/phase_completed/commit_completed` 高层事件 (复用 v1)
4. session 文件本来就是 trace 的天然容器, GUI 可直接渲染时间线

### 备选方案

- **入 usage-log**: 污染 + 字段语义混乱
- **额外文件 `~/.atomsyn/bootstrap-traces/<id>.jsonl`**: 多一种文件类型, 增加管理成本
- **不落地, 仅 stderr 流**: GUI 看不到, 调试不便

### 后果

正向: 数据归属清晰, GUI 渲染简单
负向: usage-log 看不到 LLM 工具使用频率统计 (可接受: 这不是 v2 关注点)

---

## D-004 · docx + pdf 解析用 mammoth + pdfjs-dist (纯 JS, 无外部依赖)

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent

### 背景

需要支持 .docx + .pdf 文本提取。候选:
- (A) [mammoth](https://github.com/mwilliamson/mammoth.js) (.docx) + [pdfjs-dist](https://github.com/mozilla/pdf.js) (.pdf) — 纯 JS
- (B) Python 子进程 (python-docx + pdfplumber) — 高质量但需 Python 环境
- (C) Pandoc binary 子进程 — 通用但需用户装 Pandoc
- (D) 自实现 zip + xml 解析 — 不现实

### 决策

**A · mammoth + pdfjs-dist**。

### 理由

1. 纯 JS, 0 外部依赖, 用户开箱即用 (Tauri 打包内可用, 无需额外 binary)
2. mammoth 在 docx 文本提取上业界标杆 (next.js / dropbox 在用)
3. pdfjs-dist 是 Mozilla 维护, 高度成熟; v1 仅取前 5 页文本可控延迟
4. Bundle size 增加 ~2MB (主要 pdfjs), 可接受

### 备选方案

- B (Python): 用户必须装 Python + 依赖, 违反 "100% 本地, 一键开箱"
- C (Pandoc): 同上
- D (自实现): 不现实

### 后果

正向: 用户零配置; 跨平台一致
负向: pdfjs-dist 较大; 加密 PDF / 扫描件无法处理 (out-of-scope, OCR 留 v3)

---

## D-005 · LLM tool-use 双分支 (Anthropic + OpenAI)

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent

### 背景

LLM tool-use API:
- Anthropic: `tool_use` content block, `stop_reason: 'tool_use'`
- OpenAI: `function_call` (legacy) / `tool_calls` (new), `finish_reason: 'tool_calls'`
现有 `llmClient.mjs::chatComplete` 已分两个 provider 分支 (无 tool 支持)。

### 决策

**扩展 llmClient 加 `chatWithTools()`, 双分支实现 + 归一化 stop_reason / toolCalls 结构**。

### 理由

1. 复用既有 provider 检测逻辑
2. 归一化层让 agentic.mjs 不感知 provider
3. 单测可分别 mock 两个 provider 的协议

### 备选方案

- 仅支持 Anthropic: 排除 OpenAI 用户, 与 Atomsyn 多 provider 兼容性原则违背
- 用第三方库 (Vercel AI SDK): 多依赖 + 学习成本

### 后果

正向: provider 中立
负向: chatWithTools 实现工作量翻倍 (两个分支)

---

## D-006 · 工具沙箱用 path-prefix (sandboxRoots)

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent

### 背景

agentTools (ls/glob/grep/read) 必须有沙箱避免 LLM 让 read `/etc/passwd` 之类。沙箱粒度:
- (A) path-prefix: 路径必须 startsWith(sandboxRoots[i])
- (B) glob 白名单: 用户配置允许的 glob pattern
- (C) 无沙箱, 仅靠 system prompt 约束

### 决策

**A · path-prefix**, sandboxRoots = 用户在 paths 数组明确给的根。

### 理由

1. 简单可推理, 无歧义
2. sandboxRoots 自然来自 user input (Wizard / `/bootstrap path`)
3. 拒绝 `..` 越界 + normalize 后再比较, 防 path traversal 攻击
4. v1 .atomsynignore 仍生效 (read 走 extractor 链 + privacy)

### 备选方案

- B (glob 白名单): 用户学习成本高, glob 边界微妙易出错
- C (无沙箱): 对 LLM 不安全, 即使 prompt 约束也可能绕

### 后果

正向: 防御深度足够; 实现简单
负向: 用户想让 agent 同时探索 ~/Documents 和 ~/Downloads 必须显式给两个 path (合理)

---

## D-007 · Tauri scope 加 Documents+Downloads+Desktop, 不加 ~/**

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent

### 背景

Tauri capabilities 当前 fs:scope 只允许 `~/.atomsyn/` + `~/Library/Application Support/atomsyn/` 等。bootstrap 需读 `~/Documents/...`。范围选择:
- (A) `~/Documents/**` + `~/Downloads/**` + `~/Desktop/**` (常用文档位置)
- (B) `~/**` (全 home)
- (C) Settings 让用户自配

### 决策

**A**, 三个常用目录。不开 ~/**, 也不立刻做用户自配。

### 理由

1. 90% 用户的笔记 / 文档 在这三个目录
2. 不开 ~/** 避免前端代码读 ~/.ssh / ~/Library/Cookies / 浏览器配置
3. 用户自配 (C) 工作量大, v3 加

### 备选方案

- B (~/**): 隐私缺口太大
- C (用户自配): v2 不必要, 90% 用户 A 够用

### 后果

正向: 隐私边界明确
负向: 用户笔记在非默认位置 (e.g. ~/Dropbox/notes) 无法直接选 (缓解: CLI 模式不受 Tauri scope 限制, 用户用 CLI 跑 bootstrap 仍可访问任意路径)

---

## D-008 · v1 funnel 保留作 fallback 不删除

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent

### 背景

D-001 决策默认 agentic, 但要不要删 v1 funnel 实现 (`scripts/lib/bootstrap/deepDive.mjs` + `parallelDeepDive.mjs`)?

### 决策

**保留**, 通过 `--mode funnel` 显式启用。v2 dogfood 期 (~3 个月) 后视情况决定是否删。

### 理由

1. v2 agentic 不可避免会有 LLM tool-use 协议错误 / 卡死场景, 自动 fallback 必须有去处
2. v1 既有用户的 session 状态文件可能含 deep-dive 中断点, 用 v2 复跑可能不一致
3. 删除老代码是不可逆, 保留 6 个月观察后再决定零风险

### 备选方案

- 删除: 6 个月内不安全
- 弃置不维护: 同样保留, 但贴标签 "deprecated"

### 后果

正向: 安全网充足; v2 dogfood 数据足以判断 v3 是否删
负向: 代码库多 ~600 行 deepDive 实现 (可接受)

---

## D-009 · agentic loop 双重上限 (30 轮 + 100k token)

**状态**: accepted
**日期**: 2026-04-27
**决策人**: 主 agent

### 背景

LLM tool-use loop 必须有终止条件防卡死 / 烧 token。单一上限 (轮数 OR token) 各有问题:
- 仅轮数: LLM 可能一轮消耗 50k token (大 read), 30 轮 = 1.5M token
- 仅 token: LLM 可能小 read 反复探索 100 轮浪费 wallclock

### 决策

**双重: maxLoops=30 + maxTokens=100k, 任一触发即终止**。

### 理由

1. 30 轮 ≈ 一次 bootstrap 探索一个目录树足够 (4437 fixture 实测预期 ~15 轮)
2. 100k token ≈ $0.30 (Claude Sonnet 输入 $3/M), 用户预算可控
3. 双重保护让最坏情况都有退出

### 备选方案

- 单一轮数: token 失控
- 单一 token: wallclock 失控
- 三重 (+ wallclock 上限): 复杂

### 后果

正向: 用户预算可控; 失败有界
负向: 大型目录可能在 30 轮 / 100k 内未完成 → 退出时 dry-run markdown 标 "partial result, 建议拆分 paths 多次跑"

---

## 待澄清 (Open Questions)

参见 design.md §12。OQ-5 (agentic prompt 风格) + OQ-6 (中文目录翻译辅助) 在实施前 1 周由主 agent spike 决定。
