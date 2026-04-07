/**
 * V1.5 · App version constants and check helper.
 *
 * The app version is hard-coded here to avoid dragging package.json through
 * the TypeScript bundler. Bump this constant whenever package.json `version`
 * changes — V1.6 will automate via a build-time replace + GitHub Releases
 * fetch in `appVersionApi.check()`.
 */
import { appVersionApi } from '@/lib/dataApi'
import type { AppVersionResult } from '@/types'

// Keep in sync with package.json `version`. V1.6 will auto-derive at build.
export const APP_VERSION = '0.1.0'

/** Repo URL placeholder — repo not yet published as of V1.5. */
export const APP_RELEASES_URL = 'https://github.com/circlelee/atomsyn/releases'

/**
 * Stub: ask the backend for the latest app version.
 *
 * V1.5: backend always returns `hasUpdate: false` with reason "v1.5-not-published".
 * V1.6: backend will fetch the GitHub Releases API for the latest tag and
 *       compare it against APP_VERSION using semver.
 */
export async function checkForAppUpdate(): Promise<AppVersionResult> {
  return appVersionApi.check()
}
