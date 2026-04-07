/**
 * V1.5 · Programmatic window drag helper for Tauri desktop mode.
 *
 * Tauri v2's `data-tauri-drag-region` attribute and `-webkit-app-region`
 * CSS property both have edge cases where drag detection fails (notably
 * during dev-mode HMR and on certain macOS versions). Calling
 * `getCurrentWindow().startDragging()` from a `mousedown` handler is
 * more reliable across OS/version matrices.
 *
 * The handler walks up from the clicked element — if any ancestor is an
 * interactive element (button, link, input, etc.), it bails out so the
 * click still does its intended job. Otherwise, it asks the current
 * window to begin dragging.
 *
 * Mark any container element where you want click-to-drag to work with
 * `onMouseDown={handleWindowDrag}`. Mark any container that should NOT
 * start a drag (even if it looks like plain content) with
 * `data-nodrag="true"` on the element.
 */
import type { MouseEvent as ReactMouseEvent } from 'react'
import { isTauri } from './dataPath'

/**
 * Cached reference to Tauri's current-window handle. We resolve it once
 * at module load so that every drag call is synchronous from React's
 * point of view — the previous implementation used a `.then()` which
 * raced against the mousedown→mouseup→mousemove sequence and produced
 * "drag works once then stops" behavior. With a cached handle, the
 * `startDragging()` call fires inside the same tick as the mouse event
 * and the OS drag loop engages every time.
 */
type TauriWindow = { startDragging: () => Promise<void> }
let cachedWindow: TauriWindow | null = null
let cachePromise: Promise<void> | null = null

function primeWindowCache(): void {
  if (cachedWindow || cachePromise) return
  if (!isTauri()) return
  cachePromise = import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => {
      cachedWindow = getCurrentWindow() as unknown as TauriWindow
    })
    .catch(() => undefined)
}

// Prime the cache immediately at module load so the very first drag
// attempt is also synchronous.
primeWindowCache()

export function handleWindowDrag(e: ReactMouseEvent): void {
  if (!isTauri()) return
  if (e.button !== 0) return

  // Walk up from the event target — if anything in the ancestry is an
  // interactive element, let the click fall through to its handler.
  let el: HTMLElement | null = e.target as HTMLElement
  const stop: HTMLElement = e.currentTarget as HTMLElement
  while (el && el !== stop) {
    const tag = el.tagName
    if (
      tag === 'BUTTON' ||
      tag === 'A' ||
      tag === 'INPUT' ||
      tag === 'SELECT' ||
      tag === 'TEXTAREA' ||
      tag === 'LABEL' ||
      el.getAttribute('role') === 'button' ||
      el.dataset?.nodrag === 'true'
    ) {
      return
    }
    el = el.parentElement
  }

  // Prevent default so the browser doesn't start its own text-selection
  // or focus-change gesture in parallel with the native drag loop.
  e.preventDefault()

  if (cachedWindow) {
    cachedWindow.startDragging().catch(() => undefined)
    return
  }

  // First call before the module cached — prime and retry once the
  // cache fills. Subsequent calls will use the synchronous path.
  primeWindowCache()
  cachePromise?.then(() => {
    cachedWindow?.startDragging().catch(() => undefined)
  })
}
