#!/usr/bin/env node
/**
 * scripts/test/bootstrap-tools-test.mjs · bootstrap-tools change.
 *
 * Unit + integration tests for the v2 increment:
 *   G1. extractors (markdown / text / code / docx-stub / pdf-stub)
 *   G2. agentTools sandbox + 5 primitives
 *   G3. agentic loop (mock LLM tool-use sequence)
 *   G6. v1 → v2 compatibility (legacy session JSON loads with mode default)
 *
 * Real-LLM end-to-end (G4 / G7 dogfood) is run separately by the user; this
 * suite stays mock-only so `npm run test:bootstrap-tools` is fast + offline.
 */

import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { extract, pickExtractor, SUPPORTED_EXTS } from '../lib/bootstrap/extractors/index.mjs'
import { extractMarkdown } from '../lib/bootstrap/extractors/markdown.mjs'
import { extractCode } from '../lib/bootstrap/extractors/code.mjs'
import { extractText } from '../lib/bootstrap/extractors/text.mjs'
import { createAgentTools, compileGlob, resolveInSandbox } from '../lib/bootstrap/agentTools.mjs'
import { runAgenticDeepDive, AGENT_TOOL_SCHEMAS } from '../lib/bootstrap/agentic.mjs'
import { chatWithTools } from '../lib/bootstrap/llmClient.mjs'

let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (condition) { passed++ }
  else { failed++; failures.push(message); console.error(`  ✗ ${message}`) }
}

function describe(name, fn) { console.log(`\n${name}`); return fn() }

function setupSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'atomsyn-bootstrap-tools-test-'))
  return root
}

// ─── G1 · extractors ─────────────────────────────────────────────────────────

await describe('G1 · extractors', async () => {
  const root = setupSandbox()
  try {
    // markdown with frontmatter
    const mdPath = join(root, 'note.md')
    writeFileSync(mdPath, '---\ntitle: My Note\ntags: foo\n---\n\n# Heading\n\nBody text here.\n', 'utf8')
    const md = await extractMarkdown(mdPath)
    assert(md.text.includes('# Heading'), 'markdown extractor returns body without frontmatter')
    assert(md.meta.frontmatter?.title === 'My Note', 'markdown extractor parses frontmatter title')
    assert(md.meta.source === 'markdown', 'markdown meta.source = markdown')

    // text
    const txtPath = join(root, 'a.txt')
    writeFileSync(txtPath, 'plain content', 'utf8')
    const txt = await extractText(txtPath)
    assert(txt.text === 'plain content', 'text extractor returns content verbatim')

    // text binary detection
    const binPath = join(root, 'b.txt')
    writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x41, 0x42]))
    const bin = await extractText(binPath)
    assert(bin.skipped && bin.reason === 'binary', 'text extractor skips binary content')

    // code (small)
    const tsPath = join(root, 'a.ts')
    writeFileSync(tsPath, 'export const x = 1\n', 'utf8')
    const ts = await extractCode(tsPath)
    assert(ts.text.includes('export const x'), 'code extractor returns small file in full')
    assert(!ts.meta.trimmed, 'small code file is not trimmed')

    // code (large → trimmed)
    const bigPath = join(root, 'big.js')
    const big = 'a'.repeat(40 * 1024)
    writeFileSync(bigPath, big, 'utf8')
    const bigOut = await extractCode(bigPath)
    assert(bigOut.meta.trimmed === true, 'large code file is head/tail trimmed')

    // index dispatch + privacy strong-skip
    const secretPath = join(root, 'secret.md')
    writeFileSync(secretPath, '# Secrets\n\napi_key = "sk-' + 'a'.repeat(40) + '"\n', 'utf8')
    const sec = await extract(secretPath)
    assert(sec.skipped && sec.reason === 'strong-sensitive', 'extract() skips strong-sensitive content')

    // index dispatch + weak redaction
    const weakPath = join(root, 'weak.md')
    writeFileSync(weakPath, 'Contact me at user@example.com or 13800138000.\n', 'utf8')
    const weak = await extract(weakPath)
    assert(weak.text.includes('[REDACTED-EMAIL]'), 'extract() redacts weak-sensitive email')
    assert(weak.text.includes('[REDACTED-PHONE]'), 'extract() redacts weak-sensitive cn-phone')

    // index supported / unsupported
    assert(SUPPORTED_EXTS.has('.docx'), 'SUPPORTED_EXTS includes .docx')
    assert(SUPPORTED_EXTS.has('.pdf'), 'SUPPORTED_EXTS includes .pdf')
    const unknownPath = join(root, 'pic.jpg')
    writeFileSync(unknownPath, Buffer.from([0xff, 0xd8, 0xff]))
    const unk = await extract(unknownPath)
    assert(unk.skipped && unk.reason === 'unsupported', 'extract() skips unknown extension')

    // pickExtractor sanity
    assert(pickExtractor('foo.md').name === 'markdown', 'pickExtractor → markdown for .md')
    assert(pickExtractor('foo.docx').name === 'docx', 'pickExtractor → docx')
    assert(pickExtractor('foo.pdf').name === 'pdf', 'pickExtractor → pdf')
    assert(pickExtractor('foo.ts').name === 'code', 'pickExtractor → code for .ts')
    assert(pickExtractor('foo.toml').name === 'text', 'pickExtractor → text for .toml')
    assert(pickExtractor('foo.unknown') === null, 'pickExtractor → null for unknown')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ─── G2 · agentTools sandbox + 5 primitives ──────────────────────────────────

await describe('G2 · agentTools', async () => {
  const root = setupSandbox()
  try {
    // 用 NFC 中文目录测试
    const chineseDir = join(root, '开发过程资料')
    mkdirSync(join(chineseDir, '我的研究'), { recursive: true })
    mkdirSync(join(chineseDir, '调试日志'), { recursive: true })
    writeFileSync(join(chineseDir, '我的研究', 'note1.md'), '# Insight\n\nThis is research.\n', 'utf8')
    writeFileSync(join(chineseDir, '我的研究', 'data.json'), '{"foo": 1}\n', 'utf8')
    writeFileSync(join(chineseDir, '调试日志', 'log.txt'), 'ERROR line 1\nINFO line 2\nERROR line 3\n', 'utf8')
    writeFileSync(join(chineseDir, 'README.md'), '# README\n\nProject docs\n', 'utf8')

    const trace = []
    const tools = createAgentTools({
      sandboxRoots: [chineseDir],
      onTrace: (t) => trace.push(t),
    })

    // ls
    const lsRoot = await tools.ls(chineseDir)
    assert(lsRoot.entries.length === 3, 'ls root returns 3 entries (2 dirs + README)')
    assert(lsRoot.entries.some((e) => e.name === '我的研究' && e.type === 'dir'), 'ls returns NFC-normalized chinese dir name')

    // stat
    const statRoot = await tools.stat(chineseDir)
    assert(statRoot.type === 'dir', 'stat returns type=dir')

    // glob
    const md = await tools.glob('**/*.md', chineseDir)
    assert(md.matches.length === 2, `glob '**/*.md' should find 2 files (got ${md.matches.length})`)
    const both = await tools.glob('**/*.{md,json}', chineseDir)
    assert(both.matches.length === 3, `glob brace expansion finds 3 files (got ${both.matches.length})`)

    // grep
    const errors = await tools.grep('error', join(chineseDir, '调试日志', 'log.txt'))
    assert(errors.hits.length === 2, `grep 'error' (case-insensitive) finds 2 lines (got ${errors.hits.length})`)

    // read (markdown extractor + privacy)
    const readRes = await tools.read(join(chineseDir, '我的研究', 'note1.md'))
    assert(readRes.text?.includes('# Insight'), 'read returns extracted markdown body')
    assert(readRes.meta.source === 'markdown', 'read meta.source = markdown')

    // sandbox violation - escape via ..
    let threw = false
    try { await tools.ls(join(chineseDir, '..', '..', 'etc')) }
    catch (e) { threw = e.code === 'SANDBOX_VIOLATION' }
    assert(threw, 'sandbox rejects ../..  escape')

    // sandbox violation - absolute path outside root
    threw = false
    try { await tools.read('/etc/passwd') }
    catch (e) { threw = e.code === 'SANDBOX_VIOLATION' }
    assert(threw, 'sandbox rejects absolute path outside root')

    // trace was populated
    assert(trace.length >= 7, `onTrace was called for each tool invocation (got ${trace.length})`)
    assert(trace.some((t) => t.tool === 'glob' && /matches/.test(t.result_summary)), 'trace records glob result_summary')
    assert(trace.some((t) => t.error && t.tool === 'ls'), 'trace records sandbox violation as error')

    // direct sandbox util sanity
    const safe = resolveInSandbox(join(chineseDir, '我的研究'), [chineseDir])
    assert(safe.includes('我的研究'), 'resolveInSandbox returns nfc absolute path inside sandbox')

    // glob compiler
    const re1 = compileGlob('*.md')
    assert(re1.test('foo.md') && !re1.test('sub/foo.md'), 'glob *.md does not cross dirs')
    const re2 = compileGlob('**/*.md')
    assert(re2.test('a/b/c.md') && re2.test('c.md'), 'glob **/*.md crosses dirs')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ─── G3 · agentic loop with mock LLM tool-use ────────────────────────────────

function makeMockResponse(json) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => json,
    text: async () => JSON.stringify(json),
  }
}

function makeAnthropicCfg() {
  return { provider: 'anthropic', apiKey: 'test', baseUrl: 'https://api.anthropic.test/v1', model: 'claude-mock' }
}
function makeOpenAICfg() {
  return { provider: 'openai', apiKey: 'test', baseUrl: 'https://api.openai.test/v1', model: 'gpt-mock' }
}

await describe('G3 · agentic loop (mock LLM)', async () => {
  const root = setupSandbox()
  try {
    writeFileSync(join(root, 'a.md'), '# A\n\nbody A\n', 'utf8')
    writeFileSync(join(root, 'b.md'), '# B\n\nbody B\n', 'utf8')

    // ── Anthropic mock: ls → read → final text
    let anthropicCalls = 0
    const anthropicMock = async () => {
      anthropicCalls++
      if (anthropicCalls === 1) {
        return makeMockResponse({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'ls', input: { path: root } }],
          usage: { input_tokens: 100, output_tokens: 50 },
        })
      }
      if (anthropicCalls === 2) {
        return makeMockResponse({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_2', name: 'read', input: { file: join(root, 'a.md') } }],
          usage: { input_tokens: 200, output_tokens: 60 },
        })
      }
      return makeMockResponse({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '## Phase 3 · DEEP DIVE — dry-run report (D-011)\n\nProcessed **1** file. **1** candidate.\n\n#### Test atom\n\n- **layer**: L3\n- **document**: `a.md`\n' }],
        usage: { input_tokens: 300, output_tokens: 80 },
      })
    }
    const sessA = { agent_trace: [] }
    const resA = await runAgenticDeepDive({
      paths: [root],
      hypothesis: { identity: { role: 'tester' } },
      session: sessA,
      llmConfig: makeAnthropicCfg(),
      fetchImpl: anthropicMock,
    })
    assert(resA.markdown.includes('Test atom'), 'agentic anthropic produces final markdown with candidate')
    assert(resA.markdown.includes('Agent 探索轨迹'), 'agentic markdown includes trace section')
    assert(resA.stats.loops === 3, `agentic loop runs 3 rounds (got ${resA.stats.loops})`)
    assert(resA.stats.finalReason === 'completed', 'agentic anthropic terminates with completed')
    assert(sessA.agent_trace.length >= 2, `session.agent_trace populated (${sessA.agent_trace.length} entries)`)
    assert(sessA.agent_trace.some((t) => t.tool === 'ls'), 'session.agent_trace contains ls call')
    assert(sessA.agent_trace.some((t) => t.tool === 'read'), 'session.agent_trace contains read call')

    // ── OpenAI mock: single tool_call → final
    let openaiCalls = 0
    const openaiMock = async () => {
      openaiCalls++
      if (openaiCalls === 1) {
        return makeMockResponse({
          choices: [{
            message: {
              role: 'assistant', content: null,
              tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'ls', arguments: JSON.stringify({ path: root }) } }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 },
        })
      }
      return makeMockResponse({
        choices: [{
          message: { role: 'assistant', content: '## Phase 3 · DEEP DIVE — dry-run report (D-011)\n\nFinal openai output' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 150, completion_tokens: 30, total_tokens: 180 },
      })
    }
    const resO = await runAgenticDeepDive({
      paths: [root],
      hypothesis: {},
      llmConfig: makeOpenAICfg(),
      fetchImpl: openaiMock,
    })
    assert(resO.markdown.includes('Final openai output'), 'agentic openai produces final markdown')
    assert(resO.stats.loops === 2, `openai branch runs 2 rounds (got ${resO.stats.loops})`)

    // ── Loop limit: LLM never stops → cap at maxLoops=3
    let infiniteCalls = 0
    const infiniteMock = async () => {
      infiniteCalls++
      return makeMockResponse({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: `tu_${infiniteCalls}`, name: 'ls', input: { path: root } }],
        usage: { input_tokens: 50, output_tokens: 20 },
      })
    }
    const resLoop = await runAgenticDeepDive({
      paths: [root],
      hypothesis: {},
      llmConfig: makeAnthropicCfg(),
      fetchImpl: infiniteMock,
      maxLoops: 3,
    })
    assert(resLoop.stats.loops === 3, `loop_limit caps at maxLoops=3 (got ${resLoop.stats.loops})`)
    assert(resLoop.stats.finalReason === 'loop_limit', `finalReason=loop_limit (got ${resLoop.stats.finalReason})`)

    // ── Token limit
    let tokCalls = 0
    const heavyMock = async () => {
      tokCalls++
      return makeMockResponse({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: `tu_t${tokCalls}`, name: 'ls', input: { path: root } }],
        usage: { input_tokens: 60_000, output_tokens: 0 },  // each round consumes 60k
      })
    }
    const resTok = await runAgenticDeepDive({
      paths: [root],
      hypothesis: {},
      llmConfig: makeAnthropicCfg(),
      fetchImpl: heavyMock,
      maxTokens: 100_000,
      maxLoops: 30,
    })
    assert(resTok.stats.finalReason === 'token_limit', `finalReason=token_limit (got ${resTok.stats.finalReason})`)
    assert(resTok.stats.tokens >= 100_000, `tokens hit ${resTok.stats.tokens}`)

    // ── Tool dispatch via AGENT_TOOL_SCHEMAS sanity
    assert(AGENT_TOOL_SCHEMAS.length === 5, `5 agent tool schemas (got ${AGENT_TOOL_SCHEMAS.length})`)
    assert(AGENT_TOOL_SCHEMAS.every((t) => t.name && t.description && t.input_schema), 'each schema has name+description+input_schema')

    // ── chatWithTools direct sanity (Anthropic shape)
    let directCalls = 0
    const directMock = async () => {
      directCalls++
      return makeMockResponse({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'I will list directory.' },
          { type: 'tool_use', id: 'd1', name: 'ls', input: { path: root } },
        ],
        usage: { input_tokens: 50, output_tokens: 30 },
      })
    }
    const direct = await chatWithTools({
      system: 'sys',
      messages: [{ role: 'user', text: 'go' }],
      tools: AGENT_TOOL_SCHEMAS,
      config: makeAnthropicCfg(),
      fetchImpl: directMock,
    })
    assert(direct.stop_reason === 'tool_use', 'chatWithTools normalizes anthropic stop_reason')
    assert(direct.toolCalls.length === 1 && direct.toolCalls[0].name === 'ls', 'chatWithTools returns parsed toolCalls')
    assert(direct.text.includes('list directory'), 'chatWithTools captures text content')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('')
console.log(`Tests: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
