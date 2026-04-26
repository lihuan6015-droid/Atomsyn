# OpenSpec · Atomsyn 变更提案规范

> **一句话**: `openspec/` 是 Atomsyn 的工程契约层 —— 所有功能改动、架构调整、CLI/Skill 接口变更都必须先在这里写一份提案，然后再动代码。
>
> **创建日期**: 2026-04-26
> **维护人**: 项目主 agent + 用户共同维护

---

## 1 · openspec/ 是什么

`openspec/` 是 Atomsyn 的**工程契约层**。它和 `docs/` 是互补关系，不重叠：

| 目录 | 性质 | 内容 | 节奏 |
|---|---|---|---|
| `docs/` | **叙事 / 历史层** | PRD、framing(战略锚点)、releases、mockups、会议纪要、ideas 库 | 长期、缓慢演化、偏读者视角 |
| `openspec/` | **工程契约层** | 变更提案 (proposal/design/tasks/decisions) + 稳定接口契约 (specs) | 快节奏、强结构、偏执行视角 |

简单说：
- `docs/` 回答 **"为什么这是个值得做的产品" / "这个版本卖什么故事"**
- `openspec/` 回答 **"这次改动具体改什么、改成什么样、谁验证"**

---

## 2 · 什么时候要发起一次 change

只要满足下面**任意一条**，就应该新建一份 change：

1. **新增用户可见功能** —— 哪怕只是一个新页面、一条新 CLI 子命令
2. **修改稳定接口** —— `atomsyn-cli` 的命令面、Skill 触发条件、JSON Schema、API 路由
3. **架构性调整** —— 数据流向、模块拆分、Tauri 双通道路由变更
4. **数据迁移** —— 任何会动到 `data/` 目录现有结构的改动
5. **跨多文件的实施工作** —— 即便是优化或重构，只要超过 3-4 个文件、需要先讨论方案的，都算

**反过来**, 下面的情况**不需要**走 change 流程：
- 单文件 bug 修复
- typo / 文案微调 / 注释补充
- 纯 CSS / 视觉细节 polish (没改组件结构)
- 内部工具脚本的小调整

> 拿不准时倾向于"先写一份 proposal"。一份不到 200 行的 proposal 比一次方向跑偏的实施便宜得多。

---

## 3 · Change 生命周期

```
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌──────────────────┐   ┌────────────┐   ┌────────────┐
│  💡 idea   │ → │  proposal  │ → │   review   │ → │ design + tasks   │ → │ implement  │ → │  archive   │
│            │   │            │   │            │   │ + decisions      │   │            │   │            │
│ ideas-     │   │ proposal   │   │ 跟用户/AI  │   │ HOW + ADR        │   │ 按 tasks   │   │ archive/   │
│ backlog.md │   │ .md (WHY+  │   │ 对齐 WHY   │   │ + 任务清单        │   │ 推进、勾选 │   │ <year>/    │
│            │   │ WHAT)      │   │ 范围       │   │                  │   │            │   │ <month>/   │
└────────────┘   └────────────┘   └────────────┘   └──────────────────┘   └────────────┘   └────────────┘
```

**6 个阶段的产物**:

| 阶段 | 状态值 | 必交付物 | 谁参与 |
|---|---|---|---|
| idea | 不在 openspec/ 内 | `docs/ideas-backlog.md` 一行条目 | 用户 |
| proposal | `proposed` | `proposal.md` | 主 agent + 用户 |
| review | `proposed` | proposal 反复迭代版 | 主 agent + 用户 (+ 必要时调用 `/plan-ceo-review` / `/plan-eng-review`) |
| design + tasks | `approved` | `design.md` + `tasks.md` + `decisions.md` 初稿 | 主 agent (+ 调用 `/plan-eng-review` 锁架构) |
| implement | `in-progress` | 代码 PR + tasks 勾选 + decisions 持续追加 | 子 agent (按需 spawn) |
| archive | `archived` | 整个 change 目录搬到 `archive/` + `docs/plans/` 的叙事追加 | 主 agent |

---

## 4 · 命名规范

### Change ID 格式

```
YYYY-MM-<short-slug>
```

- `YYYY-MM` 是**发起月份** (不是预计完成月份)
- `<short-slug>` 用 kebab-case，**不超过 4 个英文单词**，对人友好

**好的例子**:
- `2026-04-bootstrap-skill` —— 引导技能初始化
- `2026-05-mentor-radar` —— 导师模式雷达图
- `2026-06-cli-ingest-batch` —— CLI 批量沉淀

**糟糕的例子**:
- `2026-04-feat-1` (没有信息量)
- `add-mentor-mode-with-radar-and-trigger-rewrite` (太长)
- `2026-04-MentorRadar` (大小写不统一)

### 文件命名

每个 change 目录**内部**永远是这四个固定文件名：

```
proposal.md
design.md
tasks.md
decisions.md
```

不要发明新文件名 (如 `notes.md`、`brainstorm.md`)。如果实在需要附属材料，建一个 `attachments/` 子目录放进去。

---

## 5 · 目录结构

```
openspec/
├── README.md                  本文件
├── _template/                 复制粘贴用的模板 (永远不直接改它)
│   ├── proposal.md
│   ├── design.md
│   ├── tasks.md
│   └── decisions.md
├── changes/                   进行中的提案 (status: proposed / approved / in-progress)
│   └── <change-id>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── decisions.md
├── archive/                   已交付的提案 (status: archived)
│   └── <year>/
│       └── <month>/
│           └── <change-id>/   原封不动搬过来
├── specs/                     稳定的跨 change 长期契约
│   ├── README.md              specs/ 与 changes/ 的关系
│   ├── cli-contract.md        atomsyn-cli 命令稳定接口
│   ├── skill-contract.md      三个 Skill 的稳定契约
│   └── data-schema.md         顶层数据形态总览
└── hooks/                     守卫脚本 (可选, 当前为空)
```

**目录与状态的对应关系**:
- `changes/<id>/` —— change 还在路上 (proposed / approved / in-progress)
- `archive/<year>/<month>/<id>/` —— change 已结题 (archived)
- 进入 archive 后**不再编辑**该目录下的文件 (如需修正用 superseded change)

---

## 6 · 怎么发起一个新 change (5 步)

### Step 1 · 在 backlog 里筛一下

在 `docs/ideas-backlog.md` (没有就先建) 里找到对应的想法条目，确认它值得做。
如果 backlog 里没有，先回到那里写一行，再回来。

### Step 2 · 复制模板

```bash
cp -r openspec/_template openspec/changes/2026-04-<slug>/
```

(把 `2026-04-<slug>` 替换成你的真实 change ID)

### Step 3 · 写 proposal.md (WHY + WHAT)

只填 `proposal.md`，**先不要碰** design/tasks/decisions。重点回答：
- 这是个什么问题
- 我们打算怎么解 (一句话, 不展开 HOW)
- 范围边界 (in / out of scope)
- 怎么知道做对了 (success metrics)

写完拿给用户对齐。如果 WHY 没拍板，**绝不动 design**。

### Step 4 · 补 design / tasks / decisions

WHY/WHAT 拍板后，进入 HOW：
- `design.md` —— 架构图、数据流、决策矩阵 (这是文章, 写给未来的自己看)
- `tasks.md` —— 拆解成可独立交付的 checkbox (这是清单, 写给执行者用)
- `decisions.md` —— 关键技术抉择的 ADR (这是记账本, 写给未来的考古学家看)

design 阶段可以调用 gstack 的 `/plan-eng-review`、`/plan-design-review`、`/plan-ceo-review` 来交叉评审。

### Step 5 · 实施 → 归档

按 tasks 推进。每勾掉一个 task 提交一次 commit，commit message 引用 `change-id`。
全部完成且通过验证后：

```bash
year=2026
month=04
mv openspec/changes/2026-04-<slug> openspec/archive/$year/$month/
```

然后在 `docs/plans/<milestone>.md` 里追加该 change 的**叙事性总结** (1-3 段)，让未来的人能不读 spec 也理解这次改了什么以及为什么。

---

## 7 · Quality Bar (一份合格提案的硬标准)

下面 7 条任何一条不达标，proposal 都不算就绪 (review 阶段会被打回)：

1. **WHY 一句话能讲清** —— 复杂的 WHY 通常是没想清楚
2. **范围明确** —— 必须写 in-scope / out-of-scope，否则会越界
3. **北极星对齐** —— 必须回答：这个 change 落在仓库 / 结构 / 教练哪一层？怎么喂养其他层？
4. **至少 2 个备选方案** —— 没考虑过替代方案的提案是脑子打开了一半就开始写
5. **风险已点名** —— 已知风险 + 待澄清问题，没有未知就是最大的未知
6. **Success Metrics 可观测** —— "用户体验更好"不算指标; "成长档案的认知洞察卡有 X% 用户在第一周打开过"算
7. **Tasks 切到独立可交付** —— 任何一个 task 单独跑不通了不会卡死整个 change

---

## 8 · openspec/ 与 specs/ 的关系

`changes/` 是流水的，`specs/` 是沉淀的。

- 一个 change 在路上时：所有讨论、设计、决策都在 `changes/<id>/` 内自洽
- 一个 change 实施完毕、改变了**系统的稳定接口** (CLI 命令面、Skill 契约、JSON Schema 顶层结构) 时：
  - **必须**同步更新 `specs/` 下对应的契约文档
  - 在 `specs/<file>.md` 末尾的 changelog 区追加一行 (date / change-id / 摘要)

> **铁律**: 不能直接编辑 `specs/` —— 任何对稳定契约的改动都必须**通过一次 change**。
>
> 如果你发现 `specs/` 里有错而又没有对应的 change，建一个最小的 change 来修正它，不要直接改。

这条规则保证了 specs/ 永远是"通过审议的契约"，而不是"某个人某天的临时想法"。

---

## 9 · 与 docs/ 的引用关系

每份 proposal 都应该引用上游叙事文档：

```markdown
## 上游
- 战略: `docs/framing/v2.x-north-star.md` §1 (三层架构)
- backlog 来源: `docs/ideas-backlog.md` Item #17
- 相关历史: `docs/plans/v2.0-m6-notes-design.md`
```

每个 change 归档后，下游叙事文档要更新：

- `docs/plans/<milestone>.md` 追加一段叙事
- 必要时更新 `docs/prd/PRD-vX.X.md` 或 framing 文档 (一次 change 也只更新一次, 在归档同时做)

---

## 10 · 常见误区

| 误区 | 正确姿势 |
|---|---|
| 把 proposal 写成 design (一上来就架构图、数据库 schema) | proposal 只回答 WHY + WHAT, design 才回答 HOW |
| change ID 用日期+功能名一句话英文 | 用 `YYYY-MM-<short-slug>` |
| design.md 里堆代码片段 | 代码进 PR, design 只放架构图 + 接口签名 + 决策矩阵 |
| tasks.md 写成日程表 (含人名 + 日期) | tasks 是"拆解清单", 不是项目管理工具 |
| 修了 specs/ 没走 change | 永远不要; 任何 specs/ 变更都要 change |
| 一个 change 跨 3 个版本里程碑 | 拆成多个 change, 每个 change 解决一件事 |

---

## 11 · 第一次启用?

如果这是你第一次在本仓库使用 openspec：

1. 读完本 README
2. 浏览 `_template/` 下四个模板文件，理解每份产物的角色
3. 看一眼 `specs/` 下的几份契约 (即使现在还是占位状态)
4. 第一份真实 change 推荐从一个**小而具体**的功能开始，跑通整个流程

> 这套流程的核心目的不是增加形式负担，而是**把每一次改动的 WHY 和 HOW 留下来**，让 6 个月后的自己 (或下一个接手的 agent) 不需要从代码考古来理解过去。
