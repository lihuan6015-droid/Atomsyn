# Skill Contract · Atomsyn 三个 Skill 的稳定契约

> **一句话**: 本契约锁定 `atomsyn-write` / `atomsyn-read` / `atomsyn-mentor` 三个 Skill 的触发条件、Token 预算、不可变承诺。它们安装到 Claude Code / Cursor 后, 是用户与 Atomsyn 的核心 Agent-facing 入口。
>
> **修改规则**: 严禁直接编辑本文件。任何 Skill 契约变更必须通过一次 openspec change。
>
> **Skill 文件位置**:
> - 项目内源文件: `skills/atomsyn-*.skill.md`
> - 安装后: `~/.claude/skills/atomsyn-*/` (Claude Code) · Cursor 同样位置

---

## 1 · 三个 Skill 的角色总览

| Skill | 哲学 | 何时触发 |
|---|---|---|
| `atomsyn-write` | **沉淀即投资** —— 自带主动建议哲学, 在自然停顿时短问一句 "要不要记一下" | 对话中产生了"如果不记下来未来不会知道"的认知 |
| `atomsyn-read` | **默认主动 + 空结果沉默** —— 任何非闲聊的实质性工作开始前都先调一次 | 用户提出实质性问题, 先看本地资产 |
| `atomsyn-mentor` | **数据驱动 + 教练闭环** —— 主动分析盲区和趋势, 推用户行动 | 用户说 "复盘" / "导师模式" / "回顾一下" / "我最近学了什么" / "我的盲区" |

---

## 2 · `atomsyn-write` 契约

### 2.1 触发条件
[TODO] 详细触发条件待 change 锁定。当前文档参考: `skills/atomsyn-write.skill.md`

### 2.2 不可变承诺 (Invariants)

[TODO] 预占位:

- W-I1. **永不绕过 CLI**: write Skill 不直接写文件, 只通过 `atomsyn-cli ingest/write/update`
- W-I2. **写前先 find**: 写入前必须调用 `atomsyn-cli find` 检查是否已存在相似 atom, 优先 update 而非新建
- W-I3. **不替用户决定**: 不主动写入, 只在自然停顿时**问一句**, 用户拒绝则沉默
- W-I4. **schema 严格**: 任何写入必须通过 schema 校验, 失败时**不重试**, 让 CLI 报错给用户

### 2.3 Token 预算
[TODO]

### 2.4 输入/输出格式
[TODO]


## 3 · `atomsyn-read` 契约

### 3.1 触发条件
[TODO] 当前文档参考: `skills/atomsyn-read.skill.md`

### 3.2 不可变承诺

[TODO] 预占位:

- R-I1. **空结果沉默**: 找不到相关 atom 时不输出任何东西, 不假装有内容
- R-I2. **只读不写**: read Skill 永远不写入数据
- R-I3. **优先级高于训练知识**: 用户验证过的本地经验比通用知识更可信
- R-I4. **轻调用**: 默认 `--top` 不超过 5, 避免 context 爆炸

### 3.3 Token 预算
[TODO]

### 3.4 输入/输出格式
[TODO]


## 4 · `atomsyn-mentor` 契约

### 4.1 触发条件
[TODO] 当前文档参考: `skills/atomsyn-mentor.skill.md`

### 4.2 不可变承诺

[TODO] 预占位:

- M-I1. **教练不居高临下**: 输出语气是 "我看到 X, 你可能想看看", 不是 "你应该 X"
- M-I2. **数据有源**: 任何洞察必须能追溯到具体 atom / practice / 时间窗
- M-I3. **行动可执行**: 每条建议必须给 1 个 ≤ 30 分钟的下一步动作, 不给空洞鼓励
- M-I4. **不重复唤醒**: 同一盲区/趋势不在短期内重复推送 (具体阈值 [TODO])

### 4.3 Token 预算
[TODO]

### 4.4 输入/输出格式
[TODO]


---

## 5 · 跨 Skill 共享契约

### 5.1 数据目录解析
所有 Skill 必须通过 `atomsyn-cli where` 或 CLI 命令隐式解析数据目录, 不假定路径。

### 5.2 安装与升级
- 安装: `atomsyn-cli install-skill --target claude,cursor`
- 升级: 重新运行同命令, 旧文件被覆盖
- 卸载: 由用户手工删除 `~/.claude/skills/atomsyn-*/`

### 5.3 隐私边界
- Skill 在 prompt 里**不打印** data 目录的绝对路径 (避免泄露用户名)
- Skill 在 prompt 里**不打印** 完整 atom 内容到 LLM 服务商, 只打印必要字段

[TODO] 详细隐私字段清单待 change 填充

---

## 6 · 实现引用

- Skill 文件: `skills/atomsyn-write.skill.md` · `skills/atomsyn-read.skill.md` · `skills/atomsyn-mentor.skill.md`
- 安装逻辑: `scripts/atomsyn-cli.mjs install-skill` 子命令 + Tauri `install_agent_skills` 命令
- 测试方法: 在 Claude Code / Cursor 内手动触发, 观察是否符合契约

---

## 7 · Changelog

> 每次 change 归档时, 如改动了 Skill 触发条件 / 不可变契约 / Token 预算, 在此追加。
>
> 格式: `YYYY-MM-DD · <change-id> · <skill-name> · <一句话摘要>`

- 2026-04-26 · openspec-bootstrap · all · 建立本契约文档骨架, 内容标记 [TODO] 待后续 change 填充
