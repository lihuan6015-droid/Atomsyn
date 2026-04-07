# Ingest Practice Skill

> 把一段「我在某个项目中应用某个方法论」的真实经验，沉淀为该项目的一条 Practice 记录。

## 触发词

- "我在 X 项目用了 JTBD，沉淀一下"
- "记录一次实战"
- "把这次复盘存到 X 项目里"
- "新建一条 practice"

## 5 步流程

### Step 1 · 锁定目标项目 + 目标原子

1. 读取 `data/projects/` 列出现有项目（每个目录下的 `meta.json`）
2. 让用户确认 / 选择目标项目（如果用户没有明确说）
3. 询问用户使用了哪个原子（atomId）
4. 从 `data/index/knowledge-index.json` 验证该 atomId 真实存在
5. 如果项目还没把这个原子 pin 进来，**先 pin**：在项目 `meta.json` 的 `pinnedAtoms[]` 加一条

### Step 2 · 提炼实战字段

| 字段 | 含义 | 必须 |
|---|---|---|
| `title` | 这次实战的一句话主题 | ✅ |
| `context` | 项目所处阶段 + 触发场景 | 推荐 |
| `executionSummary` | 怎么用的 + 关键过程 | 推荐 |
| `keyInsights` | 学到的 3-5 条关键洞察 | 推荐 |
| `whatWorked` | 哪里有效 | 可选 |
| `whatFailed` | 哪里失败 / 想再做一次会怎么改 | 可选（**非常宝贵**，鼓励用户填） |
| `status` | `in-progress` / `completed` / `abandoned` | ✅ |
| `artifacts[]` | 相关文本/链接（访谈记录、文档链接等） | 可选 |

### Step 3 · Schema 校验

验证生成的对象符合 `skills/schemas/practice.schema.json`：
- `id` 格式建议：`practice_<atom-slug>_<timestamp>`，例如 `practice_jtbd_20260407`
- `projectId` 必须是真实存在的项目目录名
- `atomId` 必须是知识库中真实存在的原子
- `status` 必须是允许的枚举值

### Step 4 · 写入文件

路径规则：
```
data/projects/<projectId>/practices/<practiceId>.json
```

例如：
```
data/projects/project-001-smart-meeting/practices/practice_jtbd_20260407.json
```

注意：
- `createdAt` / `updatedAt` 用 ISO 8601
- `schemaVersion: 1`
- 不要手动设置原子的 `stats.usedInProjects` ——索引重建时会自动反向同步

### Step 5 · 重建索引 + 汇报

写入完成后：

1. 如果 dev server 在跑 → 自动重建索引并自动同步原子的 `stats.usedInProjects`
2. 否则 → `npm run reindex`

汇报示例：

```
✅ 已沉淀 1 条 Practice：

• 项目：智能会议助手
• 方法论：Jobs To Be Done
• 标题：用 JTBD 分析智能会议助手的真实用户需求
• 状态：completed
• 文件：data/projects/project-001-smart-meeting/practices/practice_jtbd_20260407.json

🔗 双向绑定已自动建立：
- JTBD 原子的「使用统计 → 用于项目」会显示这个项目
- 项目主页的 JTBD 卡片会显示「+1 实践」徽章

下一步建议：
- 是否要把 whatFailed 也补一下？以你这次的经验，未来再用这个方法论时会怎么改？
```

---

## 反模式

- ❌ 不要在用户没有指定项目的情况下擅自归属
- ❌ 不要手动改 atom.stats —— 那是索引同步的职责
- ❌ 不要把 Practice 写进通用 atoms 目录 —— Practice 是项目级数据
- ❌ 不要漏掉 `status` 字段
