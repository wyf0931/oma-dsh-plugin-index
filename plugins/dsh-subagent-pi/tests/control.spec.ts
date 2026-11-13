import { describe, expect, it } from 'vitest'
import { CONTROL_PREFIX, takeControl, withControl } from '../src/control.ts'
import { PiSubagentFailure } from '../src/failures.ts'

const task = [{ type: 'text' as const, text: 'Fix the failing test' }]

describe('control block', () => {
  it('round-trips a session control and keeps the task', () => {
    const prompt = withControl(task, { sessionId: 'abc-123', resume: true })
    expect(prompt).toHaveLength(2)
    expect(prompt[1]?.text.startsWith(CONTROL_PREFIX)).toBe(true)

    const split = takeControl(prompt)
    expect(split.prompt).toEqual(task)
    expect(split.control).toEqual({ sessionId: 'abc-123', resume: true })
  })

  it('leaves a prompt without a control block untouched', () => {
    const split = takeControl(task)
    expect(split.prompt).toBe(task)
    expect(split.control).toBeUndefined()
  })

  it('rejects a malformed control block', () => {
    const broken = [task[0]!, { type: 'text' as const, text: `${CONTROL_PREFIX}{not json` }]
    expect(() => takeControl(broken)).toThrow(PiSubagentFailure)
  })

  it('rejects a control block without a usable session id', () => {
    const broken = [task[0]!, { type: 'text' as const, text: `${CONTROL_PREFIX}${JSON.stringify({ sessionId: '', resume: false })}` }]
    expect(() => takeControl(broken)).toThrow(PiSubagentFailure)
  })
})
