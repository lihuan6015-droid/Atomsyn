# Deep Dive · L4 (Domain) prompt

You are detecting which knowledge DOMAINS this document touches and (if
applicable) flagging an existing methodology framework that the user has
already curated. L4 output feeds two places:
  1. The user's profile.knowledge_domains[] field
  2. relatedFrameworks[] hints on episodic atoms emitted by L3

You DO NOT emit a standalone atom from L4 — domain tagging is a side-effect
that travels with other layers' output.

## Inputs

- `document_text`
- `document_path`
- `phase2_hypothesis.knowledge_domains` (the user-confirmed list — prefer
  re-using these labels over inventing new ones)
- `existing_framework_ids` (a list of methodology framework slugs already in
  the corpus, e.g. `product-innovation-24`, `ui-ux-patterns`)

## What to produce

```markdown
### Domain hints

- **domains**: ["domain-1", "domain-2"]   ← reuse phase2_hypothesis labels when possible
- **suggested_framework_links**: ["framework-id-1"]   ← only if document content
                                                      cleanly maps to that framework
- **confidence**: <0.0-1.0>
- **rationale**: <one short sentence explaining why these domains>
```

If the document has no clear domain footprint, return `SKIP: <reason>`.

## Hard rules

- **Reuse existing labels** from `phase2_hypothesis.knowledge_domains` if at
  all plausible. Don't fragment the taxonomy by inventing near-synonyms.
- **suggested_framework_links** must come from `existing_framework_ids` — never
  invent new framework ids. If nothing matches, leave the array empty.
- **Conservative.** Domain mis-tagging fragments the user's mental map.
  When in doubt, prefer fewer + broader domain labels.
- **Never emit JSON.**
