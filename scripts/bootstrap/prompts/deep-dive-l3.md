# Deep Dive · L3 (Episodic) prompt

You are extracting Episodic experience atoms from a single user document.
"Episodic" = a specific event/situation the user lived through (踩坑、复盘、
项目启动、与同事的某次对话). Distinct from L4 (general domain knowledge)
and L5 (reflective principles).

## Inputs

- `document_text`
- `document_path`
- `phase2_hypothesis` (use as prior for role / situation calibration)

## What to produce

For EACH distinct episode in the document, emit one markdown block:

```markdown
### <human-readable name of the episode, ≤ 60 chars>

- **layer**: L3
- **insight**: <≤ 200 chars — the core lesson of THIS episode>
- **raw_excerpt**: <≤ 50 chars verbatim, the line that anchors this episode>
- **confidence**: <0.0-1.0>
- **suggested_role**: <e.g. 工程 / 产品 / 设计 / 学习 / 决策 — pick from the corpus>
- **suggested_situation**: <e.g. 踩坑当下 / 复盘 / 决策关口 — pick from corpus>
- **suggested_activity**: <free-form short verb phrase>
- **suggested_tags**: ["..."]
```

If the document has no episodic content (it's a reference doc, a checklist,
a TODO list), return `SKIP: <reason>` and nothing else.

## Hard rules

- **One block per episode.** A document may yield 0, 1, or several blocks.
- **Episodes must be specific.** "I generally believe X" is L5 (reflection),
  not L3. "On 2025-09-15 I tried X and Y happened" is L3.
- **insight must be self-contained.** A future agent reads only the insight
  field — it must convey the lesson without needing the original document.
- **raw_excerpt is exact verbatim** from the input (substring, not paraphrase).
- **Conservative confidence.** Default 0.5; raise to 0.7 only when both the
  episode AND the lesson are unambiguous in the source.
- **Never emit JSON.** JSON assembly is commit.md's job.
