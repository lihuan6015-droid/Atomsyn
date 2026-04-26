/**
 * Robust JSON extraction from LLM responses.
 *
 * Some models (especially aligned Chinese models or OpenAI-compatible
 * endpoints) prepend prose like "你的笔记主要讲了…，下面是提炼结果：" before
 * the actual JSON, even when the prompt asks for JSON-only output. This
 * helper peels off markdown fences, finds the outermost balanced JSON
 * value, and parses it — falling back to repair strategies for truncated
 * responses.
 *
 * Used by crystallize / classify / analyzeReport — three independent
 * non-streaming LLM call sites that share the same parsing concern.
 */

export interface ParseLlmJsonOptions {
  /** Expected outer shape. 'array' or 'object' or 'either' (default: 'either'). */
  expect?: 'array' | 'object' | 'either'
}

/**
 * Strip a single ```...``` markdown fence wrapping the entire response.
 * Leaves inner content untouched.
 */
function stripOuterFence(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/)
  if (fence) return fence[1].trim()
  // Also handle the case where there's prose followed by a fenced block —
  // grab the largest fenced block.
  const inlineFence = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/)
  if (inlineFence) return inlineFence[1].trim()
  return trimmed
}

/**
 * Find the substring of `text` starting at `text[startIdx]` that contains
 * a balanced JSON value (object or array). Respects strings and escapes.
 * Returns null if no balanced match is found.
 */
function extractBalanced(text: string, startIdx: number, openCh: '[' | '{'): string | null {
  const closeCh = openCh === '[' ? ']' : '}'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (esc) { esc = false; continue }
    if (inStr) {
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === openCh) depth++
    else if (ch === closeCh) {
      depth--
      if (depth === 0) return text.slice(startIdx, i + 1)
    }
  }
  return null
}

/**
 * Locate and slice out the first balanced JSON value matching the expected
 * shape. Returns null if nothing parseable is found.
 */
function locateJson(text: string, expect: 'array' | 'object' | 'either'): string | null {
  const candidates: Array<{ idx: number; ch: '[' | '{' }> = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[' && expect !== 'object') candidates.push({ idx: i, ch: '[' })
    else if (text[i] === '{' && expect !== 'array') candidates.push({ idx: i, ch: '{' })
  }
  // Try earliest first — that's almost always the intended payload.
  for (const c of candidates) {
    const slice = extractBalanced(text, c.idx, c.ch)
    if (slice) return slice
  }
  return null
}

/**
 * Best-effort closure for truncated JSON: counts open brackets and
 * appends matching closers. Handles being mid-string (odd quote count).
 */
function repairTruncated(text: string): string {
  let s = text
  let inStr = false
  let esc = false
  for (const ch of s) {
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') inStr = !inStr
  }
  if (inStr) s += '"'

  let braces = 0
  let brackets = 0
  inStr = false
  esc = false
  for (const ch of s) {
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') braces++
    else if (ch === '}') braces--
    else if (ch === '[') brackets++
    else if (ch === ']') brackets--
  }
  while (brackets-- > 0) s += ']'
  while (braces-- > 0) s += '}'
  return s
}

/**
 * Parse an LLM response that should contain JSON but may be wrapped in
 * prose, fences, or be truncated. Throws with a clear preview on failure.
 */
export function parseLlmJson<T = unknown>(
  raw: string,
  options: ParseLlmJsonOptions = {},
): T {
  const expect = options.expect ?? 'either'
  if (!raw || !raw.trim()) {
    throw new Error('LLM 返回了空内容')
  }

  // 1. Strip markdown fences if any.
  const fenceStripped = stripOuterFence(raw)

  // 2. Try direct parse first (fast path for well-behaved models).
  try {
    const direct = JSON.parse(fenceStripped)
    return direct as T
  } catch { /* fall through */ }

  // 3. Locate the first balanced JSON value and parse it.
  const located = locateJson(fenceStripped, expect)
  if (located) {
    try {
      return JSON.parse(located) as T
    } catch {
      // Try repair on the located region.
      try {
        return JSON.parse(repairTruncated(located)) as T
      } catch { /* fall through */ }
    }
  }

  // 4. Last resort: repair the entire fence-stripped response.
  try {
    return JSON.parse(repairTruncated(fenceStripped)) as T
  } catch { /* fall through */ }

  // Give up with a helpful error showing what came back.
  const preview = raw.length > 200 ? raw.slice(0, 200) + '…' : raw
  throw new Error(
    `LLM 返回的内容无法解析为 JSON。模型可能在 JSON 之外加了前缀文字。返回内容预览：\n${preview}`,
  )
}
