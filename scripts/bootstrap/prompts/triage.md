# Phase 1 · TRIAGE prompt (placeholder)

Phase 1 (TRIAGE) does NOT call an LLM. It walks the user's directories with
`stat()` only, applies the privacy + .atomsynignore filters, and emits a
markdown overview directly from the file system metadata (per-extension
counts, total size, last-modified bucket, sensitive_skipped list).

This file exists so the prompt directory is uniformly populated and so
future enhancements (e.g. an LLM-assisted "what kind of corpus is this?"
preview) have a stable place to land.

If you're looking for the LLM prompts that drive the funnel, see:

- `sampling.md`        — Phase 2 inference of an initial profile hypothesis
- `deep-dive-l1-l2.md` — extracts identity / preferences (Profile + Preferences layers)
- `deep-dive-l3.md`    — extracts episodic experience atoms
- `deep-dive-l4.md`    — extracts domain framing
- `deep-dive-l5.md`    — extracts reflections (反直觉 / 方法证伪)
- `commit.md`          — converts the user-approved markdown report into atom JSON
