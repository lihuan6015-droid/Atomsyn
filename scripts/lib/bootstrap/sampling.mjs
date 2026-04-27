/**
 * scripts/lib/bootstrap/sampling.mjs · bootstrap-skill change · Phase 2 SAMPLING.
 *
 * Picks a representative sample from the triage file list (READMEs, root files,
 * recent edits, median-size files), reads their content, and asks the LLM to
 * infer an initial profile hypothesis (identity / preferences / domains).
 *
 * Implementation lands in B9. Uses scripts/bootstrap/prompts/sampling.md.
 */

// TODO B9: runSampling(opts) → { hypothesis, sampleFiles, markdown }
