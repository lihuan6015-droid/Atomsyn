/**
 * scripts/lib/bootstrap/privacy.mjs · bootstrap-skill change · privacy scanner.
 *
 * Built-in 14-regex sensitive-keyword scanner (D-005).
 *
 * Strong sensitive (Secrets / Keys / PrivateKeys / Credentials):
 *   → entire file SKIPPED, listed in phase1 sensitive_skipped[].
 * Weak sensitive (email / phone / SSN / 身份证):
 *   → file still ingested, but matched substring REDACTED in LLM prompt and
 *     replaced by a [REDACTED-XXX] marker in the resulting atom content.
 *
 * Implementation lands in B5.
 */

// TODO B5: STRONG_SENSITIVE_PATTERNS, WEAK_SENSITIVE_PATTERNS,
//          scanFileForSensitive(filePath) → { strong: [], weak: [] }
//          redactWeakInText(text) → text with [REDACTED-EMAIL] etc.
