/**
 * Named one-shot subagent provider backed by the local Pi CLI in RPC mode.
 * Every delegation spawns its own `pi --mode rpc` child and disposes it when
 * the turn settles; no Pi code runs inside this process.
 *
 * @module dsh-subagent-pi
 */
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { NO_START_CAPABILITIES, } from '@deepseek-ai/dsh-subagent';
import { parseDuration } from "./duration.js";
import { PiSubagentFailure } from "./failures.js";
import { startPiRun } from "./run.js";
import { countSessionFiles, listSessions, resolveAgentDir } from "./sessions.js";
export const name = 'subagent-pi';
export const inject = ['subagents'];
const DEFAULT_PROVIDER_NAME = 'pi';
/** Thinking levels Pi accepts; an unknown word would be clamped silently. */
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
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
});
/**
 * Read the live deployment settings for one delegation.
 * @param config - the plugin config carrying volatile references.
 * @returns the resolved one-shot run settings.
 * @throws PiSubagentFailure when a configured value Pi would silently clamp.
 */
function readSpec(config) {
    const thinking = config.thinking?.get();
    if (thinking !== undefined && !THINKING_LEVELS.includes(thinking)) {
        throw new PiSubagentFailure('startup', 'misconfigured', {
            cause: new Error(`Pi has no thinking level ${thinking} (levels: ${THINKING_LEVELS.join(', ')})`),
        });
    }
    const timeout = config.timeout?.get();
    const model = config.model?.get();
    return {
        piPath: config.piPath ?? 'pi',
        approve: config.approve ?? true,
        excludeTools: config.excludeTools?.get() ?? [],
        ...(config.agentDir === undefined ? {} : { agentDir: config.agentDir }),
        ...(config.sessionDir === undefined ? {} : { sessionDir: config.sessionDir }),
        ...(thinking === undefined ? {} : { thinking }),
        ...(timeout === undefined ? {} : { timeoutMs: parseDuration(timeout) }),
        ...(model === undefined ? {} : { model }),
    };
}
/**
 * Serve the session history table. Reads Pi's own JSONL files; never spawns Pi.
 * @param config - the provider configuration that names Pi's home.
 * @param request - POST request whose body selects scope and row limit.
 * @returns JSON with the rows, or a fixed failure message.
 */
async function history(config, request) {
    const headers = { 'cache-control': 'no-store' };
    try {
        let body = {};
        try {
            const parsed = await request.json();
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
                body = parsed;
        }
        catch { /* An empty body takes the defaults. */ }
        const scope = body.scope === 'all' ? 'all' : 'delegated';
        const limit = typeof body.limit === 'number' ? body.limit : undefined;
        const sessionsRoot = config.sessionDir ?? join(resolveAgentDir(config.agentDir), 'sessions');
        const historyRequest = { scope, ...(limit === undefined ? {} : { limit }) };
        const sessions = await listSessions(sessionsRoot, historyRequest);
        const total = await countSessionFiles(sessionsRoot);
        return Response.json({ ok: true, value: { sessions, total } }, { headers });
    }
    catch {
        return Response.json({ ok: false, error: { message: 'Could not read Pi session history.' } }, { headers });
    }
}
/**
 * Register one Pi RPC provider with the shared subagent service.
 * @param ctx - context carrying the shared subagent service.
 * @param config - provider name, CLI path, Pi home and deployment settings.
 */
export function apply(ctx, config) {
    const providerName = config.providerName ?? DEFAULT_PROVIDER_NAME;
    const spec = () => ({
        ...readSpec(config),
        onError: (error) => {
            ctx.logger.warn('subagent-pi "%s": %s', providerName, error.message);
        },
    });
    const provider = {
        name: providerName,
        capabilities: NO_START_CAPABILITIES,
        inheritsParentContext: false,
        start: request => startPiRun(request, spec()),
    };
    ctx.subagents.registerProvider(provider);
    // The history table lives on the Plugins page, so it is served over the same
    // authenticated connection channel the rest of the client uses.
    ctx.inject(['connection'], (scope) => {
        const connection = scope.connection;
        if (connection === undefined)
            return;
        const dispose = connection.fetch.register({
            path: '/api/dsh-subagent-pi/sessions',
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: request => history(config, request),
        });
        scope.effect(() => () => { void dispose(); }, 'subagent-pi: history route');
    });
}
//# sourceMappingURL=index.js.map