# Specs · 稳定契约层

> **一句话**: `specs/` 存放 Atomsyn 跨 change 长期有效的稳定接口契约。`changes/` 是流水, `specs/` 是沉淀。

---

## 1 · 为什么需要单独的 specs/

`changes/<id>/` 内的 design.md 描述的是 **某一次具体改动**。但有些契约是**跨 change 长期生效**的:

- `atomsyn-cli` 的命令面 —— GUI、Skill、未来集成都依赖它
- 三个 Skill (write/read/mentor) 的触发条件和不可变承诺 —— 用户的肌肉记忆和 Claude/Cursor 配置都依赖它
- JSON Schema 的顶层结构 —— 整个数据生态都依赖它

这些契约**不属于任何一次 change**, 但**任何一次 change 都可能动它们**。把它们沉淀到 `specs/`, 让契约本身成为一份独立的、可被多次 change 修订的活文档。

---

## 2 · changes/ 与 specs/ 的关系

```
changes/<id>/design.md  →  本次改动怎么做 (流水)
                        ↓
                        ↓  实施后, 如改动了稳定接口, 必须同步更新
                        ↓
specs/<file>.md         →  系统当前的稳定契约 (沉淀)
```

每份 specs/ 文档末尾都有一个 `## Schema Changelog` 或 `## Changelog` 区, 记录"哪个 change 在哪个日期改动了什么"。

---

## 3 · 铁律

1. **不直接编辑 specs/** —— 任何对稳定契约的修改都必须**通过一次 change**。如果你想直接改, 停下来, 建一个最小 change 来承载这次修改。
2. **change 实施完毕、动了稳定接口的, 必须同步更新 specs/** —— 这一步在 tasks.md 的 F 组里被强制
3. **specs/ 是只增不减的契约史** —— 旧的承诺标记为 deprecated, 而不是直接删除

---

## 4 · 当前 specs/ 文档

| 文件 | 作用 | 状态 |
|---|---|---|
| `cli-contract.md` | atomsyn-cli 命令面、参数、退出码、副作用 | 占位 (TODO 填充) |
| `skill-contract.md` | atomsyn-write / atomsyn-read / atomsyn-mentor 三个 Skill 的稳定契约 | 占位 (TODO 填充) |
| `data-schema.md` | 顶层数据形态总览 + Schema Changelog | 占位 (TODO 填充) |

> 当前 (2026-04) specs/ 都还是占位状态。后续每个 change 在归档时, 应同步把自己触动的契约部分填进对应的 specs/。

---

## 5 · 如何阅读 specs/

新人 onboarding 时建议:
1. 先读 `cli-contract.md` —— 了解工具最外层的入口
2. 再读 `skill-contract.md` —— 了解 Agent 怎么调用 Atomsyn
3. 最后读 `data-schema.md` —— 了解底层数据形态

