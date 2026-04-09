/**
 * V2.0 M6 · Drag guard — disables Tauri window drag regions during HTML5 DnD
 *
 * Problem: On macOS, `-webkit-app-region: drag` intercepts ALL mouse events
 * at the OS level, preventing HTML5 dragover/drop from firing. When a user
 * drags a NoteCard across the window, Tauri drag regions along the path
 * swallow the events and the drop never reaches the sidebar folders.
 *
 * Solution: Listen for global dragstart/dragend. While a drag is active,
 * inject a stylesheet that overrides `-webkit-app-region` to `no-drag` on
 * ALL elements. When the drag ends, remove the override and restore normal
 * window drag behavior.
 *
 * Call `initDragGuard()` once at app startup (e.g. in AppShell mount).
 */

let styleEl: HTMLStyleElement | null = null
let initialized = false

function disableTauriDragRegions() {
  if (styleEl) return
  styleEl = document.createElement('style')
  styleEl.textContent = `
    [data-tauri-drag-region] {
      -webkit-app-region: no-drag !important;
    }
  `
  document.head.appendChild(styleEl)
}

function restoreTauriDragRegions() {
  if (!styleEl) return
  styleEl.remove()
  styleEl = null
}

export function initDragGuard() {
  if (initialized) return
  initialized = true

  window.addEventListener('dragstart', () => {
    disableTauriDragRegions()
  }, true)

  window.addEventListener('dragend', () => {
    restoreTauriDragRegions()
  }, true)

  // Also restore on drop (dragend might not fire if drop was on an invalid target)
  window.addEventListener('drop', () => {
    restoreTauriDragRegions()
  }, true)
}
