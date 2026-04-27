/**
 * scripts/lib/bootstrap/triage.mjs · bootstrap-skill change · Phase 1 TRIAGE.
 *
 * Walks the user-provided paths, reads only file metadata (no content),
 * applies privacy + .atomsynignore filters, and emits a markdown overview
 * (per-extension counts + total size + last-modified distribution +
 * sensitive_skipped list).
 *
 * Implementation lands in B9.
 */

// TODO B9: runTriage(opts) → { fileList, sensitiveSkipped, markdown }
