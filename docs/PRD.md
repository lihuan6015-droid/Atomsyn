> 📦 **Archived · V1 history**: 项目 V2.0 起更名为 **Atomsyn**。当前版本规划见 [`PRD-v2.0.md`](PRD-v2.0.md) 与 [`framing/v2.0-problem-framing.md`](framing/v2.0-problem-framing.md)。本文档保持原 `ccl-atlas` 命名以保留历史上下文。

# CCL Atlas · 产品需求文档 (PRD)

> **个人元能力沉淀系统 · Personal Meta-Skill Vault**
>
> 版本：v1.0 · 2026-04-07
> 作者：Circle Lee
> 状态：✅ 已定稿，待开发

---

## 📑 目录

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Users & Personas](#3-target-users--personas)
4. [Strategic Context](#4-strategic-context)
5. [Solution Overview](#5-solution-overview)
6. [Success Metrics](#6-success-metrics)
7. [User Stories & Requirements](#7-user-stories--requirements)
8. [Out of Scope / Dependencies / Risks](#8-out-of-scope--dependencies--risks)
9. [Appendix · 视觉线框与技术栈](#9-appendix--视觉线框与技术栈)

---

## 1. Executive Summary

我们在构建一个 **本地优先的跨平台桌面应用（CCL Atlas）**，服务于**从工程师转型 AI 产品经理的跨界并行成长者**，解决"系统学过的方法论在几个月后只剩名词、无法在实际工作中调用"的痛点。

它通过两层结构——**"知识图书馆 Atlas"**（按 Discover / Define / Ideate / Develop / Validate / Evolve 等科学阶段组织的卡片库，每张卡片包含核心理念 + 可直接对话 AI 的 Skill Prompt + 个人知识收藏夹）与 **"项目演练场 Playground"**（为每个真实项目挑选方法论卡片、实践、沉淀结果）——让方法论从"静态笔记"变成"可调用、可迭代、可积累"的活知识；并通过 **AI 副驾驶（Copilot）**，实现"描述痛点 → 推荐方法论 → 一键跳转"的闭环。

最终结果：**一个随认知持续生长的个人技术+产品知识资产，且每一条方法论都能在未来任意时刻被快速检索、复用、并以 AI-ready 的 Skill 形式直接投入工作。**

---

## 2. Problem Statement

### 2.1 Who（谁）
一位从 Agent 开发工程师转型 AI 产品经理的新人（同时持续从事前端原型开发、Agent 工程开发），正在跨多个技术与产品领域并行学习和实践。

### 2.2 What（问题）
系统学习过的方法论、UI/UX 经验、Agent 开发范式，在学习的当下都能理解，但几个月后只剩零散名词，**无法在真实工作中被快速调用**。更致命的是，这些知识彼此之间的**层级关系与全局地图**也随之丢失——例如"VOC 是伞，JTBD/KANO 是其子集"这种结构一旦忘了，连搜索都不知道该搜什么。

### 2.3 Why it hurts（为什么痛 · 五维代价）

| # | 维度 | 表现 |
|---|---|---|
| A | **产出质量打折** | 凑合出来的方案不是最优解 |
| B ⭐ | **职业身份焦虑（最痛）** | 每次调不出来都强化"我是不是不配做这个职业"的自我怀疑 |
| C | **时间成本** | 每次都要从零和 AI 绕一圈 |
| D | **经验无法复利** | 凑合的结果不沉淀，下次还是一样混沌 |
| E | **失去话语权** | 没有"方法论的尺子"，无法在评审/对话中主导 |

> 🔑 **核心洞察**：表面是"方法论记不住"，本质是 **"我学过但我用不上 → 我是不是不配做这个职业"** 的职业身份焦虑。A/C/D/E 都只是症状，**B 是病根**。这决定了整个产品的设计取向——**这不只是一个效率工具，更是一个"认知底气重建工具"**。

### 2.4 触发场景示例
近期一次用户需求调研中，想到应使用 VOC，但记不清 VOC 伞下的 JTBD、KANO 等子方法论的具体用法，最终只能"凭经验问 AI 凑合生成方案"——但缺乏方法论视角使其无法判断 AI 输出的质量，造成"用了 AI 却更焦虑"的逆效果。

### 2.5 现有替代方案为何失败

- **散落在本地文件夹的 PDF/PPT**：基本等于没有，遗忘速度 ≈ 下载速度
- **Obsidian / Notion / 飞书等通用笔记工具**：
  - 视觉无冲击力 → 不想打开 → 继续沉睡
  - 无法表达"方法论 ↔ 项目实践"的双向绑定
  - 纯文本无法让卡片"变活"为 AI Skill
  - 线性/树状结构天然对抗"全局地图"

### 2.6 自研的四大不可替代价值

1. **双向绑定**：通用方法论 ↔ 真实项目实践
2. **卡片即 Skill**：每张方法论卡片自带 AI-ready Prompt
3. **全局地图先行**：阶段矩阵常驻首屏
4. **视觉冲击力即功能**：Apple/Google 级视觉作为"反遗忘机制"

### 2.7 项目范围的关键升维

工具承载范围**不限于产品方法论**，同步覆盖 **UI/UX 经验沉淀、Agent 开发范式沉淀、以及未来任何新领域**。因此产品底层是一个**领域无关的"知识原子 + 骨架"双层模型**，而不是一个"产品方法论 CRUD"。

---

## 3. Target Users & Personas

### 3.1 主画像 · "混沌建图人" The Cartographer-in-Chaos

一个技术功底扎实、正在主动跨进产品/设计多个陌生领域、学得快但忘得也快、渴望把"散落的认知"锚定成"可调用资产"的个体从业者。

| 维度 | 描述 |
|---|---|
| **职业身份** | 前 Agent 开发工程师 → 一年内转型 AI 产品经理，同时保持前端原型开发、Agent 工程能力 |
| **技术能力** | TS/React 能独立开发，熟悉 AI 对话式协作（Claude Code 深度用户），能驾驭"本地 JSON + 轻量前端"的栈 |
| **学习模式** | **双模式学习者**：① **爆发式**——集中上课/读资料后需要沉淀入库；② **持续涓流式**——日常阅读、与 AI 对话、实战顿悟都会产生零碎认知，需要**低摩擦的即时捕获通道** |
| **典型工作场景** | 启动新需求 · 评审方案 · 设计原型 · 与 AI 共创 UI · 设计 Agent 工具链 |
| **核心目标** | ① 让学过的方法论随调随用 ② 让实战经验自动沉淀 ③ 重建方法论主导的自信与话语权 ④ 跨领域共用同一套沉淀系统 |
| **核心痛点** | 学过≠记得≠用得上；通用笔记工具打不开；无全局地图；专业术语缺失；⭐ 职业身份焦虑 |
| **行为偏好** | 视觉优先（Apple/Google 级审美是开关）· 本地化轻依赖 · 愿意打磨工具本身 |
| **Anti-persona** | ❌ 只想被动接收的囤课党 · ❌ 零配置初阶用户 · ❌ 团队协作企业用户 |
| **一句心声** | *"我不缺资料，我缺一个让我每次打开都感觉'我心里有数'的地方。"* |

### 3.2 设计边界决策

**个人工具 + 未来可开源**：主画像是自己，但在关键决策（JSON schema 命名、代码结构、密钥分离、配置 UI 化）上保留开源可能性。不做多人协作、不做账号系统，但**代码与数据分离**，未来想开源时只要清空 `data/` 就行。

---

## 4. Strategic Context

### 4.1 个人战略目标（Personal OKR）

> **Objective**：在 AI 产品经理转型的第 2 年完成"**认知资产化**"——把过去一年散落的产品方法论、前端/UI/UX 经验、Agent 开发范式，全部收拢到一个**可调用、可复用、可生长**的个人系统中，彻底终结"学过即忘"的循环。

| KR | 目标 |
|---|---|
| **KR1** | 核心骨架（至少 24 步法 + UI/UX + Agent 开发 三大骨架）完整上线且每张卡片都可用 |
| **KR2** | 90% 以上的真实工作场景（需求分析/方案设计/原型开发）**启动前先打开这个工具** |
| **KR3** | 至少 3 个真实项目的实战经验沉淀在"项目演练场" |
| **KR4** | 职业身份焦虑从"每次遇到问题都自我怀疑"降到"知道去哪里找答案" |

### 4.2 外部时机（Why Now）

1. **AI 协作范式成熟**：Claude Code / Cursor 让个人开发者可以用对话方式完成复杂项目，技术门槛坍塌
2. **Skill / Prompt 即资产**：行业共识正在形成——"Prompt 和 Skill 文档本身就是生产资料"
3. **认知塌方的紧迫性**：混沌课学完已经几个月，记忆衰减进入陡峭曲线；**再拖半年，当前这批知识资产基本归零**
4. **职业身份关键期**：转型第一年是建立"方法论主导"工作模式的黄金期

### 4.3 竞争定位

**"可调用的个人元能力沉淀系统"** = 全局地图（对抗混沌）+ 卡片即 Skill（对抗静态）+ 双向绑定（对抗割裂）+ 视觉冲击（对抗遗忘）+ 双输入管道（对抗懒惰）+ AI 副驾驶（对抗调用摩擦）

市面上没有任何工具同时满足这 6 点，因为它们都**不是为"跨界并行成长者"这个身份**设计的。

---

## 5. Solution Overview

### 5.1 Information Architecture（信息架构）

#### 顶层导航 · 3 个一级 Tab

| Tab | 名称 | 一句话 | 打开后看到什么 |
|---|---|---|---|
| **1** | **📚 知识图书馆**（Atlas） | 所有通用知识原子的全局地图 | 可切换骨架的宏观矩阵视图。默认骨架记忆上次停留位置 |
| **2** | **🛠 项目演练场**（Playground） | 真实项目的实战沉淀空间 | 项目卡片列表，点进查看项目引用的原子与 Practice |
| **3** | **🌱 成长档案**（Growth） | 个人使用/学习数据可视化 | 热力图 · Top 原子 · 月度报告 · 心理自查——**反焦虑情绪面板** |

#### 整体布局

```
┌─────────────────────────────────────────────────┐
│  🧭 CCL Atlas                [🌗]  [+]  [⚙️] │
├──────────┬──────────────────────────────────────┤
│          │  📚 知识图书馆  🛠 演练场  🌱 成长   │
│  骨架    ├──────────────────────────────────────┤
│ ─────    │                                      │
│ ★产品24  │   [当前 Tab 的主视图]                 │
│ ·UI/UX   │                                      │
│ ·Agent   │                                ┌──┐  │
│ ·+ 新骨架│                                │💬│  │
│          │                                └──┘  │
└──────────┴──────────────────────────────────────┘
                                       右下角浮动 Copilot
```

- **左侧常驻骨架列表**：所有骨架一眼可见，当前骨架高亮，底部 `+ 新骨架` 支持扩展
- **顶部 🌗 主题切换** + **[+] 新建原子** + **[⚙️] 设置** 常驻
- **右下角 💬 AI Copilot 浮动按钮**（可拖拽 · ⌘J 快捷键）

### 5.2 Data Model（数据模型）

#### 文件夹结构

```
ccl_atlas/
├── src/                          前端源码 (Vite + React + TS)
├── src-tauri/                    Tauri Rust 壳
│
├── data/                         所有数据（Git 友好）
│   ├── frameworks/               骨架层
│   │   ├── product-innovation-24.json
│   │   ├── ui-ux-patterns.json
│   │   └── agent-development.json
│   │
│   ├── atoms/                    知识原子层（通用层）
│   │   ├── product-innovation-24/
│   │   │   ├── 01-trend-scanning/
│   │   │   │   └── pest-c-radar.json
│   │   │   ├── 02-voc/
│   │   │   │   ├── voc-overview.json
│   │   │   │   ├── jtbd.json
│   │   │   │   └── kano.json
│   │   │   └── ...
│   │   ├── ui-ux-patterns/
│   │   └── agent-development/
│   │
│   ├── projects/                 项目演练场层
│   │   └── project-001-smart-meeting/
│   │       ├── meta.json
│   │       └── practices/
│   │           ├── jtbd-practice-001.json
│   │           └── kano-practice-001.json
│   │
│   ├── index/
│   │   └── knowledge-index.json       自动生成索引
│   │
│   └── growth/
│       ├── usage-log.jsonl            追加式使用日志
│       ├── psychological-log.json     心理自查数据
│       └── monthly-snapshots/
│
├── config/
│   └── llm.config.json               LLM Provider 配置（非敏感字段）
│
├── skills/                       Claude Code 协作契约
│   ├── CLAUDE.md                     (复制到项目根，自动加载)
│   ├── ingest-atom.skill.md          原始笔记→原子
│   ├── ingest-practice.skill.md      经验→项目实战
│   ├── copilot.system.md             Copilot 系统 Prompt
│   └── schemas/
│       ├── framework.schema.json
│       ├── atom.schema.json
│       └── practice.schema.json
│
├── CLAUDE.md                     ← 根目录项目记忆（Claude Code 自动加载）
├── docs/
│   └── PRD.md                    ← 本文档
└── package.json
```

#### 核心数据结构

**① Framework（骨架）**

```json
{
  "id": "product-innovation-24",
  "name": "产品创新 24 步法",
  "nameEn": "Product Innovation 24 Steps",
  "source": "混沌 AI 创新院 · 李亦舟",
  "version": "2.0",
  "layoutType": "matrix",
  "matrix": {
    "rows": 4,
    "columns": 6,
    "columnHeaders": [
      { "id": "discover", "name": "Discover 发现", "color": "#A78BFA" },
      { "id": "define",   "name": "Define 定义",   "color": "#60A5FA" },
      { "id": "ideate",   "name": "Ideate 创意",   "color": "#34D399" },
      { "id": "develop",  "name": "Develop 开发",  "color": "#FBBF24" },
      { "id": "validate", "name": "Validate 验证", "color": "#FB923C" },
      { "id": "evolve",   "name": "Evolve 进化",   "color": "#F472B6" }
    ],
    "cells": [
      { "stepNumber": 1, "column": "discover", "row": 1, "name": "趋势扫描", "nameEn": "Trend Scanning", "tagline": "PEST-C Radar", "atomCategoryPath": "product-innovation-24/01-trend-scanning" }
      /* ... 24 cells total */
    ]
  },
  "createdAt": "2026-04-07",
  "updatedAt": "2026-04-07"
}
```

**② Atom（知识原子）**

```json
{
  "id": "atom_jtbd_01",
  "schemaVersion": 1,
  "name": "Jobs To Be Done (JTBD)",
  "nameEn": "Jobs To Be Done",
  "frameworkId": "product-innovation-24",
  "cellId": 2,
  "tags": ["VOC", "用户研究", "需求洞察"],
  "parentAtomId": "atom_voc_overview",
  "relationType": "child",

  "coreIdea": "用户不是在购买产品，而是在'雇佣'产品来完成某个他们想做的事 (Job)...",
  "whenToUse": "用户调研 · 需求优先级评估 · 竞品差异化分析 · 市场机会识别",
  "keySteps": [
    "1. 定义场景与用户类型",
    "2. 访谈用户，挖掘他们'雇佣'现有方案想完成的任务",
    "3. 区分功能性/情感性/社交性 Job",
    "4. 映射未被满足的 Job"
  ],

  "aiSkillPrompt": "你是一位精通 JTBD 的资深产品研究员...\n场景：{请在此处填入}",

  "example": {
    "title": "经典案例 · 奶昔的 Job",
    "content": "克里斯坦森团队发现，早高峰奶昔的真实 Job 是..."
  },

  "bookmarks": [
    { "id": "bm_01", "type": "link", "title": "HBR 经典原文", "url": "https://hbr.org/...", "note": "Clayton Christensen", "addedAt": "2026-04-07" },
    { "id": "bm_02", "type": "text", "title": "我在 X 项目中的体会", "content": "...", "addedAt": "2026-03-15" }
  ],

  "stats": {
    "usedInProjects": ["project-001-smart-meeting"],
    "lastUsedAt": "2026-04-05",
    "useCount": 3
  },

  "createdAt": "2026-04-07",
  "updatedAt": "2026-04-07"
}
```

**③ Practice（项目实战沉淀）**

```json
{
  "id": "practice_001",
  "schemaVersion": 1,
  "projectId": "project-001-smart-meeting",
  "atomId": "atom_jtbd_01",
  "title": "用 JTBD 分析智能会议助手的真实用户需求",
  "context": "项目立项阶段，需要回答：这个产品到底在解决什么 Job？",
  "executionSummary": "访谈 5 位目标用户，发现真实 Job 是...",
  "keyInsights": [
    "功能性 Job：快速回顾决议",
    "情感性 Job：摆脱'怕错过'的焦虑",
    "社交性 Job：向老板证明会议被认真对待"
  ],
  "artifacts": [
    { "type": "text", "content": "完整访谈记录摘要..." },
    { "type": "link", "title": "原始访谈录音", "url": "..." }
  ],
  "whatWorked": "情感性 Job 的挖掘让我们重新定义了 slogan",
  "whatFailed": "样本偏小，社交性 Job 判断不稳",
  "status": "completed",
  "createdAt": "2026-04-05",
  "updatedAt": "2026-04-07"
}
```

**④ Project meta.json**

```json
{
  "id": "project-001-smart-meeting",
  "name": "智能会议助手",
  "slug": "smart-meeting",
  "description": "为远程会议提供实时纪要与决议追踪",
  "status": "define",
  "innovationStage": "define",
  "stageHistory": ["discover", "define"],
  "pinnedAtoms": [
    { "atomId": "atom_jtbd_01", "pinnedAt": "2026-04-01", "note": "立项分析" },
    { "atomId": "atom_kano_01", "pinnedAt": "2026-04-03", "note": "功能优先级" }
  ],
  "createdAt": "2026-03-28",
  "updatedAt": "2026-04-07"
}
```

> 💡 **关键决策**：
> - **引用模式**（不复制）：项目只存 `atomId`，原子本身是单一来源
> - **跨骨架项目**：`pinnedAtoms` 可指向任意骨架的原子
> - **双字段阶段**：`innovationStage`（硬绑 24 步法，用于阶段条）+ `status`（自由标签，用于筛选）
> - **父子关系**：单父模型 `parentAtomId`，未来可向后兼容扩展为 `relations[]`

### 5.3 渐进披露（Progressive Disclosure）· 4 层模型

这是整个卡片 UX 的核心原则——**尊重有限的注意力**。

#### Level 0 · 矩阵格子（Atlas 最小单元）

```
┌─────────────────┐
│  02             │  步骤号
│  用户声音       │  名称
│  Goal-VOC       │  英文副标题
│  ●●● 3          │  拥有感徽章
└─────────────────┘
```

#### Level 1 · Hover/长按预览

```
╭──────────────────────────────────────╮
│ 02 · 用户声音 Goal-VOC               │
│ 倾听用户原声而非需求，挖掘未被       │
│ 言说的真实动机。                     │
│ 📦 包含 3 个方法论:                  │
│    VOC · JTBD · KANO                 │
╰──────────────────────────────────────╯
```

#### Level 2 · 点击后默认视图（⭐ 调用三件套）

```
╭──────────────────────────────────────────────────────────╮
│  ← 返回   Jobs To Be Done (JTBD)                   [⋯]  │
│  ───────────────────────────────────────────────────     │
│                                                          │
│  💡 核心理念                                            │
│  用户不是在购买产品，而是在"雇佣"产品完成 Job...         │
│                                                          │
│  🎯 什么时候用                                          │
│  用户调研 · 需求优先级评估 · 竞品差异化分析             │
│                                                          │
│  ✨ AI Skill Prompt                  [📋 复制] [🎯 填充] │
│  ╭─────────────────────────────────────────╮           │
│  │ 你是一位精通 JTBD 的资深产品研究员...   │           │
│  │ (折叠前 3 行,点击展开全部)              │           │
│  ╰─────────────────────────────────────────╯           │
│                                                          │
│  ─────────────────────────────────────────              │
│  ▸ 关键步骤                                  (点开展开) │
│  ▸ 经典案例                                  (点开展开) │
│  ▸ 相关原子(父级 VOC · 兄弟 KANO)            (点开展开) │
│  ▸ 个人收藏夹 (5)                            (点开展开) │
│  ▸ 使用统计 · 用于 2 个项目                  (点开展开) │
╰──────────────────────────────────────────────────────────╯
```

**核心原则**：
- **三件套永远直出**：核心理念 + 何时用 + Skill Prompt ——点开卡片的 90% 场景
- **其他 Section 全部折叠**，带徽章提示（如"收藏夹 (5)"）
- **Skill Prompt 折叠前 3 行**，一键复制永远在最近位置
- **展开/收起用 Framer Motion spring 动画**，Apple-like 质感

#### Level 3 · 全部展开（`[⋯] → 展开全部` 主动触发）

### 5.4 核心交互

#### 🔍 发现入口（4 种并存）

| 入口 | 场景 | 交互 |
|---|---|---|
| **① 视觉扫描** | "我大概记得在 Discover 阶段..." | 看 Atlas 矩阵，按颜色列扫 |
| **② 全局搜索 ⌘K** | "我记得 JTBD 这个词" | Spotlight 风格命令面板 · Fuse.js 模糊匹配 |
| **③ 标签过滤** | "我想看所有'用户研究'相关" | Atlas 顶部 tag chips 过滤器 |
| **④ 场景式推荐** | "我要做用户调研" | 顶部场景搜索框 · 纯规则匹配（tags + keyword + whenToUse） |

#### ➕ 创建入口（2 种 · v1）

| 入口 | 触发 | 流程 |
|---|---|---|
| **① 全局浮动 [+]** | 顶部按钮常驻 | 弹窗手动选骨架/阶段/填字段 |
| **② 格子级快速新建** | 矩阵格子 hover 出现 [+] | 预填骨架+阶段，只填核心字段 |

**创建表单同样贯彻渐进披露**：第一屏 5 字段（名称/副标题/核心理念/何时用/Skill Prompt），其他 10+ 字段折叠在"▸ 进阶字段"。

#### 📋 Skill Prompt 使用（一键复制 + 填充后复制）

- **`[📋 复制]`**：原样复制，自己去 AI 对话替换占位符
- **`[🎯 填充后复制]`**：弹小对话框填 `{请在此处填入}` 后复制完整 prompt
- **每次复制自动写入 `usage-log.jsonl`**（无感追踪，喂养成长档案）

### 5.5 AI 副驾驶（Copilot）

#### 定位

> 不是"又一个聊天机器人"，而是 **"植入在工具内部、知道你全部知识库的场景导航员"**。它回答的不是 "JTBD 是什么"，而是 **"我现在遇到这个痛点，应该打开哪张卡片"**。

#### v1 能力边界 · 推荐 + 跳转

- ✅ 理解用户场景描述
- ✅ 基于 `knowledge-index.json` 推荐 3-5 张原子
- ✅ 在对话里生成"打开这张卡片"按钮，点击直接跳转到 Atlas 并展开
- ✅ 支持"项目上下文对话"（在项目页打开 Copilot 时自动注入该项目的原子与 Practice）
- ❌ v1 **不做写入**（不创建/编辑原子或 Practice）——规避幻觉风险，v1.5 后开放

#### 配置架构

**配置文件 `config/llm.config.json`**（非敏感字段，可 git）

```json
{
  "activeProvider": "anthropic",
  "providers": {
    "anthropic": {
      "enabled": true,
      "model": "claude-sonnet-4-6",
      "baseUrl": "https://api.anthropic.com",
      "maxTokens": 2048,
      "temperature": 0.3
    },
    "openai": { "enabled": false, "model": "gpt-4o-mini", "baseUrl": "https://api.openai.com/v1" },
    "custom": { "enabled": false, "model": "", "baseUrl": "" }
  },
  "copilot": {
    "systemPromptRef": "./skills/copilot.system.md",
    "maxContextAtoms": 30,
    "enableAutoNavigate": true,
    "logConversations": true
  }
}
```

**API Key 存储**：Tauri Keychain Plugin → Mac Keychain / Windows Credential Manager。**永不写入任何 JSON 文件**。

#### 设置面板 UI（`⚙️ → 🤖 AI 副驾驶`）

```
Provider   [Anthropic ▾]
模型名称 * [claude-sonnet-4-6]
Base URL   [https://api.anthropic.com]
API Key *  [●●●●●●●●●]  [👁]  🔒 存储在系统密钥环
─────────────────────────────
Max Tokens       [2048]
Temperature      [0.3]
注入原子上限     [30]
自动跳转卡片     [✅]
记录对话日志     [✅]
─────────────────────────────
[🧪 测试连接]          [取消]  [保存]
```

- **Provider = Custom** 时允许填任意 OpenAI-compatible baseUrl（Ollama/DeepSeek/本地代理）
- **`[🧪 测试连接]`** 发最小 test prompt，即时反馈
- **首次启动若未配置**，自动弹出作为引导步骤

#### 知识库索引

**`data/index/knowledge-index.json`**（轻量摘要，不含正文）

- **自动生成**：混合策略——启动时全量扫描一次 + 每次保存原子/项目时增量更新
- **双受益**：① Copilot context 注入源 ② ⌘K Spotlight 的数据源
- **Claude Code 也消费**：在 Claude Code 里问"知识库有没有讲 X 的原子"时，它读同一份 index

### 5.6 项目演练场（Playground）

#### 项目主页布局

```
╭──────────────────────────────────────────────────────────╮
│  ← 返回  🛠 智能会议助手              [状态: Define]   │
├──────────────────────────────────────────────────────────┤
│  📌 项目所处阶段                                         │
│  ●───●───○───○───○───○                                  │
│  发现 定义 创意 开发 验证 进化                           │
│  ─────────────────────────────────────────              │
│  📚 引用的方法论 (Pinned Atoms)           [+ 引入]       │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │ JTBD     │ KANO     │ 价值主张 │ + 引入   │          │
│  │ 2 实践   │ 1 实践   │ 0 实践   │          │          │
│  └──────────┴──────────┴──────────┴──────────┘          │
│  ─────────────────────────────────────────              │
│  📝 实战沉淀 (Practices)          [+ 新建实战记录]       │
│  ▸ [JTBD] 用户调研 · 2026-04-05   状态:✅完成           │
│  ▸ [KANO] 功能优先级 · 2026-04-07  状态:🟡进行中        │
╰──────────────────────────────────────────────────────────╯
```

#### 双向绑定机制

当一条 Practice 被保存时：

```
1. 写入 data/projects/<projectId>/practices/<practiceId>.json
2. 自动更新 data/atoms/.../jtbd.json 中的 stats.usedInProjects[]
3. 更新 data/index/knowledge-index.json
```

三条跳转回路同时运转：
- **原子卡片 →「用于 2 个项目」→ 点击跳项目实战列表**
- **项目主页 → pinnedAtoms → 点击跳原子卡片**
- **Copilot 推荐 → 自动优先推荐"本项目已引用的原子"→ 一键跳转**

### 5.7 双输入管道 · 三层契约架构

```
┌─────────────────────────────────────────────────────┐
│  契约 1: JSON Schema（结构契约）                    │
│  位置: skills/schemas/*.schema.json                 │
│  作用: Web UI 做表单校验 + Claude Code 生成合规 JSON│
├─────────────────────────────────────────────────────┤
│  契约 2: Ingest Skill（流程契约）                   │
│  位置: skills/ingest-atom.skill.md                  │
│         skills/ingest-practice.skill.md             │
│  作用: 告诉 Claude Code "原始笔记 → 合规 JSON"      │
│       的完整决策流程                                │
├─────────────────────────────────────────────────────┤
│  契约 3: CLAUDE.md（项目记忆契约）                 │
│  位置: 项目根目录 /CLAUDE.md（Claude Code 自动加载）│
│  作用: 让 Claude Code 在此目录下天然知道项目的一切 │
└─────────────────────────────────────────────────────┘
```

#### 管道 A · Claude Code 协作入库

**流程**：用户丢一段笔记/文章/对话总结给 Claude Code → 说"帮我沉淀到 ccl_atlas" → Claude Code 按 `ingest-atom.skill.md` 规范（7 步流程：归属诊断 → 结构化提炼 → 父子判断 → Schema 校验 → 写入 → 重建索引 → 汇报）自动生成 JSON 并写入正确位置。

#### 管道 B · Web UI 手动入库

**流程**：点 `[+]` → 选骨架/阶段 → 填表单 → 保存 → 自动校验/写入/重建索引 → UI 即时刷新。

#### 一致性保证

| 环节 | Web UI | Claude Code | 共同依赖 |
|---|---|---|---|
| 字段校验 | React Hook Form + Ajv | 读 schema 后生成 | `skills/schemas/*.schema.json` |
| 文件写入 | Tauri `@tauri-apps/api/fs` | Node `fs` | 同一个 `data/` 目录 |
| 索引重建 | 保存后触发 `rebuildIndex()` | 写完调 CLI `npm run reindex` | `scripts/rebuild-index.ts` |
| 流程规范 | 表单结构对齐 skill 字段 | 直接 follow skill | `skills/ingest-atom.skill.md` |

---

## 6. Success Metrics

### 6.1 Primary Metric（唯一必须移动的指标）

> **"方法论主动调用率"** = 真实工作启动前主动打开工具的次数 / 真实工作总启动次数

| 时点 | 现状 | 目标 |
|---|---|---|
| 起点 | ≈ 0% | — |
| 30 天 | — | ≥ 50% |
| 90 天 | — | ≥ 80% |

**测量方式**：`usage-log.jsonl` 自动记录每次"打开/搜索/复制 prompt"事件；成长档案 Tab 自动生成周/月热力图。

**为什么是这个指标**：它是 Phase 2 核心痛点的**根因打击点**——只要这个比率上去，A/C/D/E 痛点自动缓解，B 痛点因"看见自己真的在用"也显著下降。

### 6.2 Secondary Metrics

| 指标 | 90 天目标 | 为什么 |
|---|---|---|
| 知识原子总数 | ≥ 60 | 证明"学过的东西"被挽救 |
| 骨架数量 | ≥ 3（产品/UI·UX/Agent） | 证明跨领域承载真的兑现 |
| 项目演练场活跃项目数 | ≥ 3 | 证明双向绑定有真实 usage |
| 每月新增 Practice | ≥ 5 | 证明实战经验持续沉淀 |
| Copilot 调用次数/周 | ≥ 5 | 证明 AI 副驾驶成为习惯 |
| 收藏夹条目总数 | ≥ 100 | 证明零散知识不再流失 |

### 6.3 Guardrail Metrics（不许变差的底线）

| 指标 | 阈值 | 如果突破说明 |
|---|---|---|
| 应用启动时间 | < 1.5s | 索引膨胀或代码退化 |
| 单次卡片打开到可交互 | < 200ms | 渲染退化 |
| 数据目录体积 | < 50MB/年 | 日志或收藏夹堆积过多 |
| 周使用天数 | ≥ 4 天/周 | **工具正在退化成 Obsidian** |

### 6.4 Psychological Metric（反焦虑专项 · 月度自查）

成长档案 Tab 每月末弹出 3 题：

1. 过去一个月"方法论调不出来"的频率：**↓ 下降 / → 不变 / ↑ 上升**
2. 过去一个月对"能胜任 AI PM"的信心：**↓ 下降 / → 不变 / ↑ 上升**
3. 若现在合上工具纯靠记忆工作一周：**更慌 / 同前 / 更笃定**

**90 天目标**：
- 第 1 题 ↓ 占比 ≥ 70%
- 第 2 题 ↑ 占比 ≥ 50%
- 第 3 题"更笃定" ≥ 50%

**记录**：`data/growth/psychological-log.json`，成长档案显示历史曲线。

> 💡 这项虽主观，但因 Phase 2 最痛的是 B（职业身份焦虑），不衡量它等于**只治症状不验证病根**。

---

## 7. User Stories & Requirements

### 7.1 Epic Hypothesis

> **IF** we build a local-first desktop app that organizes personal methodology knowledge into a cross-framework atom library, binds it bidirectionally to real project practices, and exposes each atom as an AI-ready Skill Prompt (plus an LLM Copilot that can navigate the library),
>
> **THEN** 跨界并行成长者将从"学过即忘"转向"工作前主动调用方法论"，
>
> **AS MEASURED BY** Primary Metric 方法论主动调用率 ≥50% @Day30 / ≥80% @Day90，职业身份焦虑主观曲线下行。

### 7.2 Story Map

```
        ┌────────────┬────────────┬────────────┬────────────┬────────────┐
        │ 首次使用    │ 日常查阅   │ 日常沉淀   │ 项目实战   │ 复盘成长   │
━━━━━━━━┼────────────┼────────────┼────────────┼────────────┼────────────┤
v1 MVP  │ US-01~03   │ US-04~08   │ US-09~11   │ US-14~16   │ US-19~20   │
━━━━━━━━┼────────────┼────────────┼────────────┼────────────┼────────────┤
v1.5    │            │ US-21, 24  │ US-22      │            │ US-23      │
━━━━━━━━┼────────────┼────────────┼────────────┼────────────┼────────────┤
v2      │            │ US-25      │ US-26      │ US-27      │ US-28      │
        └────────────┴────────────┴────────────┴────────────┴────────────┘
```

### 7.3 v1 MVP · Must Have（20 个故事）

#### Onboarding 首次使用

**US-01** · 引导页流程
> 作为新用户，首次启动时看到引导页，一步步完成：选数据目录 → 配置 LLM (model/url/key) → 测试连接 → 自动种下 24 步法骨架（空卡片矩阵）。
> **AC**：引导 ≤ 3 分钟；跳过 LLM 配置后仍能用除 Copilot 外的所有功能。

**US-02** · 默认骨架预置
> 作为用户，首次启动后产品创新 24 步法骨架自动预置，6×4 矩阵已定义完整 cells（但内容为空），可直接点格子填充。
> **AC**：`frameworks/product-innovation-24.json` 含 24 个 cell 定义，无原子；矩阵立即可视化渲染。

**US-03** · 主题切换
> 作为用户，我可一键切换浅/深色主题，设置被记住。
> **AC**：顶栏右上角按钮切换；重启后保留。

#### Consult 日常查阅（核心高频）

**US-04** · Atlas 矩阵视图
> 作为用户，打开知识图书馆看到可切换骨架的 Atlas 矩阵，每格显示步骤号 + 名称 + 原子数徽章。
> **AC**：6×4 矩阵渲染；记忆上次骨架；切换骨架 < 100ms。

**US-05** · 格子 Hover 预览（Level 1）
> 作为用户，hover/长按矩阵格子弹出浮层显示 tagline + 原子列表。
> **AC**：200ms 延迟显示；移动出格子立即隐藏。

**US-06** · 原子卡片默认三件套（Level 2）
> 作为用户，点击格子进入原子卡片，默认只看到核心理念 + 何时用 + Skill Prompt；其他 Section 折叠；Prompt 旁 `[复制] [填充后复制]` 按钮。
> **AC**：
> - 三件套默认展开，其他 Section 以 `▸ 标题 (徽章)` 折叠
> - 复制成功后 toast 反馈并写入 `usage-log.jsonl`
> - 折叠/展开动画 < 300ms，无闪烁

**US-07** · ⌘K Spotlight
> 作为用户，按 `⌘K`/`Ctrl+K` 呼出 Spotlight，可模糊搜索原子名/标签/正文，也可输入场景描述获得规则推荐。
> **AC**：Fuse.js 实现；响应 < 100ms；键盘完全可操作（↑↓ 选择，Enter 打开）。

**US-08** · AI Copilot 对话面板
> 作为用户，按 `⌘J`/`Ctrl+J` 或点右下角 💬 呼出 Copilot；描述场景 → AI 推荐 3-5 张卡片 → 每张有"打开这张卡片"按钮直接跳转 Atlas 并展开。
> **AC**：
> - v1 只推荐+跳转，不写入数据
> - 支持"钉住"面板左右并排显示
> - 对话历史保留 30 天
> - 配置未就绪时显示友好引导去设置面板

#### Ingest 日常沉淀

**US-09** · 新建原子（手动表单）
> 作为用户，点全局 `[+]` 或格子级 `[+]` 打开表单，默认 5 个核心字段，其他折叠。
> **AC**：JSON Schema 校验；保存后自动重建索引；UI 即时刷新；失败时字段级错误提示。

**US-10** · 编辑/删除原子
> 作为用户，可编辑任何字段，删除时二次确认；若被 Practice 引用则警告。
> **AC**：编辑后索引自动更新；删除警告显示被引用的项目列表。

**US-11** · 收藏夹条目
> 作为用户，在原子卡片下添加收藏夹条目（link 或 text）。
> **AC**：数量徽章显示在卡片展开视图；可编辑/删除单条。

#### Practice 项目实战

**US-14** · 创建项目
> 作为用户，创建项目填名称/描述/状态/阶段。
> **AC**：项目列表页卡片网格；支持跨骨架原子引入。

**US-15** · 引入原子到项目
> 作为用户，在项目主页通过 mini Atlas 引入任意骨架的任意原子；引入的原子以卡片列出，显示"N 实践"徽章。
> **AC**：引用模式（不复制）；一个项目可 pin 跨骨架原子；取消 pin 有确认。

**US-16** · 新建 Practice
> 作为用户，在项目下新建 Practice，选原子、填背景+执行摘要；保存后双向绑定自动更新。
> **AC**：保存后原子卡片"使用统计"Section 立即显示新项目链接；`knowledge-index.json` 同步。

#### Growth 复盘成长

**US-19** · 成长档案主视图
> 作为用户，进入成长档案看到近 30 天使用热力图 + Top 5 原子 + 骨架/原子/项目/Practice 总数。
> **AC**：数据来源 `usage-log.jsonl`；渲染 < 500ms。

**US-20** · 月末心理自查
> 作为用户，每月末成长档案弹出 3 题心理自查，答完后存到 `psychological-log.json` 并显示历史曲线。
> **AC**：答案写入成功；设置里可关闭弹出频率。

### 7.4 v1.5 Should Have

- **US-21** · Copilot 对话支持"项目上下文"自动注入项目原子和近期 Practice
- **US-22** · `⌘V` 粘贴 AI 对话内容规则解析为原子草稿
- **US-23** · 成长档案导出月度报告（Markdown/PDF）
- **US-24** · 原子的父子关系 mini 可视化图

### 7.5 v2 Could Have

- **US-25** · Copilot 升级为语义搜索（本地 embedding）
- **US-26** · Copilot 获得写入权限（带二次确认和撤销）
- **US-27** · 项目级 Practice 时间线视图
- **US-28** · 成长档案支持月份对比

### 7.6 响应式设计约束（v1 代码层面）

**v1 桌面端优先，但代码层面尽量响应式**：
- 使用 TailwindCSS breakpoint（`sm md lg xl 2xl`）
- 所有核心布局避免硬编码 px 宽度
- Atlas 矩阵在窄屏下降级为垂直列表
- Copilot 面板在窄屏下改为全屏 modal
- **目标**：未来想发 Vercel 静态网页版（只读模式）时，改动 < 5%

---

## 8. Out of Scope / Dependencies / Risks

### 8.1 Out of Scope（明确不做）

| 功能 | 为什么不做 |
|---|---|
| 云同步 / 账号系统 | 违背本地优先；未来用 Dropbox/iCloud/Git 同步 `data/` 即可 |
| 多人协作 / 分享 | 首要用户是个人；协作引入权限、冲突、云存储爆炸 |
| 移动端原生 App | Tauri 不支持 iOS/Android；v1 先桌面，响应式代码留后路 |
| Copilot 写入知识库 | v1 仅推荐+跳转，规避幻觉风险，v1.5 后开放 |
| 语义搜索 / 向量检索 | v1 Fuse.js + tags 覆盖 80% 场景；v2 升级 |
| 付费 / SaaS | 本工具不以商业化为目标 |
| 社区方法论市场 | 保持"纯个人筛选"的知识库纯度 |
| 粘贴即新建 | 解析规则调试成本高，v1.5 再做 |
| 原子富媒体嵌入 | v1 只存代码片段文本和链接，不嵌 iframe/视频/CodePen |
| 自动备份 / 版本历史 | 交给 git —— `data/` 本身是一个 git repo 就天然有版本 |

### 8.2 Dependencies（依赖）

**技术依赖**

| 类别 | 项目 | 风险等级 |
|---|---|---|
| 桌面壳 | Tauri 2.x + Rust 工具链 | 🟡 中 |
| 前端核心 | Vite + React 18 + TypeScript | 🟢 低 |
| UI 库 | TailwindCSS + shadcn/ui | 🟢 低 |
| 动画 | Framer Motion | 🟢 低 |
| 搜索 | Fuse.js | 🟢 低 |
| LLM | @anthropic-ai/sdk | 🟡 中 |
| 安全存储 | Tauri Keychain Plugin | 🟡 中 |
| 校验 | Ajv | 🟢 低 |
| 命令面板 | cmdk | 🟢 低 |
| Markdown | react-markdown + rehype-katex | 🟢 低 |
| 代码高亮 | Shiki | 🟢 低 |
| 状态 | Zustand | 🟢 低 |

**外部依赖**

- **Anthropic API Key**（Copilot 必需，不影响其他功能）
- **OS**：macOS 11+ / Windows 10+（Tauri 最低要求）
- **WebView**：macOS WebKit / Windows WebView2（Win10/11 自带）
- **Rust 工具链**：首次安装一次 `rustup`

### 8.3 Risks & Mitigations

| # | 风险 | 等级 | 对策 |
|---|---|---|---|
| **R1** | 项目做出来但不打开，成为 Obsidian 2.0 | 🔴 高 | 视觉冲击力 + 成长档案反焦虑面板 + Primary Metric 监控；若 30 天调用率 < 30%，回 Phase 2 重诊断 |
| **R2** | Tauri/Rust 工具链踩坑 | 🟡 中 | PRD 写清楚环境步骤；遇阻 fallback 到 Electron |
| **R3** | 数据结构设计过死，加字段时需迁移 | 🟡 中 | 每个 JSON object 加 `schemaVersion` 字段；迁移脚本脚手架 |
| **R4** | Copilot 幻觉推荐错方法论 | 🟡 中 | v1 只推荐+跳转不写入；system prompt 明确要求"宁可不推荐也不要编造" |
| **R5** | 单父子关系模型不够 | 🟢 低 | 未来扩展为 `relations[]` 数组即可，向后兼容 |
| **R6** | 单人开发范围膨胀 | 🔴 高 | **严格按 v1 MVP 20 story 执行**；新想法入 `docs/ideas.md`；硬截止"两周跑通 MVP" |
| **R7** | API Key 泄露 | 🟡 中 | Tauri Keychain + `.env.example` + `.gitignore` + README 警告 |
| **R8** | 索引膨胀拖慢启动 | 🟢 低 | 索引只存摘要不存正文；100 原子预计 < 50KB |

### 8.4 Open Questions（开发中迭代）

1. **数据目录选择**：首次启动是"强制选目录"还是"默认 `~/CCL-PM-Tool-Data`"？→ 倾向后者（零决策），设置里可改
2. **热力图粒度**：日/周/月？→ v1 先做日热力图（GitHub 风）
3. **骨架颜色主题**：新骨架配色？→ v1 预设 6 色 palette，新骨架默认随机
4. **Copilot 对话历史**：保留多久？分项目独立？→ v1 全局 30 天历史
5. **只读 Web 版**：v1.5 是否挂 Vercel？→ v1 发布后看使用意愿

---

## 9. Appendix · 视觉线框与技术栈

### 9.1 视觉风格

**基调**：Linear / Raycast 现代变体（Apple/Google 风的开发者友好变体）

- **字体**：Inter（正文）+ JetBrains Mono（代码）+ 系统 SF Pro（macOS fallback）
- **间距**：8pt grid system
- **圆角**：`rounded-xl` 为主（12px），卡片 `rounded-2xl` (16px)
- **阴影**：柔和多层 `shadow-sm / shadow-md`，避免硬阴影
- **毛玻璃**：Copilot 面板、⌘K Spotlight、Hover 浮层使用 `backdrop-blur-lg`
- **动画**：Framer Motion spring `stiffness: 300, damping: 30`，所有展开/收起 150-300ms
- **色板**：参考截图 · 产品 24 步法每列一色（紫 / 蓝 / 绿 / 黄 / 橙 / 粉）

### 9.2 技术栈（最终锁定）

```
📦 前端
├─ Vite 5 + React 18 + TypeScript 5
├─ TailwindCSS 3 + shadcn/ui
├─ Framer Motion 11         (动画)
├─ Zustand                  (状态管理)
├─ React Router 6           (路由)
├─ Lucide React             (图标)
├─ Shiki                    (代码高亮 · UI/UX 骨架用)
├─ react-markdown + rehype  (Markdown 渲染)
├─ Fuse.js                  (⌘K 本地模糊搜索)
├─ cmdk                     (命令面板组件)
├─ Ajv                      (JSON Schema 校验)
└─ @anthropic-ai/sdk        (Copilot LLM)

📦 桌面壳
├─ Tauri 2.x                (Rust 壳 · 自动生成 .dmg/.msi)
├─ @tauri-apps/api/fs       (原生文件读写)
├─ @tauri-apps/api/dialog   (目录/文件对话框)
└─ tauri-plugin-keychain    (API Key 加密存储)

📦 数据
└─ 纯 JSON 文件 + JSON Schema

📦 Claude Code 集成
├─ /CLAUDE.md               (项目根记忆 · 自动加载)
├─ /skills/ingest-*.skill.md (沉淀流程规范)
├─ /skills/copilot.system.md (Copilot 人格)
└─ /skills/schemas/*.json    (结构契约)
```

### 9.3 开发节奏建议（仅供参考）

**两周跑通 MVP 骨架硬截止**：

| 阶段 | 交付 |
|---|---|
| **Week 1 前半** | 项目脚手架 · Tauri 打通 · Atlas 矩阵视图（假数据）· 主题切换 |
| **Week 1 后半** | 原子卡片渐进披露（Level 0-3）· JSON Schema + Ajv 校验 · 新建原子表单 |
| **Week 2 前半** | 项目演练场 · 双向绑定 · ⌘K Spotlight |
| **Week 2 后半** | AI Copilot（配置面板 + 对话 + 跳转）· 成长档案基础版 · 打包 .dmg/.msi |

**之后只加 polish，所有新想法入 `docs/ideas.md`**——严格执行 R6 对策。

### 9.4 引用与致谢

- **产品创新 24 步法**： 2026 © All Rights Reserved
---

**文档结束**

> 🏁 本 PRD 由 8 阶段结构化工作坊产出，所有设计决策均经过用户确认。
>
> **下一步**：进入开发阶段。建议以 `docs/PRD.md` 为唯一真相源，任何新想法先进入 `docs/ideas.md`，严防 v1 范围膨胀。
