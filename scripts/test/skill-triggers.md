# M5 T5.2 · Skill 触发回归清单

> 在 Claude Code 和 Cursor 中分别测试以下触发词,记录是否成功触发对应 skill。

## atomsyn-read 触发词

### 中文 (显式)
| # | 触发词 | Claude Code | Cursor |
|---|---|---|---|
| 1 | 我之前学过类似的吗 | | |
| 2 | Atomsyn 里有没有 | | |
| 3 | 查一下 atomsyn | | |
| 4 | 看看我之前记过什么 | | |
| 5 | 调用我的经验 | | |
| 6 | 我以前是怎么做的 | | |
| 7 | 查一下我之前 | | |
| 8 | 翻翻我的笔记 | | |
| 9 | 我之前是不是踩过这个坑 | | |
| 10 | 看看我的认知资产 | | |
| 11 | 我之前怎么想的 | | |
| 12 | 我记得我写过 | | |

### 英文 (显式)
| # | 触发词 | Claude Code | Cursor |
|---|---|---|---|
| 1 | check my atomsyn | | |
| 2 | use my past experiences | | |
| 3 | recall my notes | | |
| 4 | what did I learn about | | |
| 5 | have I seen this before | | |
| 6 | pull from my atomsyn | | |
| 7 | dig into my past learnings | | |
| 8 | what do my notes say | | |

### 静默主动触发 (不需要触发词)
| # | 场景 | 预期行为 | Claude Code | Cursor |
|---|---|---|---|---|
| 1 | 新会话第一个实质性任务 | 静默调用一次 read | | |
| 2 | 话题切换到新领域 | 再调一次 | | |
| 3 | 闲聊/打招呼 | 不触发 | | |
| 4 | 编程中途 | 不触发 | | |

---

## atomsyn-write 触发词

### 中文 (显式)
| # | 触发词 | Claude Code | Cursor |
|---|---|---|---|
| 1 | 帮我记下来 | | |
| 2 | 存到我的 atomsyn | | |
| 3 | 存到 Atomsyn | | |
| 4 | Atomsyn 记一下 | | |
| 5 | 别让我忘了 | | |
| 6 | 加到我的知识库 | | |
| 7 | 更新那条经验 | | |
| 8 | 补充到之前那条 | | |

### 英文 (显式)
| # | 触发词 | Claude Code | Cursor |
|---|---|---|---|
| 1 | save to my atomsyn | | |
| 2 | remember this for me | | |
| 3 | crystallize this | | |
| 4 | update that atom | | |
| 5 | merge into the existing one | | |

### 主动建议触发
| # | 场景 | 预期行为 | Claude Code | Cursor |
|---|---|---|---|---|
| 1 | 深度讨论/决策结束后 | 主动问"要沉淀吗?" | | |
| 2 | 踩坑并解决后 | 主动问"要记下来吗?" | | |
| 3 | 编程中途 | 不建议 | | |
| 4 | 闲聊 | 不建议 | | |

---

## 评分标准

- **命中**: skill 被正确触发且执行了对应的 CLI 命令
- **误触**: skill 在不该触发时触发了
- **漏触**: 使用了触发词但 skill 没被触发

**目标**: 显式触发命中率 ≥ 95%, 误触率 = 0%
