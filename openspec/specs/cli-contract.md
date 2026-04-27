# CLI Contract · atomsyn-cli 稳定接口规范

> **一句话**: 本契约锁定 `atomsyn-cli` 的命令面、输入输出格式、退出码语义和副作用。所有 GUI / Skill / 第三方集成都依赖此契约。
>
> **修改规则**: 严禁直接编辑本文件。任何 CLI 接口变更必须通过一次 openspec change。change 归档时同步更新本文件并在 §Changelog 记录。
>
> **CLI 入口位置**:
> - 项目内开发: `scripts/atomsyn-cli.mjs`
> - 用户安装后: `~/.atomsyn/bin/atomsyn-cli` (sh shim) → `~/.atomsyn/bin/atomsyn-cli.mjs`

---

## 1 · 命令面总览 (Command Surface)

> ⚠️ 当前为快照参考, 详细参数和输出格式待逐条填充。每条命令的"详细契约"章节标记 `[TODO]` 表示待后续 change 填充。

| 命令 | 一句话职责 | 主要消费者 |
|---|---|---|
| `atomsyn-cli write   --stdin/--input` | 创建新经验 atom (loose JSON in) | atomsyn-write Skill |
| `atomsyn-cli update  --id <id> --stdin/--input` | 合并到已有 atom; 名字变更时原子地搬 slug 目录 | atomsyn-write Skill |
| `atomsyn-cli get     --id <id>` | 打印一份 atom JSON (找不到 exit 2) | Skill / 调试 |
| `atomsyn-cli find    --query "..." [--with-taxonomy] [--top N]` | 关键词搜索经验 atoms (Skill 写入前先调) | atomsyn-write / atomsyn-read |
| `atomsyn-cli read    --query "..." [--top N]` | markdown 输出, 给 atomsyn-read Skill 消费 | atomsyn-read Skill |
| `atomsyn-cli ingest  --stdin [--dry-run]` | 沉淀新原子 (经验/方法论/碎片), 含 taxonomy 推断 | atomsyn-write Skill |
| `atomsyn-cli mentor  [--range week\|month\|all] [--format data\|report]` | 复盘聚合: 盲区 / 趋势 / 行动建议 | atomsyn-mentor Skill |
| `atomsyn-cli reindex` | 重建 `data/index/knowledge-index.json` | GUI / 自动化脚本 |
| `atomsyn-cli where` | 打印当前数据目录绝对路径 | 调试 / 跨工具协同 |
| `atomsyn-cli install-skill --target claude,cursor` | 把 atomsyn-* skill 安装到 Claude Code / Cursor | 用户 / Tauri 安装器 |
| `atomsyn-cli supersede --id <old> --input <file> [--no-archive-old]` | 用新 atom 取代旧 atom, 默认同时 archive 旧的 (V2.x cognitive-evolution) | atomsyn-write Skill / atomsyn-mentor Skill |
| `atomsyn-cli archive --id <id> [--reason "..."] [--restore]` | 软删除 atom (read/find 默认不返); --restore 反归档 (V2.x cognitive-evolution) | atomsyn-mentor Skill / 用户 |
| `atomsyn-cli prune [--limit N]` | 永远 dry-run 扫描 prune 候选, 输出 JSON 让用户裁决 (V2.x cognitive-evolution) | atomsyn-mentor Skill |
| `atomsyn-cli bootstrap --path <dir-or-file> [--mode agentic\|funnel] [--dry-run \| --commit <id> \| --resume <id>] ...` | 引导式批量冷启动, 把硬盘上的过程文档按 5 层架构提炼成 1 profile + N experience/fragment atom; v2 默认 agentic 模式 (LLM tool-use 探索), funnel 是兜底 (V2.x bootstrap-skill + bootstrap-tools) | atomsyn-bootstrap Skill / GUI 初始化向导 / ChatInput `/bootstrap` 命令 |

---

## 2 · 通用约定

### 2.1 退出码语义 (Exit Codes)

> [TODO] 待后续 change 锁定全部退出码。当前已知约定:

| 退出码 | 含义 |
|---|---|
| `0` | 成功 (含 collision_candidates 警告 — 不阻塞) |
| `1` | 通用失败 (参数错误 / IO 错误 / 内部异常) |
| `2` | 找不到目标 (atom not found / query 为空) |
| `3` | 锁冲突 / archive 状态冲突 (atom locked / already archived / superseded / not archived 等不变量违反) |
| `4` | schema 校验失败 / 输入不可读 |

### 2.2 输入约定

- `--stdin`: 从 stdin 读 JSON
- `--input <file>`: 从文件读 JSON
- 两者互斥, 同时给以 `--stdin` 为准

### 2.3 输出约定

- 默认输出: 单行 JSON 或多行 markdown (具体见每条命令)
- `--format json`: 强制 JSON
- 错误信息: 走 stderr, 主输出走 stdout
- 静默成功: 写入类命令成功后只打一行 `{ok:true,id:"..."}` (具体格式 TODO)

### 2.4 副作用约定

任何写操作命令必须:
1. 通过 schema 校验 (`skills/schemas/*.schema.json`)
2. 写入 `data/...` 后调用 reindex (隐式)
3. 在 `data/growth/usage-log.jsonl` 追加事件 (具体事件结构见 [TODO])

---

## 3 · 命令详细契约

### 3.1 `atomsyn-cli write`

[TODO] 待 change 填充

- 输入 schema:
- 输出 schema:
- 退出码:
- 副作用:

### 3.2 `atomsyn-cli update`

[TODO]

### 3.3 `atomsyn-cli get`

[TODO]

### 3.4 `atomsyn-cli find`

[TODO]

### 3.5 `atomsyn-cli read`

[TODO]

### 3.6 `atomsyn-cli ingest`

[TODO]

### 3.7 `atomsyn-cli mentor`

[TODO]

### 3.8 `atomsyn-cli reindex`

[TODO]

### 3.9 `atomsyn-cli where`

[TODO]

### 3.10 `atomsyn-cli install-skill`

[TODO]

### 3.11 `atomsyn-cli supersede` (V2.x cognitive-evolution)

```
atomsyn-cli supersede --id <old-id> --input <new-atom-file> [--no-archive-old]
```

- 输入: 新 atom 的 loose JSON (走 normalizeExperienceAtom 规整为合法 experience atom)
- 行为:
  1. 校验旧 atom 存在、未 locked、未 archived
  2. 写入新 atom (跳过 collision check, 设 ATOMSYN_SKIP_COLLISION 内部标志)
  3. 设 `newAtom.supersedes = [oldId, ...合并旧链]`
  4. 设 `oldAtom.supersededBy = newId`; 默认 `oldAtom.archivedAt = now` (除非 --no-archive-old)
  5. reindex
- 输出 (stdout, JSON): `{ok, oldId, newId, oldPath, newPath, archivedOld, hint}`
- 退出码: 0 / 2 (OLD_NOT_FOUND) / 3 (OLD_LOCKED, OLD_ALREADY_ARCHIVED) / 4 (输入校验失败)
- 副作用: 新 atom 写入 + 旧 atom 修改 + reindex + usage-log 追加 `supersede.applied`

### 3.12 `atomsyn-cli archive` (V2.x cognitive-evolution)

```
atomsyn-cli archive --id <id> [--reason "..."] [--restore]
```

- `--reason`: 用户提供的归档理由, ≤ 500 字符
- `--restore`: 反向操作, 清空 archivedAt + archivedReason
- 行为: archive 时设 `archivedAt = now` + 可选 archivedReason; restore 时清空两字段
- 输出: `{ok, atomId, archivedAt, restored?, hint}`
- 退出码: 0 / 2 (NOT_FOUND) / 3 (LOCKED, NOT_ARCHIVED for restore) / 4 (reason 超长)
- 副作用: atom JSON 修改 + reindex + usage-log 追加 `archive.applied` 或 `archive.restored`

### 3.13 `atomsyn-cli prune` (V2.x cognitive-evolution)

```
atomsyn-cli prune [--limit N]
```

- **永远 dry-run** (D-005), 不接受 --apply 或类似 flag
- 行为: 扫描 corpus, 三维度并集 (contradiction / long-untouched / broken-ref), 输出候选 JSON
- 输出: `{ok, candidates: [...], summary: {total_atoms, candidates_count, by_reason}, hint}`
- 退出码: 0 (无候选也是 0) / 4 (--limit < 1)
- 副作用: 仅读, usage-log 追加 `prune.scanned` 用于观察使用频次

### 3.14 `atomsyn-cli bootstrap` (V2.x bootstrap-skill)

```
atomsyn-cli bootstrap --path <dir-or-file>
                     [--path <dir2> ...]
                     [--mode agentic|funnel]
                     [--phase triage|sampling|deep-dive|all]
                     [--parallel]
                     [--include-pattern <glob>]
                     [--exclude-pattern <glob>]
                     [--dry-run]
                     [--commit <session-id>]
                     [--resume <session-id>]
                     [--user-correction <text>]
                     [--markdown-corrected-file <path>]
```

> **v2 (bootstrap-tools)**: `--path` 现在接受目录或具体文件 (`.md / .markdown / .txt / .docx / .pdf / .json / .yaml`); `--mode agentic` (default, D-001) 用 LLM tool-use 循环 (`ls/stat/glob/grep/read`) 探索式处理混合目录, `--mode funnel` 是 v1 硬编码 5 层 funnel (D-008 保留作 fallback)。

#### 3.14.1 参数面

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `--path` | string | yes (除非 `--resume` 或 `--commit`) | 用户指定的扫描根 — 可以是目录, **v2 起也支持具体文件路径**, 可多次出现 |
| `--mode` | enum | no, default `agentic` (bootstrap-tools D-001) | `agentic` (LLM 用 ls/stat/glob/grep/read 工具集探索) 或 `funnel` (v1 硬编码 5 层串行, fallback). agentic 失败时 cmdBootstrap 自动 fallback 到 funnel 一次 + WARN |
| `--phase` | enum | no, default `all` | 走单一阶段 (`triage` / `sampling` / `deep-dive`) 或全程 (`all`); 单阶段会把状态写 session 等待下次推进 |
| `--parallel` | flag | no | Phase 3 funnel 模式启用 4 路 sub-agent 并行 (token cost 4x; D-004 默认串行); agentic 模式无效 (single LLM session) |
| `--include-pattern` | string (csv) | no | 仅扫描匹配的文件 (e.g. `"*.md,*.txt"`) |
| `--exclude-pattern` | string (csv) | no | 排除匹配的文件, 与 `.atomsynignore` 叠加生效 |
| `--dry-run` | flag | no | **D-011 第一阶段**: 走完三阶段, 仅输出**用户友好 markdown 报告** (持久化为 session 的 `.md` 文件), **不调用 LLM 生成 atom JSON, 不写入磁盘** |
| `--commit` | string | no | **D-011 第二阶段**: 与 `--dry-run` 配对; 传入已批注的 session id, CLI 读取 session markdown (默认从文件, 可由 `--markdown-corrected-file` 覆盖), 调用 LLM 把每条候选转成 atom JSON, 通过 `atomsyn-cli ingest` 落盘 |
| `--markdown-corrected-file` | string (path) | no, only with `--commit` | 用户在 markdown 上 inline 修改后的文件路径; 不传则用 session 内的原始 markdown |
| `--resume` | string | no, mut excl `--path` | 从已有 session 续跑未完成的 phase |
| `--user-correction` | string | no, only with `--phase deep-dive` | 用户在 Phase 2 给出的画像更正文字 (CLI 单轮场景下替代 commit 时的 inline markdown 修改) |

#### 3.14.2 退出码

| 退出码 | 含义 |
|---|---|
| `0` | 成功 (含 `sensitive_skipped` / `phase3_skipped` 的情况也是 0, 警告走 stderr) |
| `1` | 通用失败 (LLM 调用失败 / IO 错误 / schema 校验失败) |
| `2` | 找不到 `--path` 指定的目录 / 找不到 `--resume` 或 `--commit` 的 session |
| `3` | 用户在 AskUserQuestion 关卡选择"放弃" (Skill 收到此码后输出"已停止, session 保留可 resume") |
| `4` | 隐私关键字命中导致全部候选被过滤 (要求用户明确放行); 或 commit 阶段 markdown 解析失败 (schema 校验) |

#### 3.14.3 stdout 输出约定

- `--phase triage`: markdown 表格 (类型分布 + 总大小 + 默认 `sensitive_skipped` 列表)
- `--phase sampling`: markdown 画像假设 (identity + preferences 5 维 + knowledge_domains)
- `--phase deep-dive` (无 dry-run/commit): markdown 进度行 (每 N 个文件一行) + 最终完成报告
- `--dry-run` (与 phase 组合): 三阶段输出 + Phase 3 末尾的人类友好 markdown 候选列表 (name / 一句话 insight / 5 层归类 / 原文片段 50 字截断 / confidence / 建议 tags), 不含完整 atom JSON
- `--commit`: 进度行 + 最终的 `{ok: true, session_id, atoms_created: {profile, experience, fragment}, ...}` JSON
- `--phase all`: 三阶段输出连续打出, 每阶段之间打分隔线

#### 3.14.4 stderr 输出约定

- LLM 调用失败 / 重试 / fallback 提示
- 隐私扫描命中警告 (强敏感整文件跳过, 弱敏感字段 redact)
- 解析失败行号定位 (commit 阶段 markdown 容错解析)
- 黄色 ⚠️ 警告与现有 cli-contract §3.11~3.13 一致语义

#### 3.14.5 副作用

- 写入/更新 `~/.atomsyn/bootstrap-sessions/<session-id>.json` (任何 phase 都写; v2 起含 `options.mode` + `agent_trace[]` additive 字段) + `~/.atomsyn/bootstrap-sessions/<session-id>.md` (dry-run / commit 时, agentic 模式 markdown 末尾包含 "Agent 探索轨迹" 折叠章节)
- Phase 3 commit 阶段内部调用 `atomsyn-cli ingest --stdin` 写入 atoms (不绕过 ingest, 保持 CLI-first 铁律 I1)
- profile 单例语义 (D-010): 写入 profile 时若 `<dataDir>/atoms/profile/main/atom_profile_main.json` 已存在, 调用 `applyProfileEvolution(deps, {newSnapshot, trigger: "bootstrap_initial" | "bootstrap_rerun"})` (cognitive-evolution change 已就位, 见 cli-contract §3.11~3.13 共享演化层); 现有快照推入 `previous_versions[]` 顶部, 新数据覆写顶层字段
- 写入 `data/growth/usage-log.jsonl`, 5 种事件:
  - `{event: "bootstrap.started", session_id, paths, ts}`
  - `{event: "bootstrap.phase_completed", session_id, phase, duration_ms, ts}`
  - `{event: "bootstrap.dry_run_completed", session_id, candidates_count, sensitive_skipped, ts}`
  - `{event: "bootstrap.commit_completed", session_id, atoms_created: {profile, experience, fragment}, files_processed, files_skipped, ts}`
  - `{event: "bootstrap.failed", session_id, phase, error, ts}`
- 全部完成后调用 `rebuildIndex()`

#### 3.14.6 dry-run + commit 两阶段协议 (D-011)

bootstrap 区别于 supersede/archive 等命令的最大特点是**写入永不一步到位**, 必须经过两阶段:

**阶段 1 · `--dry-run` (cheap pass)**:
1. CLI 走完 TRIAGE + SAMPLING + (轻量) DEEP DIVE
2. DEEP DIVE 中调用 LLM 时**只要求输出每个候选 atom 的人类友好 markdown 表格** (省 ~60% token vs 完整 JSON)
3. 持久化到 `~/.atomsyn/bootstrap-sessions/<session-id>.md`
4. 用户可在 markdown 上**直接编辑**: 删行 / 改 name / 改归类 / 加 tags / 加用户备注

**阶段 2 · `--commit <session-id>` (write pass)**:
1. CLI 读 session 的 markdown (默认从 session 文件, 也可由 `--markdown-corrected-file` 或数据 API 端点 `POST /bootstrap/sessions/:id/commit` 的 `markdown_corrected` 字段传入用户已编辑版本)
2. 对 markdown 中保留的每条候选, 调用 LLM 生成完整 atom JSON (这次有完整 schema 字段)
3. LLM prompt 中必须把"用户保留 + 用户修改的 markdown"作为输入, 让 LLM 在生成时已知用户偏好
4. 通过 `atomsyn-cli ingest --stdin` 写入磁盘 (经过 schema 校验 + 派生 slug + reindex)
5. profile atom 此阶段同样生成 + 落盘 (走 `applyProfileEvolution`, trigger=`bootstrap_initial` 或 `bootstrap_rerun`)
6. commit 解析失败时不损坏原 session, 给出明确错误信息让用户重试

**Skill 规约**: `atomsyn-bootstrap` Skill 的标准工作流必须先 `--dry-run` 再 `--commit`, 引导用户时必须明确两步 (B-I6 不可变承诺, 见 skill-contract §5)。

#### 3.14.7 LLM Prompt 模板锁定 (D-012)

5 层归类 + 5 维数值推断 + commit JSON 生成的 prompt 模板**hard-code** 在仓库内 `scripts/bootstrap/prompts/` 目录:

```
scripts/bootstrap/prompts/
├── triage.md             # Phase 1 不需要 LLM, 占位
├── sampling.md           # Phase 2 SAMPLING 用的 prompt
├── deep-dive-l1-l2.md    # funnel mode: Profile + Preferences 提炼
├── deep-dive-l3.md       # funnel mode: Episodic 经验提取
├── deep-dive-l4.md       # funnel mode: Domain 领域归类
├── deep-dive-l5.md       # funnel mode: Reflections 反思提取
├── agentic-deepdive.md   # bootstrap-tools v2: LLM tool-use system prompt (D-001)
└── commit.md             # markdown → atom JSON 转换
```

CLI 启动时硬加载这些 prompt, **不允许通过环境变量 / 配置文件 override** (v1)。v2 视用户反馈再考虑开放路径。

### 3.15 GUI API 端点 (双通道)

GUI 走数据 API 调用 bootstrap / profile 相关功能, 必须遵循双通道铁律 (Vite dev `vite-plugin-data-api.ts` + Tauri prod `src/lib/tauri-api/routes/*.ts` 同步实现, 见 data-schema §6)。

| 方法 | 路径 | 请求体 | 响应 | 错误 | 主要消费者 |
|---|---|---|---|---|---|
| GET | `/atoms/profile` | (no body) | `{atom: ProfileAtom \| null}` (单例返回, 不存在为 null, D-010) | 5xx | ProfilePage |
| GET | `/atoms/profile/versions` | (no body) | `{versions: ProfileVersionSnapshot[]}` (按时间倒排, D-010 `previous_versions[]`) | 404 (无 profile) | ProfilePage 时间线 |
| POST | `/atoms/profile/restore` | `{version: number}` | `{ok: true, atom: ProfileAtom}` (从 `previous_versions` 选定版本恢复, 当前版本被推入 `previous_versions`, trigger=`restore_previous`) | 400 / 404 | ProfilePage 时间线 restore 按钮 |
| POST | `/atoms/:id/calibrate-profile` | `{verified: true, identity?: {...}, preferences?: {...}, knowledge_domains?: [...], recurring_patterns?: [...]}` | `{ok: true, atom: ProfileAtom}` (旧版本被推入 `previous_versions`, trigger=`user_calibration`, D-013) | 400 schema 失败 / 404 | ProfilePage 校准面板 |
| GET | `/bootstrap/sessions` | (no body) | `{sessions: BootstrapSessionSummary[]}` (列出 `~/.atomsyn/bootstrap-sessions/`) | 5xx | BootstrapWizard 历史列表 |
| GET | `/bootstrap/sessions/:id` | (no body) | `BootstrapSession` (含 markdown 报告原文 + 状态 + phase 进度) | 404 | BootstrapWizard dry-run 报告屏 |
| POST | `/bootstrap/sessions/:id/commit` | `{markdown_corrected: string \| null}` | `{ok: true, atoms_created: N, session: BootstrapSession}` (调用 CLI bootstrap `--commit`; Tauri packaged 模式当前返回 501, 待 Rust shell command 包装) | 400 / 409 (already committed) / 501 (Tauri packaged 暂未实现) | BootstrapWizard 确认写入按钮 |
| DELETE | `/bootstrap/sessions/:id` | (no body) | `{ok: true}` | 404 | BootstrapWizard 历史列表删除 |

**关键端点说明**:

- `POST /atoms/:id/calibrate-profile` (D-013): 用户在 GUI 校准面板提交修改, 响应里 `atom.verified` 必须 = true, `verifiedAt` 必须更新, 修改前的 profile 快照自动推入 `previous_versions[]` (调 `applyProfileEvolution`, trigger=`user_calibration`)
- `POST /bootstrap/sessions/:id/commit` (D-011): GUI 的"确认写入"按钮调用此端点, 等价于 CLI `atomsyn-cli bootstrap --commit <id>`。可选传 `markdown_corrected` 包含用户在 markdown 上的逐行修改; 不传则用 session 里的原始 markdown
- `POST /atoms/profile/restore` (D-010 + D-013): 用户从 `previous_versions` 时间线选某个历史版本恢复, 当前版本被推入 `previous_versions`, 实现"无损版本切换"
- 任何写操作 (calibrate / restore / commit) 后必须调用 `rebuildIndex()` (与 cli-contract §3.11~3.13 一致语义)

**实现位置**:
- Dev 模式: `vite-plugin-data-api.ts` 中新增上述 8 条路由
- Tauri 模式: `src/lib/tauri-api/routes/atoms.ts` (4 条 profile 端点) + 新文件 `src/lib/tauri-api/routes/bootstrap.ts` (4 条 sessions 端点); 在 `src/lib/tauri-api/router.ts` handlers 数组注册

---

## 4 · 不可变契约 (Invariants)

下列承诺一旦写入, 任何 change 都不可破坏 (除非进行版本号 major 跳跃, 并完整迁移):

> [TODO] 待逐条沉淀。预占位:

- I1. **CLI-first 写入**: 所有写入数据的路径都必须能通过 atomsyn-cli 完成 (GUI 也走 CLI 内部使用的同一份逻辑)
- I2. **数据目录解析**: CLI 永远使用 `resolveDataDir()` 解析数据目录, 不依赖 PROJECT_ROOT 或当前工作目录
- I3. **本地优先**: CLI 不向任何外部网络服务发请求 (LLM 调用走配置, 由 GUI / Skill 决定)
- I4. **退出码语义稳定**: 已发布版本的退出码语义不可改, 新增退出码必须使用未占用值

---

## 5 · 实现引用 (Implementation Pointers)

- 入口脚本: `scripts/atomsyn-cli.mjs`
- 核心库: `scripts/lib/*.mjs` (resolve, write, read, find, mentor 等)
- Schemas: `skills/schemas/*.schema.json`
- 安装目标: `~/.atomsyn/bin/`

---

## 6 · Changelog

> 每次 change 归档时, 如改动了 CLI 命令面, 在此追加一行。
>
> 格式: `YYYY-MM-DD · <change-id> · <一句话摘要>`

- 2026-04-26 · openspec-bootstrap · 建立本契约文档骨架, 全部内容标记 [TODO] 待后续 change 填充
- 2026-04-26 · 2026-04-cognitive-evolution · 新增 supersede / archive / prune 三个命令; read/find 输出新增 staleness + supersededBy + history 字段 (`--show-history`/`--include-profile`/`--json` 可选 flag); write/update 默认开启 collision check (`--check-collision`/`--no-check-collision` 可控); update 拒绝改 archived/superseded atom; 退出码 1/2/3/4 五档统一
- 2026-04-26 · 2026-04-bootstrap-skill · 新增 bootstrap 子命令 (3 阶段 funnel + dry-run/commit 两阶段), 含 `--path` (可重复) / `--phase` / `--parallel` / `--include-pattern` / `--exclude-pattern` / `--dry-run` / `--commit` / `--resume` / `--user-correction` / `--markdown-corrected-file`; 退出码 0/1/2/3/4 (新增 4 = 隐私全过滤或 commit markdown 解析失败); 新增 §3.15 GUI API 端点章节 (8 条双通道端点: 4 atoms profile + 4 bootstrap sessions, commit 端点在 Tauri packaged 模式当前返回 501)
- 2026-04-27 · 2026-04-bootstrap-tools · bootstrap 子命令新增 `--mode agentic|funnel` flag (default agentic, D-001); `--path` 接受目录或文件; agentic 模式失败时 cmdBootstrap 自动 fallback funnel + WARN; session schema additive 加 `options.mode` + `agent_trace[]` (tool 调用 timeline, D-003); LLM prompt 列表加 `agentic-deepdive.md`; 文档解析层从硬编码扩成 extractors/ 目录 (markdown / code / text / docx via mammoth / pdf via pdfjs-dist, D-004)
