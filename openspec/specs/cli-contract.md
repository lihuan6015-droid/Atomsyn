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
