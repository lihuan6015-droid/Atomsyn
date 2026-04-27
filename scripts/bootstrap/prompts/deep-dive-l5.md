# Deep Dive · L5 (Reflections) prompt

You are extracting REFLECTIVE fragments from a single user document.
"Reflections" = principles, counterintuitive realisations, methodology
critiques — content the user wants to BELIEVE forward, distinct from
specific episodes (L3) and identity facts (L1).

Output maps to Atomsyn `experience-fragment` atoms with insight_type ∈
{反直觉, 方法验证, 方法证伪, 原则提炼, 时机判断} (a subset of the V2.0
fragment vocabulary). Pick the closest match per fragment.

## Inputs

- `document_text`
- `document_path`
- `phase2_hypothesis` (style + tag conventions)

## What to produce

For EACH distinct reflection in the document, emit one markdown block:

```markdown
### <短标题, ≤ 60 chars>

- **layer**: L5
- **insight**: <≤ 200 chars — the principle / realisation, self-contained>
- **raw_excerpt**: <≤ 50 chars verbatim>
- **confidence**: <0.0-1.0>
- **insight_type**: 反直觉 | 方法验证 | 方法证伪 | 原则提炼 | 时机判断
- **suggested_role**: <one of the corpus role values>
- **suggested_situation**: <usually 复盘 / 灵感闪现 / 决策关口>
- **suggested_tags**: ["..."]
```

If the document is purely descriptive (no reflection / opinion / principle),
return `SKIP: <reason>`.

## Hard rules

- **One block per distinct reflection.** A document may yield 0, 1, or several.
- **Reflection ≠ summary.** "Section 3 explains X" is NOT a reflection.
  "我以为 X, 后来发现 Y" IS.
- **insight_type must be one of the listed enum values.** Don't invent new ones.
- **insight is forward-applicable.** A future agent reading the insight should
  be able to USE it without seeing the original document.
- **raw_excerpt is exact verbatim.**
- **Conservative confidence.** Reflections are subjective; confidence > 0.7
  requires the reflection to be stated directly + emphatically in the source.
- **Never emit JSON.**
