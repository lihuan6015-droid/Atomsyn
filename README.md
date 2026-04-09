# Atomsyn

> **个人主权元认知层** — Personal Meta-Cognition Vault
>
> 把你的认知资产，从 AI 里拿回来。

一个本地优先的跨平台桌面应用，把你读过的方法论、和 AI 聊出来的顿悟、以及你私下记下的踩坑碎片，沉淀成一层**100% 在你本地、能被任何 AI 唤醒**的记忆。

> 你可以主动打开它，看见自己的认知地图正在长成什么样子；你也可以什么都不做，下一次和 Claude / Cursor / Codex 对话时，它们看到的不再是一个空白的你。
>
> *Atomsyn — your meta-cognition, rematerialized.*

📄 **PRD**: [`docs/PRD-v2.0.md`](docs/PRD-v2.0.md) — 当前版本 0.1.0
🎯 **战略文档**: [`docs/framing/v2.0-problem-framing.md`](docs/framing/v2.0-problem-framing.md) — 价值主张与北极星
📋 **执行计划**: [`docs/plans/v2.0-implementation-plan.md`](docs/plans/v2.0-implementation-plan.md)
🎨 **视觉原型**: [`docs/mockups/atlas.html`](docs/mockups/atlas.html) · [`docs/mockups/atom-card.html`](docs/mockups/atom-card.html)
🤖 **协作契约**: [`CLAUDE.md`](CLAUDE.md) · [`skills/`](skills/)

> ⚠️ **2026-04-09 更名说明**: 项目曾用代号 `ccl-atlas`。V2.0 起统一为 **Atomsyn**。已不再保留兼容路径（单用户 MVP，无需向下兼容）。如果你是历史用户，首次启动 V2.0 时会弹出"搬个新家"对话框，自动迁移旧数据并把旧目录改名为 `.ccl-atlas.deprecated.<时间戳>` 备份。

---

## 快速开始

### 开发模式

```bash
npm install
npm run dev        # Vite dev server · http://localhost:5173
# 或
npm run tauri:dev  # 需要先装 Rust 工具链 (rustup)
```

首次启动会进入品牌 Splash，显示 4 步初始化进度（准备数据目录 → 初始化骨架 → 加载库 → 检测 Agent Skill）。

> 第一次启动时会看到默认预置的「产品创新 24 步法」骨架，以及 125 条携带的方法论原子，立即可以体验渐进披露、复制 Skill Prompt、Skill 地图、Agent 活动 Feed 等核心交互。

### 安装 Agent 双向接口

Atomsyn 的 L2 能力依赖 `atomsyn-cli` + 两个 skill 被装到你的 AI 编码工具里：

```bash
node scripts/atomsyn-cli.mjs install-skill --target claude,cursor
```

这条命令会：
1. 把 `atomsyn-write` + `atomsyn-read` skill 拷贝到 `~/.claude/skills/` 和 `~/.cursor/skills/`
2. 在 `~/.atomsyn/bin/` 安装一份 CLI shim（macOS/Linux: `atomsyn-cli` sh 脚本 · Windows: `atomsyn-cli.cmd`）
3. 打印 PATH 追加指令 —— 按指令把 `~/.atomsyn/bin` 加入你的 shell rc

加入 PATH 后：

```bash
atomsyn-cli where          # 确认数据目录
atomsyn-cli --help         # 查看所有命令
```

然后重启 Claude Code / Cursor，在对话里说：

> **"帮我记下来"** / **"存到我的 atomsyn"** / **"save to my atomsyn"** → atomsyn-write 会触发
>
> **"我之前是不是踩过这个坑"** / **"查一下 atomsyn"** / **"check my atomsyn"** → atomsyn-read 会触发

### 配置 AI Copilot（可选）

进入 **设置 → 🤖 AI 副驾驶**，填入你的 LLM Provider 配置：

- **Provider**：Anthropic / OpenAI / Custom（任意 OpenAI-compatible 端点）
- **Model**：例如 `claude-sonnet-4-6`、`claude-haiku-4-5-20251001`、`gpt-4o-mini`
- **API Key**：仅存储在浏览器 localStorage（**不会写入任何项目文件**）
- 点击「🧪 测试连接」验证

> Copilot / AI 摘要生成不可用时不影响其他功能。所有的卡片浏览、新建、Skill 地图、Agent Feed、原子校准都可以离线使用。

---

## 开发命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器 + 数据 API + 自动索引 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | TypeScript 严格检查 (`tsc --noEmit`) |
| `npm run reindex` | 手动重建知识库索引（dev server 没跑时用） |
| `npm run tauri:dev` | Tauri 桌面壳开发模式 |
| `npm run tauri:build` | Tauri 桌面壳打包 |

### Cargo 检查

```bash
export PATH="$HOME/.cargo/bin:$PATH" && (cd src-tauri && cargo check)
```

---

## 核心交互速查

| 动作 | 快捷键 |
|---|---|
| 全局搜索 / 命令面板 | `⌘K` (Mac) · `Ctrl+K` (Win) |
| AI 副驾驶 | `⌘J` (Mac) · `Ctrl+J` (Win) |
| 新建知识原子 | `N` |
| 切换主题 | 顶栏右上角 🌗 |

---

## 项目结构

```
atomsyn/
├── src/                              React + TS 前端
│   ├── components/
│   │   ├── layout/                   AppShell · TopNav · Sidebar
│   │   ├── shared/                   ThemeToggle · Toast · CollapseSection · FloatingCopilot
│   │   ├── atlas/                    MatrixCell · SpotlightPalette  ← 内部代码模块名（V2.0 不改）
│   │   ├── atom/                     SkillPromptBox · FillPromptDialog
│   │   ├── playground/               ProjectCard · StageProgress · NewProject/Practice/Pin Dialogs
│   │   ├── copilot/                  CopilotPanel
│   │   └── growth/                   PsychologicalCheckDialog
│   ├── pages/                        AtlasPage · AtomDetailPage · PlaygroundPage · ProjectDetailPage · GrowthPage · SettingsPage · OnboardingPage
│   ├── lib/                          dataApi · llmClient · cn · dataPath
│   ├── stores/                       useAppStore (Zustand)
│   ├── types/                        所有数据形状的单一真相源
│   └── index.css                     设计 token + Tailwind 入口
│
├── data/                             所有用户数据 (Git 友好)
│   ├── frameworks/                   骨架 JSON
│   ├── atoms/                        知识原子（按 framework/cell 分目录）
│   ├── projects/                     项目演练场 (meta.json + practices/)
│   ├── index/                        自动生成的索引
│   └── growth/                       使用日志 + 心理自查
│
├── config/
│   └── llm.config.json               LLM Provider 非敏感配置
│
├── skills/
│   ├── atomsyn-write/SKILL.md        L2 写入半边
│   ├── atomsyn-read/SKILL.md         L2 读取半边
│   ├── ingest-practice.skill.md      经验 → 项目实战的沉淀流程
│   ├── copilot.system.md             Copilot 人格
│   └── schemas/                      JSON Schema 校验文件
│
├── scripts/
│   ├── atomsyn-cli.mjs               L2 命令行入口
│   ├── scan-skills.mjs               本地 AI skill 扫描
│   └── rebuild-index.mjs             离线索引重建
│
├── src-tauri/                        Tauri v2 桌面壳 (Rust)
│
├── docs/
│   ├── PRD.md                        V1 PRD（历史归档）
│   ├── PRD-v1.5-delta.md             V1.5 PRD 增量（历史归档）
│   ├── PRD-v2.0.md                   V2.0 PRD（当前）
│   ├── framing/v2.0-problem-framing.md
│   ├── plans/v2.0-implementation-plan.md
│   └── mockups/                      HTML 视觉原型
│
├── vite-plugin-data-api.ts           Vite 中间件：/api 数据 CRUD 端点
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

---

## 数据模型

完整定义见 [`src/types/index.ts`](src/types/index.ts) 与 [`skills/schemas/`](skills/schemas/)。

| 实体 | 文件位置 | 关键字段 |
|---|---|---|
| **Framework** (骨架) | `data/frameworks/<id>.json` | `matrix.cells[]`、`columnHeaders[]` |
| **Atom** (知识原子) | `data/atoms/<framework>/<cell>/<slug>.json` | `coreIdea`、`whenToUse`、`aiSkillPrompt`、`stats` |
| **Experience Atom** | `data/atoms/experience/<slug>/<id>.json` | `kind: "experience"`、`subKind` |
| **Project** | `data/projects/<projectId>/meta.json` | `pinnedAtoms[]`、`innovationStage`、`status` |
| **Practice** | `data/projects/<projectId>/practices/<id>.json` | `atomId`、`title`、`status`、`keyInsights[]` |
| **Knowledge Index** | `data/index/knowledge-index.json` | 自动生成 · Copilot 与 ⌘K 共享数据源 |
| **Usage Log** | `data/growth/usage-log.jsonl` | 追加式事件流，喂养成长档案 |

---

## 双输入管道

### 📥 管道 A · GUI 手动入库

通过页面新建表单 / 项目演练场 / 收藏夹按钮，所见即所得。

### 📥 管道 B · Agent 协作入库（CLI-first）

在 Claude Code / Cursor 里直接对话：

> 「帮我把这段 RICE 评分模型沉淀进去」

agent 会调用 `atomsyn-write` skill，执行 `atomsyn-cli write --stdin`，自动生成符合 schema 的原子 JSON 并落到正确位置。**两条管道写入同一个数据目录，索引自动同步。**

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端 | **React 18** + TypeScript + Vite 6 |
| 桌面壳 | **Tauri v2** (Rust) |
| 样式 | TailwindCSS 3 + shadcn/ui patterns |
| 动画 | Framer Motion 11 |
| 状态 | Zustand 5 |
| 路由 | React Router 6 |
| 命令面板 | cmdk |
| 模糊搜索 | Fuse.js |
| LLM | @anthropic-ai/sdk（浏览器侧调用） |
| Schema 校验 | Ajv 8 |
| Markdown | react-markdown |
| 图标 | lucide-react |
| 数据持久化 | **纯 JSON 文件** |

---

## 桌面壳

Tauri v2 桌面壳已集成。打包目标：`dmg` / `app`（macOS）· `msi` / `nsis`（Windows）。

```bash
# 开发
npm run tauri:dev    # 需要 rustup 工具链

# 打包
npm run tauri:build  # 产物在 src-tauri/target/release/bundle/
```

### 跨平台数据目录

| 平台 | 默认数据目录 |
|---|---|
| macOS | `~/Library/Application Support/atomsyn/` |
| Windows | `%APPDATA%\atomsyn\` |
| Linux | `~/.local/share/atomsyn/` |

可通过 `~/.atomsyn-config.json` 的 `dataDir` 字段自定义，或在 dev 模式下用 `ATOMSYN_DEV_DATA_DIR` 环境变量临时覆盖（指向项目 `/data/` 做 dogfooding）。

### 首次运行

Tauri 首次启动时，自动从 bundled resources 拷贝 frameworks + 125 条 methodology atoms 到用户数据目录（非破坏性，已有文件绝不覆盖）。Splash 会显示 4 步进度。

详细历史设计与架构见 [`docs/releases/v1.5.md`](docs/releases/v1.5.md) 和 [`docs/PRD-v1.5-delta.md`](docs/PRD-v1.5-delta.md)。V2.0 路线见 [`docs/PRD-v2.0.md`](docs/PRD-v2.0.md)。

---

## 许可

Personal use. For now.

---

## 致谢

- 视觉灵感：Linear · Raycast · Apple HIG
