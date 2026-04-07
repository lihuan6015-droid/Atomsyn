/**
 * Open a filesystem path in the user's system file manager, or fall back
 * to copying the path to clipboard in web/dev mode.
 *
 * In Tauri mode: uses `tauri-plugin-shell` `open()` which delegates to
 * macOS `open`, Windows `explorer`, or Linux `xdg-open`. For files, this
 * reveals the file's enclosing folder; we pass the enclosing directory
 * path directly to guarantee the system opens a folder window rather
 * than trying to launch the .json file with the default app.
 *
 * In web mode: copies the absolute path to the clipboard with a toast
 * fallback so the user can paste it into Finder/Explorer themselves.
 */

import { isTauri } from './dataPath'

function dirOfFile(absPath: string): string {
  // Strip the last segment after / or \
  const idx = Math.max(absPath.lastIndexOf('/'), absPath.lastIndexOf('\\'))
  if (idx <= 0) return absPath
  return absPath.slice(0, idx)
}

export interface OpenPathResult {
  mode: 'tauri' | 'clipboard'
  ok: boolean
  message: string
}

/**
 * Open the enclosing folder of the given file path, or the folder itself
 * if `absPath` is already a directory. The caller should display `message`
 * via their toast.
 */
export async function openContainingFolder(absPath: string): Promise<OpenPathResult> {
  if (!absPath) {
    return { mode: 'clipboard', ok: false, message: '路径为空' }
  }

  const folder = dirOfFile(absPath)

  if (isTauri()) {
    try {
      // V1.5 uses a native Rust `open_path` command that shells out to
      // the platform's file-manager launcher directly. This bypasses the
      // shell plugin's OpenScope (which blocks arbitrary user paths by
      // default) and is more predictable across OSes.
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_path', { path: folder })
      return { mode: 'tauri', ok: true, message: `✓ 已在文件管理器打开 ${folder}` }
    } catch (err) {
      return {
        mode: 'tauri',
        ok: false,
        message:
          err instanceof Error
            ? `打开失败: ${err.message}`
            : '打开失败,请手动在文件管理器访问该路径',
      }
    }
  }

  // Web / dev fallback — copy to clipboard
  try {
    await navigator.clipboard.writeText(folder)
    return {
      mode: 'clipboard',
      ok: true,
      message: `✓ 已复制路径到剪贴板: ${folder}`,
    }
  } catch {
    return {
      mode: 'clipboard',
      ok: false,
      message: `无法打开或复制,路径: ${folder}`,
    }
  }
}
