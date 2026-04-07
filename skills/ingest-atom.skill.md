# Ingest Atom Skill

> 把一段原始笔记 / 文章 / AI 对话总结，沉淀为一张符合 schema 的知识原子卡片。

## 触发词

- "帮我沉淀这段笔记"
- "存到 ccl_pm_tool"
- "把这个做成一张卡片"
- "沉淀为方法论原子"

## 7 步流程

### Step 1 · 归属诊断

1. 读取 `data/frameworks/*.json` 了解所有现有骨架
2. 根据笔记主题判断归属哪个骨架（产品创新 / UI/UX / Agent 开发 / ...）
3. 如果没有合适骨架，**先问用户**：归到现有某个骨架，还是新建一个骨架？
4. 确认骨架后，从 `framework.matrix.cells` 中找到匹配的 cell（例如 `cellId: 2` = "用户声音"）
5. **不要猜测**——找不到合适的 cell 时，向用户确认而不是硬塞

### Step 2 · 结构化提炼

从原始笔记中抽取以下字段：

| 字段 | 提炼要点 | 长度 |
|---|---|---|
| `name` | 方法论的中文名 | 短 |
| `nameEn` | 英文名/缩写 | 短 |
| `coreIdea` | 用 1-2 句话概括核心理念 | **不超过 80 字** |
| `whenToUse` | 适用场景 · 用「·」分隔 | 1 行 |
| `keySteps` | 关键步骤数组 | 3-6 步 |
| `aiSkillPrompt` | ⭐ **最关键字段** | 完整 prompt |
| `example` | 经典案例（如有） | title + content |
| `tags` | 3-5 个相关标签 | 数组 |

### Step 3 · `aiSkillPrompt` 必须满足的结构

```
你是一位<角色>。我将提供<输入类型>，请你：

1. <任务 1>
2. <任务 2>
3. <任务 3>

<输入字段名>：{请在此处填入}
```

**强制要求**：
- 必须包含 `{请在此处填入}` 占位符
- 必须有清晰的角色设定
- 必须有编号的输出任务列表
- 不要写"请你详细分析"这种模糊指令——具体到每条产出物

### Step 4 · 父子关系判断

- 查询同 cell 下的现有原子：`ls data/atoms/<frameworkId>/<cellSlug>/`
- 如果新原子是某个伞级原子的子集（例如 JTBD 是 VOC 的子集），设置：
  - `parentAtomId: "atom_<parent>"`
  - `relationType: "child"`
- 否则不设这两个字段

### Step 5 · Schema 校验

验证生成的对象符合 `skills/schemas/atom.schema.json`：
- 所有 required 字段存在
- `id` 格式：`atom_<lowercase-slug>`
- `cellId` 是 framework 中真实存在的 stepNumber
- `coreIdea` ≤ 500 字
- `bookmarks: []`、`stats: { usedInProjects: [], useCount: 0 }` 默认值

不通过则**修正后重试**，不要把不合规对象写盘。

### Step 6 · 写入文件

路径规则：
```
data/atoms/<frameworkId>/<cellNumber>-<cellSlug>/<atom-slug>.json
```

例如：
```
data/atoms/product-innovation-24/02-voc/jtbd.json
data/atoms/product-innovation-24/02-voc/kano.json
```

- 文件名用 **kebab-case**（避免中文文件名）
- `createdAt` / `updatedAt` 使用 ISO 8601 格式

### Step 7 · 重建索引 + 汇报

写入完成后：

1. 如果 dev server 正在跑 → 它已自动重建索引，无需手动操作
2. 如果 dev server 没跑 → 运行 `npm run reindex`

最后向用户汇报：

```
✅ 已沉淀 1 张原子：

• 名称：Jobs To Be Done
• 归属：产品创新 24 步法 → 02 用户声音
• 父级：VOC（atom_voc_overview）
• 文件：data/atoms/product-innovation-24/02-voc/jtbd.json

下一步建议：
- 是否要顺便补一张兄弟原子（KANO 模型）？
- 是否要立刻在某个项目演练场中实践这张卡片？
```

---

## 反模式 · 永远不要做

- ❌ 不要把原始笔记**直接复制**到 `coreIdea` ——必须提炼压缩到 80 字内
- ❌ 不要跳过 `aiSkillPrompt` 字段 ——这是整个产品的差异化核心
- ❌ 不要在用户没确认骨架归属的情况下写入文件
- ❌ 不要使用中文文件名
- ❌ 不要硬编码 `stats.useCount > 0` 或 `stats.usedInProjects` ——这些字段由系统自动维护
- ❌ 不要省略 `schemaVersion: 1`
- ❌ 不要在沉淀时同时改动其他原子（保持单次操作单一职责）

---

## 多原子批量沉淀

如果用户一次给出多个相关方法论（例如"帮我把 VOC + JTBD + KANO 都建好"）：

1. **先建父级**（VOC overview）—— 这样子级才能正确引用 `parentAtomId`
2. **再依次建子级**（JTBD、KANO），都设 `parentAtomId: "atom_voc_overview"`
3. **最后一次性重建索引**，而不是每个原子都触发一次

这种情况下汇报里要列出所有创建的原子。
