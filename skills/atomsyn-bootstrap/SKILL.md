---
name: atomsyn-bootstrap
description: "把用户硬盘上散落的过程文档 (markdown / 笔记 / 历史聊天导出 / 源代码注释) 引导式地导入 Atomsyn 知识库, 产出 1 条 profile atom + N 条 experience/fragment atom。3 阶段 funnel: TRIAGE 扫描概览 → SAMPLING 采样画像 → DEEP DIVE 5 层归类。隐私优先: 默认敏感关键字扫描 + .atomsynignore。两步协议: dry-run 出 markdown 让用户校对, commit 才真正写入。用户说 '初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn' 时触发。"
allowed-tools: Bash, Read
---

# atomsyn-bootstrap — 引导式批量冷启动

这是 Atomsyn V2.x "Agent 双向接口"的**冷启动入口**, 在 `atomsyn-write` (单点沉淀) / `atomsyn-read` (检索相遇) / `atomsyn-mentor` (复盘教练) 之外的第 4 个 skill。

**核心使命**: 用户硬盘上已经积累了几年的笔记、PRD、聊天导出、复盘文档 —— 这些是"原始记忆资产", 但从未被 Atomsyn 触达过。本 skill 引导用户用一次端到端的"扫描 → 采样 → 深读"流程, 把它们结构化成 1 条 profile + N 条 experience/fragment, 一次性进入仓库, 让用户立即享受到"相遇感"。

---

## 北极星与定位

> "**让你积累的认知, 在需要时醒来。**" 的**第一次唤醒**。

bootstrap 是仓库层 (Vault) 的冷启动入口。没有它, 新用户面对空知识库, atomsyn-read 永远沉默, atomsyn-mentor 永远说"数据不足"。它喂养下游:

- **结构层**: profile atom 给画像骨架, N 条 fragment/experience 进入双骨架的相遇池
- **教练层**: 未来 atomsyn-mentor 用 profile 做 declared (校准) vs inferred (行为推断) 的 gap 分析

---

## 8 条不可变承诺 (Iron Promises, 跨会话不变)

> 这 8 条在 design.md §5.3.1 与 decisions.md D-005/D-010/D-011/D-012 中定义, **不要在任何会话中绕过**。

- **B-I1 · 永不绕过 ingest**: bootstrap 写入 atom 必须通过 `atomsyn-cli ingest`, 不直接写 disk。这与 `atomsyn-write` 的 CLI-first 铁律一致。
- **B-I2 · Phase 之间是关卡**: TRIAGE → SAMPLING → DEEP DIVE 之间必须有用户确认 (AskUserQuestion), 不一次跑完。任何 phase 的输出都先给用户看, 再问"是否继续"。
- **B-I3 · profile v1 仅观察**: 写入的 profile atom `verified=false`, **本 skill 不让 read 自动注入**。用户在 GUI 校准 (verified=true) 后, v2 才考虑启用 read 注入 (D-007)。
- **B-I4 · 隐私默认关闭**: 没显式 `--include-pattern` 时, 默认按 `.atomsynignore` + 14 条内置正则严格过滤; 强敏感 (sk-... / api_key=... / private key) 整文件跳过, 弱敏感 (email/phone) redact 字段。
- **B-I5 · session 可恢复**: 任何 phase 失败必须保留 session 状态文件 `~/.atomsyn/bootstrap-sessions/<id>.json`, 用户可 `--resume <id>`。已 ingest atom 不回滚。
- **B-I6 · dry-run 是默认推荐路径** (D-011): 标准工作流是先 `--dry-run` 输出 markdown, 用户校对后才调 `--commit` 写入。**不要让用户感觉 bootstrap 是"一键不可逆"**, 必须在引导时分两段说清楚两步协议。
- **B-I7 · profile 单例** (D-010): 跨多次 bootstrap, profile id **始终是** `atom_profile_main`, 文件路径 `<dataDir>/atoms/profile/main/atom_profile_main.json`。**不要创建第二条 profile**, 也不要让用户误以为可以建多条。重跑 bootstrap 时, 旧 profile 的当前快照被推入 `previous_versions[]` 数组顶部 (新→旧), 顶层字段被新数据覆写, trigger 字段标 `bootstrap_initial` / `bootstrap_rerun` / `user_calibration` / `agent_evolution`。
- **B-I8 · prompt 模板锁定** (D-012): bootstrap 内部使用的 LLM prompt 模板从 `scripts/bootstrap/prompts/*.md` 加载 (7 份: triage/sampling/deep-dive-l1-l2/deep-dive-l3/deep-dive-l4/deep-dive-l5/commit), **不可被 ENV 或配置文件 override** (v1)。如果用户问"能改 prompt 吗", 告诉他"v1 不开放 override, 高级用户暂时只能 fork 仓库; v2 视反馈再考虑"。

---

## 触发条件

### ✅ 显式触发 (用户主动说)

- 用户说中文: 初始化 atomsyn / bootstrap atomsyn / 把 ~/X 倒进来 / 从我之前的笔记导入 / 第一次用 atomsyn / 把硬盘里的笔记沉淀一下 / 一口气倒进去 / 批量导入 atomsyn
- 用户说英文: bootstrap atomsyn / initialize atomsyn / import my notes / batch import / cold-start atomsyn / first time using atomsyn / dump ~/Documents into atomsyn

### ✅ 静默/主动触发 (谨慎)

- 检测到用户的 atomsyn 数据目录里 atom 总数 < 5 (用 `atomsyn-cli where` 看 dataDir, 然后 `find <dataDir>/atoms -name 'atom_*.json' | wc -l` 速查), **并且**用户正在做实质性 AI 任务时:
  - **不自动触发**, 只**简短问一句**: "你的 atomsyn 看起来很空 (只有 N 条 atom), 要不要先 bootstrap 一下, 把硬盘里已有的笔记一次性倒进来?"
  - 用户说"不用" → 立即闭嘴, 当前会话不再追问
  - 用户说"好" → 进入下面的 3 阶段执行步骤

### ❌ 不触发

- 用户在做日常 write / read / mentor 操作时 —— bootstrap 不抢戏
- 用户库里已经有大量 atom (≥ 50) 时, 不再静默建议 (用户已经在用, 不需要冷启动)
- 闲聊 / 元问题 / 简单问答

---

## Token 预算 (启动前必须告知用户)

| 阶段 | LLM 调用次数 | 单次 token 预算 | 总 token 估算 (1000 文件目录) |
|---|---|---|---|
| TRIAGE | 0 (纯文件元信息) | n/a | 0 |
| SAMPLING | 1 | ≤ 30k input + 4k output | ~34k |
| DEEP DIVE 串行 (默认) | N (= 文件数) | ≤ 8k input + 2k output | ~10M (1000 × 10k) |
| DEEP DIVE `--parallel` | N (4 路 sub-agent) | 同上 | **~40M (4x cost)** |
| COMMIT (markdown → JSON) | 1 batch call (含所有保留候选) | ≤ 20k input + 8k output | ~28k |

**告知用户的话术**:

> "这次 bootstrap 预计调用 N 次 LLM, 总 token ~M (按你 llm.config.json 配置的 provider, 大约成本 $X)。我们走两步:
>
> 1. **dry-run** (省 60% token): 出一份 markdown 报告给你看, 哪些候选要保留 / 修改 / 删除
> 2. **commit**: 你确认后, 才把保留的候选转成 atom JSON 写入
>
> 任何阶段你都可以 Ctrl-C, session 状态保留, 下次 `--resume <id>` 续跑。"

---

## 3 阶段 funnel · 详细执行步骤

### 阶段 0 · 启动前确认

1. 跑 `atomsyn-cli where` 拿到 dataDir 路径, 给用户看一眼 ("写入位置: `<dataDir>`")
2. 用 AskUserQuestion 让用户选范围:
   - 选项 A · "扫描 ~/Documents (常见 + 推荐起步)"
   - 选项 B · "我自己选目录 (一个或多个)"
   - 选项 C · "放弃" → 退出, 不创建 session
3. 用 AskUserQuestion 提示是否启用 `--parallel` (默认否, 4x token cost 警告):
   - 选项 A · "默认串行 (慢但稳, ~30min for 1000 files)"
   - 选项 B · "并行 4 路 sub-agent (快但 token 4x, ~8min for 1000 files)"

### 阶段 1 · TRIAGE (扫描概览)

```bash
atomsyn-cli bootstrap --path <用户选的目录> --phase triage
```

(可重复 `--path` 选多个目录; `--include-pattern "*.md,*.txt"` / `--exclude-pattern "node_modules/**"` 在用户给了具体提示时才加)

**预期输出 (stdout)**: markdown 表格, 列出每种文件类型的数量、总大小、最近修改时间, 以及 `sensitive_skipped` 列表。

**关卡 (B-I2)**: 用 AskUserQuestion 让用户决定:

- 选项 A · "范围对, 继续 SAMPLING" → 进入阶段 2
- 选项 B · "我要改 include/exclude" → 让用户给 pattern, 重跑 triage
- 选项 C · "看一下 sensitive_skipped 的具体文件" → `cat ~/.atomsyn/bootstrap-sessions/<id>.json | jq '.phase1.sensitive_skipped'` 给用户看
- 选项 D · "放弃" → exit code 3, session 保留可 resume

### 阶段 2 · SAMPLING (采样推断画像)

```bash
atomsyn-cli bootstrap --resume <session-id> --phase sampling
```

CLI 会在 phase1 结果中按"代表性"抽样 (每类 3-5 个文件: README 必抽, 项目根核心文件, 最近 30 天修改, 中位数 size), 调用 1 次 LLM (input ≤ 30k, output ≤ 4k), 输出**画像假设 markdown** (identity + 5 维数值初值 + knowledge_domains)。

**关卡 (B-I2)**: 用 AskUserQuestion 让用户校准画像:

- 选项 A · "画像准确, 继续 DEEP DIVE dry-run"
- 选项 B · "我要补充/修正" → 收集用户的文字, 用 `--user-correction "<文字>"` 传给下一步
- 选项 C · "重新采样 (换一批文件)" → 重跑 phase sampling
- 选项 D · "放弃" → exit code 3

### 阶段 3a · DEEP DIVE — dry-run (B-I6 默认推荐, D-011)

```bash
atomsyn-cli bootstrap --resume <session-id> --phase deep-dive --dry-run [--user-correction "..."]
```

**关键**: 这一步**只产出人类友好 markdown** (省 60% token), 不调用 ingest, 不写任何 atom。markdown 持久化到 `~/.atomsyn/bootstrap-sessions/<id>.md`, 每条候选含: name / 一句话 insight / 5 层归类 (L1-L5) / 原文片段 50 字截断 / confidence / 建议 tags。

**告诉用户**:

> "dry-run 完成了, 报告在 `<sessionId>.md`。你现在可以**直接用文本编辑器打开它**, 删行 / 改 name / 改归类 / 加 tags / 加备注。改完后告诉我, 我们走 commit。"

**关卡 (B-I2 + B-I6)**: 用 AskUserQuestion:

- 选项 A · "我已经看过/改过 markdown, 现在 commit" → 进入阶段 3b
- 选项 B · "先帮我把 markdown 大致总结一下, 我看哪些不对" → Read 那个 .md 文件, 高度浓缩展示给用户
- 选项 C · "我要重跑 dry-run (换 user-correction)" → 回到阶段 3a
- 选项 D · "放弃 (保留 session 不 commit)" → exit, session 文件留着

### 阶段 3b · COMMIT (B-I6 第二步, D-011)

```bash
atomsyn-cli bootstrap --commit <session-id>
# 如果用户在 markdown 上做了 inline 修改, 默认从 session 文件读, 不需要额外参数
# GUI 模式可以用 --markdown-corrected-file <path> 显式指定一个被修改过的 markdown
```

CLI 会:

1. 读 session 的 markdown (默认从 session 文件)
2. 对 markdown 中保留的每条候选, 调用 LLM (1 次 batch call) 生成完整 atom JSON
3. 通过 `atomsyn-cli ingest --stdin` 写入磁盘 (走 schema 校验)
4. **profile 单例语义 (B-I7 / D-010)**: 写入 profile 时, 如果 `<dataDir>/atoms/profile/main/atom_profile_main.json` 已存在 → 现有快照推入 `previous_versions[]` 顶部 (trigger=`bootstrap_rerun`), 然后覆写顶层; 不存在则创建新 profile (trigger=`bootstrap_initial`)
5. rebuildIndex
6. 写 `data/growth/usage-log.jsonl` 一条 `bootstrap.commit_completed` 事件

**完成报告**: stdout 含产出统计 + 写入路径 + 跳过条目 + duplicates 列表。

**最后一步 — 引导用户校准 profile (B-I3 + D-013)**:

> "✅ Bootstrap 完成! 产出 1 条 profile + N 条 experience + M 条 fragment, 已进入 `<dataDir>/atoms/`。
>
> ⚠️ profile atom 当前 `verified=false`, atomsyn-read **不会自动注入它** (v1 仅观察)。请打开 Atomsyn 桌面应用 → **认知画像 (Profile)** 页面, 调一下 5 维滑块、看看 evidence_atom_ids、然后切 `verified=true`。校准完成后, 未来 v2 才考虑让 read 在新会话注入 profile 作为 system prompt。"

---

## 退出码语义 (handle stderr 给用户)

| code | 含义 | 你应该怎么告诉用户 |
|---|---|---|
| 0 | 成功 | 输出完成报告 |
| 1 | 通用失败 (LLM call 失败 / IO 错误 / schema 校验失败) | 把 stderr 原文给用户, 提示 "我可以 `--resume <id>` 重试, 或者放弃 (session 保留)" |
| 2 | 找不到 `--path` 目录 / 找不到 `--resume` session / 找不到 markdown 文件 | "路径或 session id 不存在, 你确认一下" |
| 3 | 用户在 AskUserQuestion 关卡选择"放弃" | "已停止, session `<id>` 保留, 任何时候可以 `--resume`" |
| 4 | 隐私关键字命中导致全部候选被过滤 / commit 时 markdown 解析后无可入库条目 | "全部候选都被隐私规则过滤了 (或 markdown 上你删完了所有条目)。要不要放宽 `--include-pattern` 重跑?" |

**通用失败处理**: 任何非 0 退出, 你都应当用 AskUserQuestion 给用户**两个选项**:

- 选项 A · `atomsyn-cli bootstrap --resume <session-id>` 重试
- 选项 B · 放弃 (session 保留, 不删)

---

## GUI 校准入口提示 (commit 完成后必读, D-013)

bootstrap commit 完成后, **不要让对话戛然而止**。引导用户去 GUI 校准:

> 桌面应用里有"**认知画像 (Profile)**" 模块 (一级页面或 Growth 子 tab), 你可以:
> 1. 看到刚才 LLM 推断出的 5 维偏好 (scope_appetite / risk_tolerance / detail_preference / autonomy / architecture_care)
> 2. 拖滑块手动调整每个维度
> 3. 编辑 identity (role / working_style / primary_languages / primary_tools)
> 4. 看 evidence_atom_ids — 每个字段后面"基于 N 条 atom"小标, 点开列出对应 atom, 你可以逐条审视
> 5. 看 previous_versions 时间线, 任何历史版本可一键 restore (当前版本会自动归档进 previous_versions, 不丢失)
> 6. 切 `verified=true` —— 这是 v2 启用 read 注入 profile 的前置条件 (B-I3)

**90 天后**: GUI 会自动提示"画像 90+ 天未校准了, 要不要回看一遍?" (与 cognitive-evolution 的 staleness 机制联动)。

---

## 反模式 (绝对不要这么做)

❌ **一次跑完不分阶段** —— 违反 B-I2。即使用户说"快点", 也必须 3 阶段 + 3 关卡。
❌ **跳过 dry-run 直接 commit** —— 违反 B-I6。dry-run 是用户主权的体现, 写入污染发生在前后悔成本极高。
❌ **创建第二条 profile** —— 违反 B-I7。profile 永远 1 条, id 固定 `atom_profile_main`。多次 bootstrap 的"画像演化轨迹"在 `previous_versions[]` 里。
❌ **自己改 prompt 模板** —— 违反 B-I8。prompt 在 `scripts/bootstrap/prompts/*.md` hard-code, 用户改不了 (v1)。如果你"觉得 prompt 应该改一下", 不要在 SKILL.md 或 ENV 里 override, 提交 PR 改源码。
❌ **直接用 Write/Bash 手写 atom JSON** —— 违反 B-I1。所有写入必须通过 `atomsyn-cli ingest`。
❌ **commit 完成后默默 verified=true** —— 违反 B-I3。verified 只能由用户在 GUI 主动切。
❌ **失败后 retry 同样的命令** —— 用 `--resume <id>` 走断点续传, 不要重头扫一遍。
❌ **静默触发后用户说"不用"还反复劝** —— 礼貌闭嘴, 当前会话不再追问。

---

## 错误处理速查

| 情况 | 怎么办 |
|---|---|
| `atomsyn-cli where` 显示 dataDir 不存在 | 告诉用户 "Atomsyn 数据目录还没初始化, 先打开桌面应用一次创建数据目录" |
| Phase 1 路径不存在 (exit 2) | 让用户检查路径, 重跑 |
| Phase 2 LLM 调用失败 (exit 1) | 让用户检查 `~/.atomsyn-config.json` 或 `config/llm.config.json` 的 provider/api key, 然后 `--resume` |
| Phase 3 单文件 LLM 失败 | CLI 自动 retry 1 次, 仍失败则跳过并记录到 `session.phase3_skipped[]`, 继续下一个 (不阻塞整体) |
| Phase 3 整体崩溃 | session 保留所有已 ingest atom + processed list, 用户可 `--resume <id>` 从 next 文件继续 |
| 用户主动 Ctrl-C | 优雅退出, session 保留, 已 ingest atom **不**回滚 (它们已通过 schema 校验, 是合法 atom) |
| commit 时 markdown 解析失败 (用户改坏了格式) | exit 1 + stderr 给具体错误行号, session 不损坏, 用户可改完 markdown 重跑 commit |
| commit 时全部候选被用户删了 (exit 4) | 告诉用户"你删完了所有条目, 没东西可写。要不要重跑 dry-run?" |

**核心原则**: bootstrap 失败**绝不能**让 session 状态损坏。任何 phase 退出, session 文件都必须保持可 `--resume`。

---

## V2.x 阶段限制 (v3 视反馈再放开)

- **profile 不被 read 自动注入** (B-I3): v1 仅观察, 等用户校准后 v2 启用
- **profile 不参与 mentor gap 分析** (D-007): v1 不消费, v2 加 declared vs inferred 对比
- **bootstrap 不处理图片 / PDF / EPUB / 音视频**: v1 只 .md / .txt / .json / 源代码
- **bootstrap 不支持增量更新**: v1 重跑会全量重新归类; v2 加"扫描新增文件 merge 进既有 profile"
- **prompt 模板不可 override** (B-I8): v1 hard-code, v2 视反馈再开放
- **多设备同步**: v1 单设备, profile 单例无 conflict resolution

---

## 来源 + 协作

这个 skill 与 `atomsyn-write` / `atomsyn-read` / `atomsyn-mentor` 一起构成 Atomsyn L2 (面向 AI) 的 4 个 skill:

| Skill | 角色 |
|---|---|
| atomsyn-bootstrap | **冷启动** — 一次性把存量素材结构化进库 |
| atomsyn-write | 增量沉淀 — 单点对话产出 atom |
| atomsyn-read | 检索相遇 — 把已有 atom 在对话中召唤出来 |
| atomsyn-mentor | 复盘教练 — 主动分析认知盲区 + 主动建议 prune |

实现层: CLI 子命令 `atomsyn-cli bootstrap`, 内部分散在 `scripts/lib/bootstrap/{triage,sampling,deepDive,session,privacy,ignore,extract,commit}.mjs`, prompt 模板在 `scripts/bootstrap/prompts/*.md`。

完整契约见 `openspec/changes/2026-04-bootstrap-skill/` 的 proposal.md / design.md / decisions.md。
