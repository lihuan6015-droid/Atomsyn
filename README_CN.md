<p align="center">
  <img src="Atomsyn_logo.jpeg" alt="Atomsyn Logo" width="120" />
</p>

<h1 align="center">Atomsyn</h1>

<p align="center">
  <strong>你的认知资产，你的规则，随时唤醒。</strong><br/>
  一个本地优先的个人知识库，把零散的洞察变成有结构的、AI 可调用的认知地图。
</p>

<p align="center">
  <a href="https://github.com/lihuan6015-droid/Atomsyn/actions/workflows/ci.yml"><img src="https://github.com/lihuan6015-droid/Atomsyn/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/tauri-v2-blue" alt="Tauri v2" />
</p>

<p align="center">
  <strong>中文</strong> | <a href="README.md">English</a>
</p>

---

## Atomsyn 是什么？

你读过的方法论、和 AI 聊出来的顿悟、项目中踩过的坑——它们没有消失，只是沉睡在散落的笔记和聊天记录里。

**Atomsyn** 让它们醒来。它是一个跨平台桌面应用，给你：

- **结构化的知识库** — 方法论、经验碎片、技能清单，都有地方放、有结构长
- **AI 感知的双向接口** — Claude、Cursor 等 AI 编码工具可以在对话中直接读写你的知识库
- **认知教练层** — 发现你的知识盲区，推你去用已经学过的东西

一切数据 100% 存在你本地。没有云端，没有订阅，没有锁定。

## 核心功能

- **原子花园** — 按方法论骨架、角色、自定义组织方式浏览你的知识，支持渐进披露
- **Agent 双向接口** — 安装 Skill 后，AI 助手在对话中自然地读取和写入你的知识库
- **Skill 地图** — 一眼看到你所有的 AI 工具及其集成状态
- **认知雷达** — 看到哪些领域已经扎实，哪些还是空白
- **成长分析** — 追踪你的学习轨迹和知识积累趋势
- **富文本编辑器** — 内置 TipTap 驱动的 Markdown 编辑器
- **命令面板** — `Cmd+K` / `Ctrl+K` 快速搜索和导航
- **深色模式** — 完整的亮/暗主题支持

## 截图

<p align="center">
  <img src="assets/screenshots/image-1.png" width="48%" />
  <img src="assets/screenshots/image-2.png" width="48%" />
</p>
<p align="center">
  <img src="assets/screenshots/image-3.png" width="48%" />
  <img src="assets/screenshots/image-4.png" width="48%" />
</p>

## 快速开始

### 下载安装

在 [Releases](https://github.com/lihuan6015-droid/Atomsyn/releases) 页面下载预构建的安装包：

| 平台 | 格式 |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` / `.exe` |

### 从源码构建

**前置条件**：Node.js 22+、Rust 工具链（[rustup](https://rustup.rs/)）

```bash
# 克隆仓库
git clone https://github.com/lihuan6015-droid/Atomsyn.git
cd AtomSyn

# 安装依赖
npm install

# 开发模式（Web）
npm run dev

# 桌面应用开发模式
npm run tauri:dev

# 生产构建
npm run tauri:build
```

首次启动时，Atomsyn 会自动填充一个「产品创新 24 步法」方法论骨架和 125+ 条方法论原子，让你立刻开始探索。

## Agent 双向接口（开发者）

Atomsyn 附带 CLI 工具和 Skill，可以插入 Claude Code、Cursor 等 AI 编码工具，让 AI 助手在对话中直接读写你的知识库。

> **注意**：Agent 集成目前需要从源码构建。桌面应用内一键安装 Skill 已在路线图中。

```bash
# 安装 Skill 到 Claude Code 和/或 Cursor
node scripts/atomsyn-cli.mjs install-skill --target claude,cursor

# 按提示把 CLI 加入 PATH，然后验证：
atomsyn-cli where
```

安装后，在 AI 对话中用自然语言交互：

| 你说… | 发生什么 |
|---|---|
| "帮我记下来" / "存到 atomsyn" | `atomsyn-write` 把洞察结晶为结构化原子 |
| "查一下 atomsyn" / "我之前踩过这个坑吗" | `atomsyn-read` 从知识库检索相关知识 |
| "复盘一下" / "我的盲区是什么" | `atomsyn-mentor` 生成认知复盘报告 |

## 数据存储

所有数据以纯 JSON 文件存储在你的本地机器上：

| 平台 | 默认位置 |
|---|---|
| macOS | `~/Library/Application Support/atomsyn/` |
| Windows | `%APPDATA%\atomsyn\` |
| Linux | `~/.local/share/atomsyn/` |

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 6 |
| 桌面壳 | Tauri v2 (Rust) |
| 样式 | TailwindCSS 3 |
| 动画 | Framer Motion 11 |
| 状态管理 | Zustand 5 |
| 编辑器 | TipTap |
| 搜索 | Fuse.js |
| Schema 校验 | Ajv 8 |

## 开发命令

```bash
npm run dev          # Vite 开发服务器 + 数据 API
npm run build        # 类型检查 + 生产构建
npm run lint         # TypeScript 严格检查
npm run reindex      # 重建知识库索引
npm run tauri:dev    # 桌面应用开发模式
npm run tauri:build  # 桌面应用生产构建
npm run test:cli     # CLI 回归测试
```

## 参与贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解：

- 开发环境搭建
- 分支策略和 PR 流程
- Commit 消息规范
- 代码风格指南

## 路线图

- 聊天模块：流式 Markdown + 内联原子引用
- 书架：方法论阅读清单管理
- 桌面应用内一键安装 Agent Skill
- 增强认知教练：个性化行动计划
- 插件系统：自定义知识框架
- 多语言 UI

## 许可证

本项目基于 Apache License 2.0 开源 — 详见 [LICENSE](LICENSE) 文件。

## 致谢

- 设计灵感：[Linear](https://linear.app)、[Raycast](https://raycast.com)、Apple HIG
- 基于 [Tauri](https://tauri.app)、[React](https://react.dev)、[TailwindCSS](https://tailwindcss.com) 构建
