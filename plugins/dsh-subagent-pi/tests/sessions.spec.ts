import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listSessions, parseSession, recordSession } from '../src/sessions.ts'

const lines = [
  JSON.stringify({ type: 'session', version: 3, id: 'sess-1', timestamp: '2026-11-01T10:00:00.000Z', cwd: '/repo' }),
  JSON.stringify({ type: 'session_info', id: 'a', parentId: null, timestamp: '2026-11-01T10:00:01.000Z', name: 'Fix the parser' }),
  JSON.stringify({ type: 'model_change', id: 'b', parentId: 'a', timestamp: '2026-11-01T10:00:02.000Z', provider: 'deepseek', modelId: 'deepseek-flash' }),
  JSON.stringify({
    type: 'message', id: 'c', parentId: 'b', timestamp: '2026-11-01T10:00:03.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'Please fix the failing parser test' }] },
  }),
  JSON.stringify({
    type: 'message', id: 'd', parentId: 'c', timestamp: '2026-11-01T10:00:04.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Done' }],
      provider: 'deepseek',
      model: 'deepseek-flash',
      usage: { input: 100, output: 20, cacheRead: 300, cacheWrite: 5, totalTokens: 425, cost: { total: 0.01 } },
    },
  }),
  JSON.stringify({ type: 'message', id: 'e', parentId: 'd', timestamp: '2026-11-01T10:00:05.000Z', message: { role: 'toolResult', toolName: 'bash', content: [] } }),
  JSON.stringify({ type: 'usage', id: 'f', parentId: 'e', timestamp: '2026-11-01T10:00:06.000Z', kind: 'cache_warm', usage: { input: 0, output: 0, cacheRead: 50, totalTokens: 50, cost: { total: 0.002 } } }),
]

const text = `${lines.join('\n')}\n`

describe('session parsing', () => {
  it('folds title, model, turns and token totals', () => {
    const summary = parseSession(text, 'fallback')
    expect(summary.id).toBe('sess-1')
    expect(summary.title).toBe('Fix the parser')
    expect(summary.cwd).toBe('/repo')
    expect(summary.model).toBe('deepseek/deepseek-flash')
    expect(summary.turns).toBe(1)
    expect(summary.userMessages).toBe(1)
    expect(summary.toolCalls).toBe(1)
    expect(summary.input).toBe(100)
    expect(summary.cacheRead).toBe(350)
    expect(summary.cacheWrite).toBe(5)
    expect(summary.output).toBe(20)
    expect(summary.total).toBe(475)
    expect(summary.cost).toBeCloseTo(0.012)
  })

  it('falls back to the first user message and ignores broken lines', () => {
    const broken = `${JSON.stringify({ type: 'session', id: 's2', cwd: '/x', timestamp: '2026-11-02T00:00:00.000Z' })}\nnot json\n${JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: '  Explain   this  ' }] } })}\n`
    const summary = parseSession(broken)
    expect(summary.title).toBe('Explain this')
    expect(summary.turns).toBe(0)
  })

  it('uses the file id when the header is missing', () => {
    expect(parseSession('', 'abc-123').id).toBe('abc-123')
  })
})

describe('session listing', () => {
  const dirs: string[] = []
  afterEach(async () => {
    const { rm } = await import('node:fs/promises')
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  })

  it('joins recorded ids with their session files', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-pi-registry-'))
    dirs.push(temp)
    const sessions = join(temp, 'sessions', '--repo--')
    await mkdir(sessions, { recursive: true })
    await writeFile(join(sessions, '2026-11-01T10-00-00-000Z_sess-1.jsonl'), text)
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = temp
    try {
      await recordSession('sess-1', '/repo')
      const delegated = await listSessions(join(temp, 'sessions'), { scope: 'delegated' })
      expect(delegated).toHaveLength(1)
      expect(delegated[0]?.delegated).toBe(true)
      expect(delegated[0]?.title).toBe('Fix the parser')
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
  })

  it('reads delegated ids from the registry and scans all files', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'dsh-pi-sessions-'))
    dirs.push(temp)
    const sessions = join(temp, 'sessions', '--repo--')
    await mkdir(sessions, { recursive: true })
    await writeFile(join(sessions, '2026-11-01T10-00-00-000Z_sess-1.jsonl'), text)

    const all = await listSessions(join(temp, 'sessions'), { scope: 'all' })
    expect(all).toHaveLength(1)
    expect(all[0]?.title).toBe('Fix the parser')

    // No registry entry in this home: the delegated scope stays empty.
    const delegated = await listSessions(join(temp, 'sessions'), { scope: 'delegated' })
    expect(delegated).toEqual([])
  })
})
