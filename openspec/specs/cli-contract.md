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

---

## 2 · 通用约定

### 2.1 退出码语义 (Exit Codes)

> [TODO] 待后续 change 锁定全部退出码。当前已知约定:

| 退出码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 通用失败 (参数错误 / IO 错误 / schema 校验失败) |
| `2` | 找不到目标 (atom not found 等) |
| `3` | [TODO] 锁冲突? 待定 |

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
