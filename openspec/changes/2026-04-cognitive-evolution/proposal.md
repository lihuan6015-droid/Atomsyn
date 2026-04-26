---
change_id: 2026-04-cognitive-evolution
title: 让认知能演化:supersede + 软删除 + 时间感知
status: proposed
created: 2026-04-26
owner: 主 agent + 用户
supersedes: ""
---

# Proposal · 让认知能演化:supersede + 软删除 + 时间感知

## 1 · 摘要 (TL;DR)

Atomsyn 当前是"单调追加 + merge 语义"的认知仓库,缺时间维度和演化语义。本 change 引入三层并举的演化协议:read 输出 staleness 信号、write 触发 collision check、显式 supersede / archive / prune 命令。让 Agent 在新情境遇到与旧 atom 矛盾的事实时有协议可循,旧认知不再一错再错。

## 2 · 背景 (Context)

V2.x 北极星"让你积累的认知,在需要时醒来"在仓库层有一个隐含前提:**醒来时还是新鲜的**。当前实现只兑现了"存得住、找得到、AI 能调",但用户的认知会随时间变化(学习闭环 = 模型训练),沉淀下来的判断不一定永远正确。

- **上游**: `docs/framing/v2.x-north-star.md` §6 "使用即维护";`docs/prd/PRD-v2.0.md` 三层架构的仓库层基础设施部分。
- **历史**: V2.0 M4 完成"双向蒸馏相遇"后,dogfood 中多次出现一种模式 — 用户在新对话里发现 6 个月前的 atom 已经过时,但 atomsyn-write 当前只有 merge 语义,没有"取代"语义,Agent 只能选择"忽略旧 atom 强行新建"或"merge 进去把它搞糊"。两条路都伤害了知识库的可信度。
- **触发事件**: 2026-04-26 用户与主 agent 直接对话提出 "merge only / + supersede / + supersede + fork?" 的三选题,选定 "+ supersede" 作为本次范围。

## 3 · 痛点 (Problem)

**谁痛**: 长期使用 Atomsyn 的用户(2 个月以上)和在新会话里 read 命中旧 atom 的 Agent。

**痛在哪**:
1. 旧认知沉睡 6 个月后被唤醒,Agent 没法判断它"还成立吗",于是要么照搬要么忽略 — 两种都不对
2. 用户想"修正"旧 atom 时,merge 语义会把新旧两份矛盾的 insight 拼成一坨,反而毁了原来那条干净的记录
3. 没有 archive,用户面对真正过时的 atom 只能"假装它不存在"或者破坏铁律手动删文件

**不解决会怎么样**:
- 知识库随时间累积"半正确"的 atom,信噪比下降
- 用户失去对系统的信任 → 不再 ingest → 北极星 "存 → 取 → 连 → 长" 在"长"那一段断掉
- 教练层(mentor、雷达)基于过时数据给建议,放大错误而不是纠正

**具体场景**: 用户在 2025-10 沉淀了一条"Tauri macOS 公证流程必须用 notarytool 而不是 altool"。2026-04 Apple 弃用 notarytool 切到新方案,用户在 Cursor 里起草脚本,旧 atom 被 atomsyn-read 命中并塞进 AI 的回答 — 用户照着写完才意识到不对。**这一条 atom 害了一次工作。**

## 4 · 提案 (Proposal)

### 一句话解

为 atom 增加时间感知字段(`supersededBy` / `supersedes` / `archivedAt` / `lastAccessedAt`),让 CLI 在 read 时输出 staleness 信号、write 时做 collision check,并新增 `supersede` / `archive` / `prune` 三个显式命令支持"打破→重建"。

### In-scope (本 change 必交付)

- [ ] atom schema 新增 4 个可选字段(`supersededBy` / `supersedes` / `archivedAt` / `lastAccessedAt`)
- [ ] `atomsyn-cli read` / `find` 命中时被动更新 `lastAccessedAt`,输出附带 staleness 信号(age_days / last_access_days / confidence_decay / is_stale)
- [ ] `atomsyn-cli write` / `update` 加 `--check-collision` 默认开,检测到冲突在 stdout 加 `collision_candidates` 字段并 stderr 警告
- [ ] 新命令: `atomsyn-cli supersede --id <old-id> --input <new.json>`
- [ ] 新命令: `atomsyn-cli archive --id <id> [--reason "..."] [--restore]`
- [ ] 新命令: `atomsyn-cli prune [--auto-detect] [--limit N]`,默认 dry-run 输出候选 JSON
- [ ] 索引重建感知 `archivedAt` / `supersededBy`,read 默认不返已归档 atom
- [ ] 三个 skill 协作更新: atomsyn-read 见 staleness 后加"温度计句"、atomsyn-write 见 collision 后用 AskUserQuestion 决策、atomsyn-mentor 在复盘报告末尾主动建议 prune
- [ ] 数据 API 双通道(Vite 中间件 + Tauri router)同步实现新端点
- [ ] **Profile atom 享受 staleness 机制** (D-008, 与 bootstrap-skill 联动): profile 也参与 `confidence_decay` / `is_stale` 计算; profile 的 `lastAccessedAt` 在 read 命中或 GUI 校准时更新; mentor 在 v2 中可基于"profile 已 N 天未校准"输出主动建议
- [ ] **Profile atom 享受 supersede 机制** (D-008): bootstrap 重跑 / GUI 校准 / agent 主动触发 profile 演化时, 用 supersede 协议处理, 但**特殊语义**: profile 是单例 (id=`atom_profile_main`), supersede 不创建新 id, 而是把当前快照推入 `previous_versions[]` 数组 (与 bootstrap-skill D-010 协调)
- [ ] **imported atom 的 staleness 软处理** (与 bootstrap-skill 联动): bootstrap 写入的 atom 默认 `confidence=0.5`, 但 `lastAccessedAt=null` (从未被访问), staleness 计算时这类 atom 用 `createdAt` 兜底; 不让"刚 import 的 atom 立即被标 stale"

### Out-of-scope (本 change 不做,留给后续 change)

- `fork` 命令(让旧 atom 在不同情境下分叉,保留多个版本并存) — V2.y 再做
- 基于 embedding 的语义相似度 collision detection — 未来增量,v1 先用关键词重叠 + 反义短语库
- GUI 上的"认知演化时间线"可视化(supersede 链的视觉化呈现) — 单独 change
- 自动化的 LLM-driven prune(不允许 LLM 自动改库,只能给候选让用户裁决)
- 跨原子的"全库一致性 check"(发现两条独立 atom 互相矛盾) — 复杂度太高,延后
- mentor 的 declared vs inferred gap 分析 (依赖 profile.preferences 数据流通, 等 v2 + bootstrap 跑通)

## 5 · 北极星对齐 (North Star Alignment)

| 维度 | 回答 |
|---|---|
| 主层 | **仓库层** — 底层基础设施,让认知有"演化能力" |
| 喂养下游 | (a) **结构层**: 让"理论 vs 实践"对比能看到时间轴,supersede 链能讲述"我的认知是怎么变化的"故事 (b) **教练层**: mentor 用 prune 候选数做主动建议,雷达用 staleness 比例衡量"知识库新鲜度" |
| 来自上游 | 消费现有 atomsyn-cli read/write/find 引擎、`stats.locked` / `userDemoted` 字段、知识索引 |
| 北极星主句关联 | "让你积累的认知,在需要时醒来" — 醒来时**还是新鲜的**,而不是 6 个月前的过时认知。同时兑现 §6 哲学"使用即维护"的字面承诺:被 read 命中的瞬间就是它被检视的瞬间 |

## 6 · 成功指标 (Success Metrics)

- **机制跑通指标 1**: `atomsyn-cli prune --auto-detect` 在 dogfood 数据集(当前 ~200 atom)上能识别至少 **3 条**真实候选 atom,人工 review 后至少 1 条值得 supersede / archive
- **机制跑通指标 2**: `atomsyn-cli read` 命中时 `lastAccessedAt` 写入成功率 ≥ 99%(磁盘可写情况下),通过 7 天滚动观察 `data/growth/usage-log.jsonl` 的 read 事件 vs atom 文件 mtime 比对验证
- **机制跑通指标 3**: 实施后 30 天内,**80% 以上**被 read 命中过的 atom 的 `lastAccessedAt` 在 7 天内有更新 — 说明 read 路径的 lastAccessedAt 写入打通,不是"功能存在但没人调"
- **质量指标 1**: collision check 在 dogfood 100 次 write 后误报率 < 5%(误报 = 用户判断"不是真冲突,新建即可")。[TODO 验证 — 需要 dogfood 累积样本]
- **质量指标 2**: supersede 链在 read 命中时正确显示前置版本(单元测试覆盖 3 层 supersede 链路径)
- **不变量保持指标**: 现有 ~200 atom JSON 在新 schema 下 `npm run reindex` 全部通过校验,0 条因为缺少新字段被拒绝

## 7 · 风险与未知 (Risks & Unknowns)

### 已知风险

- **风险 1 — collision check 误报**: 关键词重叠 + 反义短语库太粗糙,可能把"新增不同维度的洞察"误判为"和旧 atom 矛盾",导致 write 流程被频繁打断。**缓解**: 默认开启但 stderr 警告 + exit 0(不阻塞写入),用户可以 `--no-check-collision` 关闭;v1 先看 dogfood 数据,误报率高就调阈值
- **风险 2 — lastAccessedAt 写入抖动**: 每次 read 都触发磁盘写,200 atom × 多次 read 可能产生大量 mtime 变更,污染 git diff 或备份工具感知。**缓解**: 写入采用"显著变化才落盘"策略(距上次写入 > 1 小时才更新),日内多次 read 只更新内存索引;详见 design.md §8
- **风险 3 — supersede 链无限增长**: 极端情况下用户对同一概念反复 supersede 5 次以上,read 时回溯链路成本上升。**缓解**: read 默认只回溯 1 级前置版本,完整链路通过 `--show-history` 显式请求
- **风险 4 — 用户错把 archive 当删除**: 软删除的 atom 还在磁盘上,占索引空间,新用户可能误以为"archive 了就消失了"。**缓解**: archive 时 stdout 明确提示"已软删除,可用 `atomsyn-cli archive --id <id> --restore` 反归档";GUI 后续单独提供"已归档"视图

### 待澄清

- [ ] confidence_decay 计算公式的具体阈值(默认衰减半衰期是 90 天还是 180 天?和用户的学习节奏有关) — 在 design.md §3 给出 v1 公式,实施后根据 dogfood 数据再调
- [ ] prune 的 `--auto-detect` 三个判定维度(同 tags + insight 矛盾 / 长期未访问 + 低 confidence / 引用文件已不存在)的相对权重 — v1 用并集而不打分,简化逻辑
- [ ] supersede 时新 atom 的 `kind` / `subKind` 是否必须和被取代的一致?默认不强制(允许从 fragment 升级到 experience),但需要 design 章节说清楚
- [ ] 索引中是否需要单独的"已归档 atom 索引"用于 GUI 反归档界面? — 在 design §10 决定

## 8 · 替代方案 (Alternatives Considered)

### 方案 A · 仅做 supersede,不动 read/write 的被动信号

- 描述: 只新增 `supersede` / `archive` / `prune` 命令,不改 read 输出格式、不加 write collision check
- 利: 实施简单,改动面小,schema 不动,Skill 契约几乎不变
- 弊: 用户/Agent 必须主动判断"这条该不该 supersede" — 但他们正是因为不知道该不该才需要工具帮忙。变成了"有锤子但用户不知道该敲哪根钉子"
- 为什么没选: 违反 Atomsyn 的"主动建议哲学"(skills/atomsyn-write SKILL.md §主动建议)。如果没有 staleness 信号触发 Agent 提问,supersede 命令永远不会被调用,等于没做

### 方案 B · 引入硬删除 (`atomsyn-cli delete`)

- 描述: 在 archive 之外再加 `delete --id <id>` 物理删除文件
- 利: 用户清理过时 atom 直观,不用学习"软删除"概念
- 弊: 违反 CLAUDE.md 铁律 "NEVER delete files under data/ unless the user explicitly asks";违反"用户主权 + 学习轨迹保留"哲学 — 删掉的 atom 连同它的 supersede 链一起消失,无法回溯"我曾经这么想"
- 为什么没选: archive 已经够用 — read 默认不返、GUI 默认不显示。真要删除,用户可以用 OS 的 `rm` 在文件层面操作,系统不主动提供入口

### 方案 C · 用 LLM 自动判断 staleness 和 collision

- 描述: 在 read/write 时调本地 LLM 给每条 atom 打"是否过时"的语义评分,代替关键词启发式
- 利: 准确率显著高于关键词重叠,能识别"语义换皮"的真正矛盾
- 弊: (1) 违反 v1 哲学"永不 LLM 自动改库"(继承 /learn 的设计)(2) 每次 read 都调 LLM = 成本爆炸 + 延迟劣化(3) 增加云端 LLM 出本地的隐私风险表面积
- 为什么没选: v1 先用启发式打通机制,效果不够再升级到 embedding 本地模型;LLM 仅用于"给候选让人决定",绝不自动 mutate

## 9 · 上下游引用

- **战略锚点**: `docs/framing/v2.x-north-star.md` §1 三层架构 + §6 哲学 (使用即维护)
- **idea 来源**: 2026-04-26 用户与主 agent 直接对话提出 ("merge only / + supersede / + supersede + fork?" 三选题)
- **相关历史 change**: 无直接前置 change(本 change 是仓库层基础设施的首个演化能力 change)
- **影响的 specs**:
  - `openspec/specs/cli-contract.md` (新增 3 个命令 + 修改 read/write 输出契约)
  - `openspec/specs/skill-contract.md` (atomsyn-read / atomsyn-write / atomsyn-mentor 三处)
  - `openspec/specs/data-schema.md` (atom schema 新增 4 个可选字段)
