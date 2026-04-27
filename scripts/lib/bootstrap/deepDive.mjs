/**
 * scripts/lib/bootstrap/deepDive.mjs · bootstrap-skill change · Phase 3 DEEP DIVE.
 *
 * Default serial mode. For each candidate file:
 *   1. Calls LLM with the 5-layer classification prompt (L1 Profile / L2 Preferences /
 *      L3 Episodic / L4 Domain / L5 Reflections).
 *   2. In dry-run mode (D-011): emits a markdown row (name / one-line insight /
 *      layer / 50-char raw snippet / confidence / suggested tags) — does NOT
 *      generate atom JSON or call ingest.
 *   3. In commit mode: assembles atom JSON via commit.md prompt and pipes
 *      through `atomsyn-cli ingest --stdin`.
 *
 * Implementation lands in B9 (dry-run) and B10 (commit).
 */

// TODO B9: runDeepDiveDryRun(opts) → { candidates, markdown }
// TODO B10: runDeepDiveCommit(opts) → { atomsCreated, errors }
