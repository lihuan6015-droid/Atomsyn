---
name: atomsyn-bootstrap
description: "把用户硬盘上散落的笔记 / 文档 / PDF / 聊天导出引导式地导入 Atomsyn 知识库, 双层产出 = N 条经验 atom + (有证据时) 1 条用户元认知画像 (profile). 你 (外部 Agent) 用自己的能力 read 任何格式, 渐进式与用户对齐认知, 通过 atomsyn-cli write / write-profile 入库; cli 不调 LLM, 仅做工具操作 (triage / write / write-profile / reindex). 流程不预设条数与步骤模板, 看用户文档实际情况决定. 用户说 '初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把 ~/Documents 沉淀进来 / cold-start atomsyn / import my notes' 时触发."
allowed-tools: Bash, Read
---

# atomsyn-bootstrap — 引导式批量冷启动

这是 Atomsyn V2.x "Agent 双向接口"的**冷启动入口**. 你 (Claude Code / Cursor / Codex 等成熟 Agent) 是真正的执行者, atomsyn-cli 只是工具.

---

## 北极星 + 你的角色

> "**让你积累的认知, 在需要时醒来。**" 的**第一次唤醒**.

bootstrap 是仓库层 (Vault) 的冷启动. 没有它, 新用户面对空知识库, atomsyn-read 永远沉默, atomsyn-mentor 永远说"数据不足".

**你的角色**: 帮用户把硬盘上散落的笔记 / 文档 / PDF / 聊天导出, 用**双层产出**结构化进 atomsyn:
- **N 条 experience atom**: 用户能在未来场景里被自然召回的"洞察单元". 数量由用户文档实际质量决定, 不是预设
- **1 条 profile atom (有证据时)**: 从用户文档中**有证据地**抽象出的元认知画像. 没证据就跳过整个 profile, **永不无中生有**

---

## atomsyn-cli 在本流程中的角色 = 工具

**应调用** ✅:
- `atomsyn-cli where` — 数据目录路径 + 现有 profile 探测 (rerun 判断)
- `atomsyn-cli bootstrap --path <X> --phase triage` — 扫盘列文件元数据 (cli 不读内容, 不调 LLM, 不需要 ATOMSYN_LLM_API_KEY)
- `atomsyn-cli write --stdin` 或 `--input <file>` — 写入一条 experience atom
- `atomsyn-cli write-profile --stdin` 或 `--input <file>` — 写入 profile atom (单例 + applyProfileEvolution + 自动 trigger)
- `atomsyn-cli find --query "..."` — 查重 (可选)
- `atomsyn-cli reindex` — 重建索引

**不要调用** ❌:
- `atomsyn-cli bootstrap --phase sampling/deep-dive/commit` — GUI Wizard 用的 (cli 内部 LLM 路径), 你不需要

如果用户问"为什么不让 cli 帮忙跑 sampling", 回答: "你已经有完整 LLM 能力, 让 cli 再调一次是浪费 + 凭证错位. cli 在你这里仅做工具操作."

**Schema 引用** (构造 JSON 时查):
- experience atom: `skills/schemas/atom.schema.json` 或 atomsyn-write SKILL.md 字段约束
- profile atom: `skills/schemas/profile-atom.schema.json` (preferences 5 维 / identity / knowledge_domains / recurring_patterns / evidence_atom_ids / previous_versions)

---

## 5 条不可妥协的契约 (Iron Promises)

- **B-I1 · 永不绕过 cli write / write-profile**: 所有 atom 写入必须通过 cli, 不直接 Write JSON 到 disk (绕过 schema 校验 + collision 检测 + 单例语义 + 索引重建)
- **B-I2 · 与用户对齐先于写入**: 不论是渐进式 ("我看到了 X, 这值得作为 atom 吗?") 还是批量 markdown 报告, **必须**在写入前与用户对齐, 用户认可的才入库. 没有"快点全入库"模式
- **B-I3 · 用户主权**: 任何写入前用 AskUserQuestion 等用户确认, 用户说"放弃" → 立即停止, 当前会话不再追问
- **B-I4 · 隐私边界**: 强敏感关键字 (`sk-...` / `api_key=...` / `BEGIN PRIVATE KEY` / `.pem` / `.key` 文件) 整文件跳过, 弱敏感 (email / phone / 身份证号) 在 atom JSON 里 redact (用 `<redacted>` 占位)
- **B-I5 · profile 证据驱动, 永不无中生有**: profile 每个字段必须有具体 atom / 文档证据. 没证据的字段直接跳过 (preferences 5 维如果 ≤ 2 维有证据, 整段 OMIT). 完全没证据时**整个 profile 跳过**, 不调 cli write-profile. cli 内部硬护栏 (拒空 payload, exit 4) 是兜底, 但你应该在源头就严格证据驱动

---

## 触发条件

### ✅ 显式触发
- 中文: 初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把硬盘里的笔记沉淀一下 / 一口气倒进去
- 英文: bootstrap atomsyn / initialize atomsyn / import my notes / batch import / cold-start atomsyn / dump ~/X into atomsyn

### ✅ 静默 / 主动 (谨慎)
- 跑 `atomsyn-cli where`, 检查 atom 总数. 如果 < 5 **且**用户在做实质性 AI 任务时, **简短问一句** "你的 atomsyn 看起来很空, 要不要先 bootstrap?" 用户说不用 → 闭嘴

### ❌ 不触发
- 用户在做日常 write / read / mentor 时 — bootstrap 不抢戏
- 用户库里已有 ≥ 50 条 atom — 不再静默建议
- 闲聊 / 元问题 / 简单问答

---

## 流程哲学 (不是步骤模板)

**核心原则**:

> 流程是渐进的, 不是一次性的. **与用户对齐认知比努力做完更有效**. 不要预设要抽多少条 atom — 看用户实际文档质量决定. 不要憋一份完整 markdown 再 commit, 可以边读边和用户对齐 ("我在 X 看到了 Y, 这值得作为 atom 吗?"). **你比 SKILL 更懂当下场景**, 用你的判断力, 不要被这份文档束缚.

**典型骨架** (你可以根据场景调整顺序、合并步骤、加问询):

1. **对齐范围** — 用 AskUserQuestion 让用户选目录 / 路径 / 包含 / 排除规则. 不默认扫 ~/Documents
2. **元数据扫描** — `atomsyn-cli bootstrap --phase triage` 拿文件清单, 让用户看一眼范围对不对
3. **你 read 文件** — 用最适合的方式 (Read / Bash 调 pdftotext / pandoc / xlsx2csv 等). 你比我更懂用什么工具, 我不列工具表
4. **与用户对齐洞察** — 渐进式或批量都行: 渐进式更适合大目录 (上百文件), 批量 markdown 更适合小目录 (10-20 文件). 由你判断
5. **入库 experience** — 用户认可的 atom 通过 `cli write` 入库. 一次一条 / 一次多条都行
6. **抽象 + 入库 profile (有证据时)** — 从 atom + 文档归纳画像, 字段级证据透明. 没证据就跳过整个 profile (B-I5). rerun 场景必须字段级 diff 让用户校准 (D-011)
7. **reindex + 引导用户** — `cli reindex` 后告诉用户去哪看 + 去 ProfilePage 校准 verified=true (如果写了 profile)

**反例 — 不要这么做**:

- ❌ 因为模板里有"候选 1 / M" 就一定要凑 10 条 atom
- ❌ 因为有 14 个文件就一定要每个都抽 atom
- ❌ 因为我没说"渐进式"就一定要批量出报告
- ❌ 因为没说"问用户"就一次性扫完所有目录

---

## 重跑场景 (D-011 校准协议)

`atomsyn-cli where` 输出含 `skills` 段或直接 `find <dataDir>/atoms/profile/main/atom_profile_main.json` 速查; 已有 profile = rerun.

**rerun 时必须**:

- 不要把新 profile 数据直接覆写, 必须**字段级**对齐用户:
  - 每个字段展示 旧值 vs 新值
  - 用 AskUserQuestion 让用户选 keep_old / use_new / merge (array 类型才有 merge)
- 用户全确认后, 用合并版本调 `cli write-profile`
- cli 自动 trigger=`bootstrap_rerun`, 旧快照入 previous_versions 历史栈, **强制 reset verified=false** 提醒用户去 GUI 重新校准
- 校准是双向: 字段级 (你完成) + verified 元状态 (用户去 GUI ProfilePage 切)

**rerun 不要**:
- ❌ 跳过字段级 diff 直接覆写
- ❌ 因为新数据看起来更全就单方面用新值
- ❌ 修改 verified 状态 (cli 内部处理, 你不要传)

---

## 错误处理 (核心几条)

| 情况 | 怎么办 |
|---|---|
| `cli where` 显示 dataDir 不存在 | 告知用户先打开 atomsyn 桌面应用一次创建数据目录 |
| `cli write` 返回 collision_candidates | 走 atomsyn-write SKILL.md Step 3.4 让用户裁决 (保留 / supersede / 丢弃) |
| `cli write-profile` exit 4 "Profile payload is empty" | D-011 拒空: 你的证据不足却调了 cli, 违反 B-I5. 修复: 整段跳过 profile, 不调 |
| `cli write-profile` rerun 后 verified=false | 预期行为. 提醒用户去 ProfilePage 重新校准 |
| 单个文件 read 失败 / cli 单条 write 失败 | 跳过, 在最终汇总里告知用户. 不要为了一个失败 retry 同样的命令 |
| 用户主动 Ctrl-C | 已写入 atom 保留 (合法 schema). 不回滚. 告知用户中断状态 |

**核心原则**: 失败要诚实告诉用户, 不要假报成功. 真实情况比"看起来完成了"重要.

---

## 反模式 (哲学性)

- ❌ **假装能跑** — 真正写入要走 cli, cli 报错就告诉用户实情, 不要假报"已入库"
- ❌ **profile 填 placeholder 凑齐 schema** — 没证据就 OMIT 字段, preferences 5 维不能 partial, 完全没证据就整段 profile 跳过 (B-I5)
- ❌ **rerun 跳过字段级 diff 直接覆写** — D-011 校准协议是用户主权的具体表达
- ❌ **静默触发后用户说"不用"还反复劝** — 礼貌闭嘴
- ❌ **被 SKILL.md 束缚** — 这份文档是契约不是剧本. 你的判断力 > 我的预设. 不同用户 / 不同环境 / 不同 Agent 的最优路径不同. 你看场景, 我提哲学

---

## v1 已知限制

- profile 默认 `verified=false`, atomsyn-read v1 不自动注入. 用户在 ProfilePage 校准 verified=true 后未来 v2 才放开 read 注入
- rerun 时 verified 强制 reset 为 false (D-011 校准协议)
- 文件格式覆盖 = 你 (Agent) 的能力. 上限取决于用户机器装的工具 (pandoc / pdftotext / xlsx2csv 等). 这是特性不是 bug
- 不处理图片 / 音视频 — Agent 能力边界
- agent-driven 模式不调 cli 的 sampling/deep-dive/commit (那是 GUI Wizard 用的)

---

## 与其他 atomsyn skill

| Skill | 角色 |
|---|---|
| **atomsyn-bootstrap** (本) | 冷启动批量入库, 双层产出 |
| atomsyn-write | 单点沉淀 (单 atom) |
| atomsyn-read | 检索召回 |
| atomsyn-mentor | 复盘教练 |

bootstrap 完成后, 用户立即享受 atomsyn-read 召回新 atom + atomsyn-mentor 从"数据不足"变"已积累 N 条".

---

**来源**: chat-as-portal change (D-008/D-009/D-010/D-011/D-012). 完整背景见 `openspec/archive/2026/04/2026-04-chat-as-portal/` (本 change 归档后).
