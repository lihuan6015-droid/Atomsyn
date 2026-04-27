# Deep Dive · L1 (Profile) + L2 (Preferences) prompt

You are extracting Profile + Preferences signal from a single user document
during a bootstrap deep-dive run. The document has been pre-filtered for
privacy and may contain `[REDACTED-EMAIL]` / `[REDACTED-PHONE]` etc. markers.

## Inputs

- `document_text` (the file content, possibly truncated to 8KB)
- `document_path` (relative to scan root — useful for context, NOT identity)
- `phase2_hypothesis` (the user-confirmed inference from Phase 2 — use as
  prior, NOT ground truth)

## What to produce

This is a DRY-RUN-FRIENDLY prompt: you produce a markdown summary, NOT atom
JSON. The exact format the caller expects:

```markdown
### <one-line title for what this file contributed>

- **layer**: L1 | L2
- **insight**: <one short sentence — what does this file say about the user's
                identity or preferences?>
- **raw_excerpt**: <≤ 50 chars from the original, verbatim>
- **confidence**: <0.0-1.0>
- **suggested_tags**: ["...", "..."]
- **profile_field_hints**: <which fields of profile.identity / profile.preferences
                            this informs, e.g. "preferences.architecture_care +0.05">
```

If the file does NOT contribute to L1/L2 signal, return the literal string
`SKIP: <one short reason>` and nothing else.

## Hard rules

- **One markdown block per call.** No chitchat, no preamble.
- **Be conservative.** L1/L2 inferences propagate into the user's `profile` atom.
  If you're unsure, set confidence ≤ 0.5.
- **Quote, don't paraphrase, the raw_excerpt.** Exact substring of the input.
- **suggested_tags are kebab-case**, 1-4 items. Inherit conventions visible in
  the user's existing tag corpus (you may be told these via `phase2_hypothesis`).
- **Never emit JSON in this layer.** JSON is the commit-stage's job (see commit.md).
