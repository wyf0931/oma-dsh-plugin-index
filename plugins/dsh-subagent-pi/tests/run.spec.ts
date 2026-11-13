import { describe, expect, it } from 'vitest'
import { PiSubagentFailure } from '../src/failures.ts'
import { piArgv, textTask, type PiRunSpec } from '../src/run.ts'

const base: PiRunSpec = { piPath: 'pi', approve: true, excludeTools: [] }

describe('task text', () => {
  it('joins text blocks in order', () => {
    expect(textTask([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('ab')
  })

  it('rejects a non-text block', () => {
    expect(() => textTask([{ type: 'image', data: 'x', mimeType: 'image/png' } as never])).toThrow(PiSubagentFailure)
  })

  it('rejects an empty task', () => {
    expect(() => textTask([{ type: 'text', text: '  ' }])).toThrow(PiSubagentFailure)
  })
})

describe('child argv', () => {
  it('creates a session by id on a first delegation', () => {
    const argv = piArgv(base, { sessionId: 'ses-1', resume: false })
    expect(argv).toEqual(['--mode', 'rpc', '--approve', '--session-id', 'ses-1'])
  })

  it('resumes by id instead of creating', () => {
    const argv = piArgv(base, { sessionId: 'ses-1', resume: true })
    expect(argv).toContain('--session')
    expect(argv).not.toContain('--session-id')
    expect(argv.at(-1)).toBe('ses-1')
  })

  it('passes model, thinking, excluded tools and the session directory', () => {
    const argv = piArgv({
      ...base,
      model: 'deepseek/deepseek-flash',
      thinking: 'medium',
      excludeTools: ['bash', 'edit'],
      sessionDir: '/tmp/pi-sessions',
    }, { sessionId: 'ses-2', resume: false })
    expect(argv).toEqual([
      '--mode', 'rpc', '--session-dir', '/tmp/pi-sessions', '--approve',
      '--model', 'deepseek/deepseek-flash', '--thinking', 'medium',
      '--exclude-tools', 'bash,edit', '--session-id', 'ses-2',
    ])
  })

  it('does not emit a trust flag when approval is disabled', () => {
    expect(piArgv({ ...base, approve: false }, { sessionId: 's', resume: false })).not.toContain('--approve')
  })
})
