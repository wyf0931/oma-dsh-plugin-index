/**
 * Live RPC check against the real local `pi`. Skipped unless DSH_PI_E2E=1.
 * It costs two small model turns: they prove the subprocess path and that a
 * resumed Pi session still knows the earlier task.
 */
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ResolvedSubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { withControl } from '../src/control.ts'
import { startPiRun, type PiRunSpec } from '../src/run.ts'

const enabled = process.env.DSH_PI_E2E === '1'

const spec: PiRunSpec = {
  piPath: process.env.DSH_PI_E2E_PI ?? 'pi',
  approve: true,
  excludeTools: [],
  timeoutMs: 120_000,
  onError: error => console.warn('[live e2e]', error.message),
}

/** Join the text of a run's output blocks. */
function text(output: readonly ContentBlock[]): string {
  return output.map(block => block.type === 'text' ? block.text : '').join('')
}

/** Run one delegation against a request-shaped stub. */
async function delegate(prompt: string, sessionId: string, resume: boolean): Promise<string> {
  const request = {
    prompt: withControl([{ type: 'text', text: prompt }], { sessionId, resume }),
    cwd: process.cwd(),
    signal: new AbortController().signal,
  } as unknown as ResolvedSubagentStartRequest
  const run = await startPiRun(request, spec)
  try {
    const result = await run.result
    expect(result.stopReason).toBe('completed')
    return text(result.output)
  } finally {
    await run.dispose()
  }
}

describe.skipIf(!enabled)('live pi delegation', () => {
  it('answers a first task and reuses the session on resume', async () => {
    const sessionId = `dsh-e2e-${randomUUID()}`
    const first = await delegate('Reply with exactly this word: pong', sessionId, false)
    expect(first.toLowerCase()).toContain('pong')

    const second = await delegate('What single word did I ask you to reply with? One word only.', sessionId, true)
    expect(second.toLowerCase()).toContain('pong')
  }, 300_000)
})
