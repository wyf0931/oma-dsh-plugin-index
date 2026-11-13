/**
 * Named one-shot subagent provider backed by the local Pi CLI in RPC mode.
 * Every delegation spawns its own `pi --mode rpc` child and disposes it when
 * the turn settles; no Pi code runs inside this process.
 *
 * @module dsh-subagent-pi
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  NO_START_CAPABILITIES,
  type SubagentProvider,
} from '@deepseek-ai/dsh-subagent'
import { parseDuration } from './duration.ts'
import { PiSubagentFailure } from './failures.ts'
import { startPiRun, type PiRunSpec } from './run.ts'
import { countSessionFiles, listSessions, resolveAgentDir, type HistoryRequest } from './sessions.ts'

export const name = 'subagent-pi'
export const inject = ['subagents']

const DEFAULT_PROVIDER_NAME = 'pi'

/** Thinking levels Pi accepts; an unknown word would be clamped silently. */
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** Configuration of one Pi subagent provider instance. */
export interface Config {
  /** Name registered on the subagent service (default pi). */
  providerName?: string
  /** Pi CLI executable name or absolute path (default pi, resolved from PATH). */
  piPath?: string
  /** Pi global config home; omission uses `PI_CODING_AGENT_DIR` or Pi's default. */
  agentDir?: string
  /** Directory for Pi session storage and lookup; omission uses Pi's default. */
  sessionDir?: string
  /** Trust project-local files for this run, because no human answers the dialog. */
  approve?: boolean
  /** Model spelled `provider/model`, or a Pi pattern; omission keeps Pi's selection. */
  model?: string
  /** Thinking level; omission keeps Pi's selection. */
  thinking?: string
  /** Pi tool names excluded from every delegated session. */
  excludeTools?: string[]
  /** Deadline such as `30m` or `1h` after the prompt is sent; omission means no deadline. */
  timeout?: string
}

export const Config = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  piPath: z.string().min(1).default('pi'),
  agentDir: z.string().min(1),
  sessionDir: z.string().min(1),
  approve: z.boolean().default(true),
  // Volatile fields appear in the Plugins page form and apply to the next
  // delegation without remounting this provider.
  model: z.string().min(1).volatile(),
  thinking: z.string().min(1).volatile(),
  excludeTools: z.array(z.string().min(1)).default([]).volatile(),
  timeout: z.string().min(1).volatile(),
})

/** Resolved configuration: volatile fields are live references into the profile layer. */
export type ResolvedConfig = ReturnType<typeof Config>

/**
 * Read the live deployment settings for one delegation.
 * @param config - the plugin config carrying volatile references.
 * @returns the resolved one-shot run settings.
 * @throws PiSubagentFailure when a configured value Pi would silently clamp.
 */
function readSpec(config: ResolvedConfig): PiRunSpec {
  const thinking = config.thinking?.get()
  if (thinking !== undefined && !(THINKING_LEVELS as readonly string[]).includes(thinking)) {
    throw new PiSubagentFailure('startup', 'misconfigured', {
      cause: new Error(`Pi has no thinking level ${thinking} (levels: ${THINKING_LEVELS.join(', ')})`),
    })
  }
  const timeout = config.timeout?.get()
  const model = config.model?.get()
  return {
    piPath: config.piPath ?? 'pi',
    approve: config.approve ?? true,
    excludeTools: config.excludeTools?.get() ?? [],
    ...(config.agentDir === undefined ? {} : { agentDir: config.agentDir }),
    ...(config.sessionDir === undefined ? {} : { sessionDir: config.sessionDir }),
    ...(thinking === undefined ? {} : { thinking }),
    ...(timeout === undefined ? {} : { timeoutMs: parseDuration(timeout) }),
    ...(model === undefined ? {} : { model }),
  }
}

/** The slice of the authenticated connection service this plugin serves from. */
interface ConnectionScope {
  connection: {
    fetch: {
      register(route: {
        path: string
        methods: string[]
        requestBody: 'buffered'
        fetch: (request: { json(): Promise<unknown> }) => Promise<Response>
      }): () => void | Promise<void>
    }
  }
}

/**
 * Serve the session history table. Reads Pi's own JSONL files; never spawns Pi.
 * @param config - the provider configuration that names Pi's home.
 * @param request - POST request whose body selects scope and row limit.
 * @returns JSON with the rows, or a fixed failure message.
 */
async function history(config: ResolvedConfig, request: { json(): Promise<unknown> }): Promise<Response> {
  const headers = { 'cache-control': 'no-store' }
  try {
    let body: Record<string, unknown> = {}
    try {
      const parsed = await request.json()
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>
    } catch { /* An empty body takes the defaults. */ }
    const scope = body.scope === 'all' ? 'all' : 'delegated'
    const limit = typeof body.limit === 'number' ? body.limit : undefined
    const sessionsRoot = config.sessionDir ?? join(resolveAgentDir(config.agentDir), 'sessions')
    const historyRequest: HistoryRequest = { scope, ...(limit === undefined ? {} : { limit }) }
    const sessions = await listSessions(sessionsRoot, historyRequest)
    const total = await countSessionFiles(sessionsRoot)
    return Response.json({ ok: true, value: { sessions, total } }, { headers })
  } catch {
    return Response.json({ ok: false, error: { message: 'Could not read Pi session history.' } }, { headers })
  }
}

/**
 * Register one Pi RPC provider with the shared subagent service.
 * @param ctx - context carrying the shared subagent service.
 * @param config - provider name, CLI path, Pi home and deployment settings.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  const providerName = config.providerName ?? DEFAULT_PROVIDER_NAME
  const spec = (): PiRunSpec => ({
    ...readSpec(config),
    onError: (error) => {
      ctx.logger.warn('subagent-pi "%s": %s', providerName, error.message)
    },
  })
  const provider: SubagentProvider = {
    name: providerName,
    capabilities: NO_START_CAPABILITIES,
    inheritsParentContext: false,
    start: request => startPiRun(request, spec()),
  }
  ctx.subagents.registerProvider(provider)

  // The history table lives on the Plugins page, so it is served over the same
  // authenticated connection channel the rest of the client uses.
  ctx.inject(['connection'], (scope) => {
    const connection = (scope as unknown as ConnectionScope).connection
    if (connection === undefined) return
    const dispose = connection.fetch.register({
      path: '/api/dsh-subagent-pi/sessions',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: request => history(config, request),
    })
    scope.effect(() => () => { void dispose() }, 'subagent-pi: history route')
  })
}
