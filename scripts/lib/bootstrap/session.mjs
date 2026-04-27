/**
 * scripts/lib/bootstrap/session.mjs · bootstrap-skill change
 *
 * Persistence layer for bootstrap sessions.
 * State file: ~/.atomsyn/bootstrap-sessions/<session-id>.json
 *
 * Status values (B4):
 *   - 'triage_completed'
 *   - 'sampling_completed'
 *   - 'deep-dive_in_progress'
 *   - 'dry_run_completed'
 *   - 'commit_in_progress'
 *   - 'commit_completed'
 *   - 'failed'
 *
 * Implementation lands in B4 (next commit).
 */

export const SESSION_STATUS = {
  TRIAGE_COMPLETED: 'triage_completed',
  SAMPLING_COMPLETED: 'sampling_completed',
  DEEP_DIVE_IN_PROGRESS: 'deep-dive_in_progress',
  DRY_RUN_COMPLETED: 'dry_run_completed',
  COMMIT_IN_PROGRESS: 'commit_in_progress',
  COMMIT_COMPLETED: 'commit_completed',
  FAILED: 'failed',
}

// TODO B4: createSession / loadSession / writeSession / sessionsDir / etc.
