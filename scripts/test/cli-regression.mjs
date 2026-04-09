#!/usr/bin/env node
/**
 * M5 T5.1 · CLI regression test suite
 *
 * Covers all subcommands + edge cases.
 * Run: npm run test:cli  (or: node scripts/test/cli-regression.mjs)
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const exec = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(__dirname, '..', 'atomsyn-cli.mjs')
const NODE = process.execPath

const color = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

let passed = 0
let failed = 0
const failures = []

async function run(args, opts = {}) {
  const { stdin, expectFail } = opts
  try {
    const child = exec(NODE, [CLI, ...args], {
      timeout: 30000,
      env: { ...process.env },
    })
    if (stdin) {
      child.child.stdin.write(stdin)
      child.child.stdin.end()
    }
    const { stdout, stderr } = await child
    return { ok: true, stdout, stderr, code: 0 }
  } catch (e) {
    if (expectFail) return { ok: false, stdout: e.stdout || '', stderr: e.stderr || '', code: e.code }
    return { ok: false, stdout: e.stdout || '', stderr: e.stderr || '', code: e.code }
  }
}

function test(name, fn) {
  return { name, fn }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg)
}

const tests = [
  // --- where ---
  test('where: returns valid JSON with path', async () => {
    const r = await run(['where'])
    assert(r.ok, 'where should succeed')
    const d = JSON.parse(r.stdout)
    assert(d.path, 'should have path')
    assert(d.source, 'should have source')
    assert(typeof d.exists === 'boolean', 'should have exists')
  }),

  // --- read ---
  test('read: requires --query', async () => {
    const r = await run(['read'], { expectFail: true })
    assert(!r.ok, 'should fail without --query')
  }),

  test('read: returns markdown with cognitive map', async () => {
    const r = await run(['read', '--query', '趋势扫描', '--top', '2'])
    assert(r.ok, 'read should succeed')
    assert(r.stdout.includes('Atomsyn Read'), 'should have header')
    assert(r.stdout.includes('认知全貌'), 'should have cognitive overview')
  }),

  test('read: empty query returns cognitive overview', async () => {
    const r = await run(['read', '--query', 'xyznonexistent12345', '--top', '1'])
    assert(r.ok, 'read should succeed even with no hits')
    assert(r.stdout.includes('认知全貌'), 'should still show overview')
  }),

  // --- get ---
  test('get: requires --id', async () => {
    const r = await run(['get'], { expectFail: true })
    assert(!r.ok, 'should fail without --id')
  }),

  test('get: not found returns exit code 2', async () => {
    const r = await run(['get', '--id', 'nonexistent_atom_12345'], { expectFail: true })
    assert(!r.ok, 'should fail for nonexistent')
  }),

  test('get: methodology atom returns markdown', async () => {
    const r = await run(['get', '--id', 'atom_macro_scanning'])
    assert(r.ok, `get should succeed: ${r.stderr}`)
    assert(r.stdout.includes('宏观趋势扫描'), 'should contain atom name')
    assert(r.stdout.includes('核心理念'), 'should have core idea section')
    assert(r.stdout.includes('methodology'), 'should show kind')
  }),

  test('get: --json flag returns JSON', async () => {
    const r = await run(['get', '--id', 'atom_macro_scanning', '--json'])
    assert(r.ok, 'get --json should succeed')
    const d = JSON.parse(r.stdout)
    assert(d.ok === true, 'should have ok: true')
    assert(d.atom.id === 'atom_macro_scanning', 'should have correct atom id')
  }),

  // --- find ---
  test('find: returns JSON results', async () => {
    const r = await run(['find', '--query', '产品', '--top', '3'])
    assert(r.ok, 'find should succeed')
    const d = JSON.parse(r.stdout)
    assert(Array.isArray(d.results), 'should have results array')
  }),

  test('find: empty query returns all', async () => {
    const r = await run(['find', '--top', '2'])
    assert(r.ok, 'find without query should succeed')
    const d = JSON.parse(r.stdout)
    assert(Array.isArray(d.results), 'should have results')
  }),

  test('find: --with-taxonomy returns taxonomy', async () => {
    const r = await run(['find', '--query', '产品', '--top', '1', '--with-taxonomy'])
    assert(r.ok, 'find --with-taxonomy should succeed')
    const d = JSON.parse(r.stdout)
    assert(d.taxonomy, 'should have taxonomy object')
  }),

  // --- ingest ---
  test('ingest: requires --stdin or --text', async () => {
    const r = await run(['ingest'], { expectFail: true })
    assert(!r.ok, 'should fail without input')
  }),

  test('ingest: --text creates fragment', async () => {
    const r = await run(['ingest', '--text', '这是一条回归测试碎片', '--dry-run'])
    assert(r.ok, `ingest --text should succeed: ${r.stderr}`)
    const d = JSON.parse(r.stdout)
    assert(d.kind === 'experience', 'should be experience')
    assert(d.subKind === 'fragment', 'should be fragment')
    assert(d.title === '这是一条回归测试碎片', 'title should match')
  }),

  test('ingest: --stdin with full JSON + dry-run', async () => {
    const input = JSON.stringify({
      title: 'CLI 回归测试',
      summary: '测试 ingest stdin 模式',
      role: '工程',
      situation: '测试',
      activity: '验证',
      insight_type: '方法验证',
      tags: ['regression', 'test'],
      rawContent: '这是回归测试',
      confidence: 0.9,
    })
    const r = await run(['ingest', '--stdin', '--dry-run'], { stdin: input })
    assert(r.ok, `ingest --stdin should succeed: ${r.stderr}`)
    const d = JSON.parse(r.stdout)
    assert(d.title === 'CLI 回归测试', 'title should match')
    assert(d.linked_methodologies.length >= 0, 'should have linked_methodologies')
    assert(d.private === false, 'non-情绪复盘 should not be private')
  }),

  test('ingest: 情绪复盘 auto-sets private', async () => {
    const input = JSON.stringify({
      title: '今天太累了',
      summary: '加班太多',
      role: '自我管理',
      situation: '复盘',
      activity: '记录',
      insight_type: '情绪复盘',
      tags: ['疲劳'],
      rawContent: '太累了',
      confidence: 0.5,
    })
    const r = await run(['ingest', '--stdin', '--dry-run'], { stdin: input })
    assert(r.ok, 'ingest should succeed')
    const d = JSON.parse(r.stdout)
    assert(d.private === true, '情绪复盘 should be private')
  }),

  test('ingest: missing required fields fails', async () => {
    const input = JSON.stringify({ title: 'incomplete' })
    const r = await run(['ingest', '--stdin', '--dry-run'], { stdin: input, expectFail: true })
    assert(!r.ok, 'should fail with missing fields')
  }),

  test('ingest: invalid JSON fails', async () => {
    const r = await run(['ingest', '--stdin', '--dry-run'], { stdin: 'not json', expectFail: true })
    assert(!r.ok, 'should fail with invalid JSON')
  }),

  test('ingest: auto-links methodology atoms', async () => {
    const input = JSON.stringify({
      title: '用户访谈中发现JTBD框架的验证',
      summary: '访谈发现用户需求与JTBD一致',
      role: '产品',
      situation: '访谈',
      activity: '分析',
      insight_type: '方法验证',
      tags: ['JTBD', '用户访谈', '需求洞察'],
      rawContent: 'JTBD方法论在访谈中得到验证',
      confidence: 0.9,
    })
    const r = await run(['ingest', '--stdin', '--dry-run'], { stdin: input })
    assert(r.ok, 'ingest should succeed')
    const d = JSON.parse(r.stdout)
    assert(d.linked_methodologies.length > 0, 'should auto-link to methodology atoms')
    assert(d.linked_methodologies.includes('atom_jtbd'), 'should link to JTBD atom')
  }),

  // --- reindex ---
  test('reindex: succeeds', async () => {
    const r = await run(['reindex'])
    assert(r.ok, `reindex should succeed: ${r.stderr}`)
    assert(r.stdout.includes('Index rebuilt'), 'should confirm rebuild')
  }),
]

// --- Runner ---
console.log(`\n${color.bold}Atomsyn CLI Regression Tests${color.reset}`)
console.log(`${'─'.repeat(50)}\n`)

for (const t of tests) {
  try {
    await t.fn()
    passed++
    console.log(`  ${color.green}✓${color.reset} ${t.name}`)
  } catch (e) {
    failed++
    failures.push({ name: t.name, error: e.message })
    console.log(`  ${color.red}✗${color.reset} ${t.name}`)
    console.log(`    ${color.dim}${e.message}${color.reset}`)
  }
}

console.log(`\n${'─'.repeat(50)}`)
console.log(`${color.bold}Results:${color.reset} ${color.green}${passed} passed${color.reset}${failed > 0 ? `, ${color.red}${failed} failed${color.reset}` : ''}`)

if (failures.length > 0) {
  console.log(`\n${color.red}Failures:${color.reset}`)
  for (const f of failures) {
    console.log(`  ${f.name}: ${f.error}`)
  }
  process.exit(1)
}

console.log('')
process.exit(0)
