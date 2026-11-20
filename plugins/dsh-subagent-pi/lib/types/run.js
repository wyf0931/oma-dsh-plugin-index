/**
 * One Pi delegation: spawn `pi --mode rpc`, deliver one prompt, select the
 * final assistant text, and tear the child down. Pi runs in its own process;
 * the parent session receives only the answer and fixed failure facts.
 *
 * @module dsh-subagent-pi/run
 */
import { randomUUID } from 'node:crypto';
import { brandString } from '@deepseek-ai/dsh-brand';
import { assertUsableCwd, subprocessRunHandle, } from '@deepseek-ai/dsh-subagent';
import { createAnswerCollector } from "./answer.js";
import { takeControl } from "./control.js";
import { formatDuration } from "./duration.js";
import { PiSubagentFailure, toError } from "./failures.js";
import { isDialog, PiProcess } from "./rpc.js";
import { recordSession } from "./sessions.js";
/** How long a cancellation waits for Pi to honour the abort before signals. */
const ABORT_GRACE_MS = 2_000;
/** How long Pi may still settle after the deadline before the run is stopped. */
const TIMEOUT_GRACE_MS = 30_000;
/** Validate and join the delegated text; Pi accepts one text task. */
export function textTask(prompt) {
    if (prompt.length === 0)
        throw new PiSubagentFailure('startup', 'misconfigured');
    const texts = [];
    for (const block of prompt) {
        if (block.type !== 'text')
            throw new PiSubagentFailure('startup', 'misconfigured');
        texts.push(block.text);
    }
    const joined = texts.join('');
    if (joined.trim().length === 0)
        throw new PiSubagentFailure('startup', 'misconfigured');
    return joined;
}
/** Build the child argv: RPC mode, the configured session, and the selector. */
export function piArgv(spec, control) {
    const argv = ['--mode', 'rpc'];
    if (spec.sessionDir !== undefined)
        argv.push('--session-dir', spec.sessionDir);
    if (spec.approve)
        argv.push('--approve');
    if (spec.model !== undefined)
        argv.push('--model', spec.model);
    if (spec.thinking !== undefined)
        argv.push('--thinking', spec.thinking);
    if (spec.excludeTools.length > 0)
        argv.push('--exclude-tools', spec.excludeTools.join(','));
    argv.push(control.resume ? '--session' : '--session-id', control.sessionId);
    return argv;
}
/** Report a failure to the local log without letting the observer change the result. */
function report(spec, error) {
    try {
        spec.onError?.(error);
    }
    catch { /* A diagnostic observer cannot replace the run's result. */ }
}
/** Build the state machine for one delegation. */
function createRun(spec, prompt, sessionId, pi) {
    const collector = createAnswerCollector();
    const settled = Promise.withResolvers();
    const promptId = `prompt-${randomUUID()}`;
    const resumeHint = `Continue with session ${sessionId} to keep the same Pi conversation and inspect what it already did.`;
    const diagnostics = {
        rejected: 'Pi rejected the prompt. Check the model, the account, and the Pi CLI version.',
        exited: `Pi exited before the run settled. ${resumeHint}`,
        aborted: `The run was cancelled before Pi settled. ${resumeHint}`,
        timeout: `Pi was still working after ${formatDuration(spec.timeoutMs ?? 0)}. It was stopped and its session was kept. ${resumeHint}`,
    };
    let phase = 'idle';
    let deadline;
    let grace;
    const output = () => {
        const answer = collector.answer();
        return answer.length === 0 ? [] : [{ type: 'text', text: answer }];
    };
    const clearTimers = () => {
        for (const timer of [deadline, grace]) {
            if (timer !== undefined)
                clearTimeout(timer);
        }
        deadline = undefined;
        grace = undefined;
    };
    const finish = (result) => {
        if (phase === 'done')
            return;
        phase = 'done';
        clearTimers();
        settled.resolve(result);
    };
    const stop = (result) => {
        if (phase === 'done')
            return;
        finish(result);
        pi().send({ type: 'abort' });
    };
    const cancel = () => {
        stop({ output: output(), stopReason: 'aborted', diagnostic: diagnostics.aborted });
    };
    // The deadline is soft: Pi gets a grace window to settle on its own, so a
    // long task that finishes just after the deadline is not killed for nothing.
    const overdue = () => {
        if (phase !== 'running' || grace !== undefined)
            return;
        grace = setTimeout(() => {
            stop({ output: output(), stopReason: 'error', diagnostic: diagnostics.timeout });
        }, TIMEOUT_GRACE_MS);
    };
    return {
        result: settled.promise,
        cancel,
        exited: () => {
            if (phase === 'done')
                return;
            report(spec, new PiSubagentFailure('turn', 'unknown'));
            finish({ output: output(), stopReason: 'error', diagnostic: diagnostics.exited });
        },
        start: () => {
            if (phase !== 'idle')
                return;
            phase = 'running';
            pi().send({ id: promptId, type: 'prompt', message: prompt });
            if (spec.timeoutMs !== undefined)
                deadline = setTimeout(overdue, spec.timeoutMs);
        },
        handle: (record) => {
            if (phase !== 'running')
                return;
            switch (record.type) {
                case 'message_update': {
                    const update = record.assistantMessageEvent;
                    if (update === null || typeof update !== 'object')
                        return;
                    const event = update;
                    if (event.type === 'text_delta' && typeof event.delta === 'string')
                        collector.delta(event.delta);
                    return;
                }
                case 'message_end': {
                    const message = record.message;
                    if (message === null || typeof message !== 'object')
                        return;
                    const value = message;
                    if (value.role !== 'assistant' || !Array.isArray(value.content))
                        return;
                    collector.message({ content: value.content });
                    return;
                }
                case 'agent_settled': {
                    finish({ output: output(), stopReason: record.aborted === true ? 'aborted' : 'completed' });
                    return;
                }
                case 'response': {
                    if (record.command !== 'prompt' || record.id !== promptId)
                        return;
                    if (record.success !== true) {
                        finish({ output: output(), stopReason: 'error', diagnostic: diagnostics.rejected });
                        return;
                    }
                    const data = record.data !== null && typeof record.data === 'object'
                        ? record.data
                        : undefined;
                    if (data?.disposition === 'handled')
                        finish({ output: output(), stopReason: 'completed' });
                    return;
                }
                default:
                    return;
            }
        },
    };
}
/**
 * Open one Pi RPC child and publish its one-shot run.
 * @param request - text task, resolved child directory, parent, cancellation.
 * @param spec - resolved deployment settings shared by one provider instance.
 * @returns the run after the child spawned; post-publication failures settle through result.
 */
export async function startPiRun(request, spec) {
    const split = takeControl(request.prompt);
    const prompt = textTask(split.prompt);
    const control = split.control ?? { sessionId: randomUUID(), resume: false };
    const cwd = assertUsableCwd('subagent-pi', 'child cwd', request.cwd);
    if (request.signal.aborted)
        throw new PiSubagentFailure('startup', 'cancelled');
    await recordSession(control.sessionId, cwd);
    let pi;
    const state = createRun(spec, prompt, control.sessionId, () => {
        if (pi === undefined)
            throw new PiSubagentFailure('startup', 'cancelled');
        return pi;
    });
    try {
        pi = await PiProcess.start({
            command: spec.piPath,
            argv: piArgv(spec, control),
            cwd,
            ...(spec.agentDir === undefined
                ? {}
                : { env: { ...process.env, PI_CODING_AGENT_DIR: spec.agentDir } }),
            onRecord: (record) => {
                if (isDialog(record)) {
                    pi?.send({ type: 'extension_ui_response', id: record.id, cancelled: true });
                    return;
                }
                state.handle(record);
            },
            onFatal: error => report(spec, error),
        });
    }
    catch (error) {
        throw error instanceof PiSubagentFailure ? error : new PiSubagentFailure('spawn', 'unknown', { cause: toError(error) });
    }
    const child = pi;
    const onAbort = () => { state.cancel(); };
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted)
        onAbort();
    void child.whenExited().then(() => state.exited());
    const teardown = async () => {
        state.cancel();
        await child.shutdown(ABORT_GRACE_MS);
        await state.result;
    };
    try {
        state.start();
    }
    catch (error) {
        request.signal.removeEventListener('abort', onAbort);
        await teardown();
        throw new PiSubagentFailure('startup', 'unknown', { cause: toError(error) });
    }
    return subprocessRunHandle({
        id: brandString(randomUUID()),
        result: state.result,
        signal: request.signal,
        onAbort,
        requestCancel: onAbort,
        teardown: async () => {
            request.signal.removeEventListener('abort', onAbort);
            await teardown();
        },
    });
}
//# sourceMappingURL=run.js.map