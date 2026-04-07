# CCL PM Tool

> **Personal Meta-Skill Vault** — 个人元能力沉淀系统
>
> 一个本地优先的跨平台桌面应用，把跨领域方法论笔记（产品、UI/UX、Agent 开发……）变成
> **可调用 · 可复用 · 可生长** 的个人知识资产。

📄 **PRD**: [`docs/PRD.md`](docs/PRD.md) — 完整产品需求文档（8 大章节）
🎨 **视觉原型**: [`docs/mockups/atlas.html`](docs/mockups/atlas.html) · [`docs/mockups/atom-card.html`](docs/mockups/atom-card.html)
🤖 **Claude Code 协作契约**: [`CLAUDE.md`](CLAUDE.md) · [`skills/`](skills/)

---

## 快速开始

### 1. 安装

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:5173

> 第一次启动时会看到默认预置的「产品创新 24 步法」骨架，其中第 02 格「用户声音」已预置 3 张示例原子（VOC / JTBD / KANO），可立即体验渐进披露和复制 Skill Prompt 等核心交互。

### 3. 配置 AI Copilot（可选）

进入 **设置 → 🤖 AI 副驾驶**，填入你的 LLM Provider 配置：

- **Provider**：Anthropic / OpenAI / Custom (任意 OpenAI-compatible 端点)
- **Model**：例如 `claude-sonnet-4-6`、`gpt-4o-mini`
- **API Key**：仅存储在浏览器 localStorage（**不会写入任何项目文件**）
- 点击「🧪 测试连接」验证

> Copilot 不可用时不影响其他功能。所有的卡片浏览、新建、收藏夹、项目演练场都可以离线使用。

---

## 开发命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器 + 数据 API + 自动索引 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建 |
| `npm run lint` | TypeScript 严格检查 (`tsc --noEmit`) |
| `npm run reindex` | 手动重建知识库索引（dev server 没跑时用） |

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
ccl_pm_tool/
├── src/                              React + TS 前端
│   ├── components/
│   │   ├── layout/                   AppShell · TopNav · Sidebar
│   │   ├── shared/                   ThemeToggle · Toast · CollapseSection · FloatingCopilot
│   │   ├── atlas/                    MatrixCell · SpotlightPalette
│   │   ├── atom/                     SkillPromptBox · FillPromptDialog
│   │   ├── playground/               ProjectCard · StageProgress · NewProject/Practice/Pin Dialogs
│   │   ├── copilot/                  CopilotPanel
│   │   └── growth/                   PsychologicalCheckDialog
│   ├── pages/                        AtlasPage · AtomDetailPage · PlaygroundPage · ProjectDetailPage · GrowthPage · SettingsPage · OnboardingPage
│   ├── lib/                          dataApi · llmClient · cn
│   ├── stores/                       useAppStore (Zustand)
│   ├── types/                        所有数据形状的单一真相源
│   └── index.css                     设计 token + Tailwind 入口
│
├── data/                             所有用户数据 (Git 友好)
│   ├── frameworks/                   骨架 JSON（如 product-innovation-24.json）
│   ├── atoms/                        知识原子（按 framework/cell 分目录）
│   ├── projects/                     项目演练场 (meta.json + practices/)
│   ├── index/                        自动生成的索引
│   └── growth/                       使用日志 + 心理自查
│
├── config/
│   └── llm.config.json               LLM Provider 非敏感配置
│
├── skills/                           Claude Code 协作契约
│   ├── CLAUDE.md                     (实际位于项目根)
│   ├── ingest-atom.skill.md          原始笔记 → 原子的沉淀流程
│   ├── ingest-practice.skill.md      经验 → 项目实战的沉淀流程
│   ├── copilot.system.md             Copilot 人格
│   └── schemas/                      JSON Schema 校验文件
│
├── docs/
│   ├── PRD.md                        完整 PRD
│   └── mockups/                      HTML 视觉原型
│
├── scripts/
│   └── rebuild-index.mjs             离线索引重建
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
| **Atom** (知识原子) | `data/atoms/<framework>/<cell>/<slug>.json` | `coreIdea`、`whenToUse`、`aiSkillPrompt`、`bookmarks[]`、`stats` |
| **Project** | `data/projects/<projectId>/meta.json` | `pinnedAtoms[]`、`innovationStage`、`status` |
| **Practice** | `data/projects/<projectId>/practices/<id>.json` | `atomId`、`title`、`status`、`keyInsights[]` |
| **Knowledge Index** | `data/index/knowledge-index.json` | 自动生成 · Copilot 与 ⌘K 共享数据源 |
| **Usage Log** | `data/growth/usage-log.jsonl` | 追加式事件流，喂养成长档案 |

---

## 双输入管道

### 📥 管道 A · Web UI 手动入库

通过页面新建表单 / 项目演练场 / 收藏夹按钮，所见即所得。

### 📥 管道 B · Claude Code 协作入库

在项目根目录运行 `claude` 进入 Claude Code，给它任意一段笔记或对话总结：

> 「帮我把这段 RICE 评分模型沉淀进去」

Claude Code 会读 [`CLAUDE.md`](CLAUDE.md) + [`skills/ingest-atom.skill.md`](skills/ingest-atom.skill.md)，自动按规范生成符合 schema 的原子 JSON，并放到正确的骨架/阶段目录下。**两条管道写入同一个 `data/` 文件夹，索引自动同步。**

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端 | **React 18** + TypeScript + Vite 6 |
| 样式 | TailwindCSS 3 + shadcn/ui patterns |
| 动画 | Framer Motion 11 |
| 状态 | Zustand 5 |
| 路由 | React Router 6 |
| 命令面板 | cmdk |
| 模糊搜索 | Fuse.js |
| LLM | @anthropic-ai/sdk (浏览器侧调用) |
| Schema 校验 | Ajv 8 |
| Markdown | react-markdown |
| 图标 | lucide-react |
| 数据持久化 | **纯 JSON 文件** (Vite dev plugin 提供 `/api/*` CRUD) |

---

## 未来演进 · 桌面壳

v1 alpha 直接跑在 **Vite + 浏览器 + 本地数据 API** 模式下，无需任何额外环境。

未来想发布为原生桌面 App 时，**前端代码 100% 不变**，只需要：

1. 安装 Rust 工具链：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. 添加 Tauri：`npm install -D @tauri-apps/cli && npx tauri init`
3. 把 `src/lib/dataApi.ts` 中的 `fetch('/api/...')` 实现替换为 `@tauri-apps/api/fs` 调用
4. `npm run tauri build` → 自动产出 `.dmg`（Mac）和 `.msi`（Windows）

---

## 许可

Personal use. For now.

---

## 致谢

- 视觉灵感：Linear · Raycast · Apple HIG
