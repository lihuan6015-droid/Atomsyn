/**
 * scripts/lib/bootstrap/parallelDeepDive.mjs · bootstrap-skill change · Phase 3 parallel mode.
 *
 * Implementation OQ-2 deferred: spike before B9 to decide between
 *   (a) 4 parallel LLM processes (token cost 4x), or
 *   (b) single agent multi-task prompts.
 *
 * Default is serial (D-004). This module is opt-in via `--parallel`.
 */

// TODO post-spike: runParallelDeepDive(opts) → { candidates, markdown }
