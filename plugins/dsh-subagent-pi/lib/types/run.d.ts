/**
 * One Pi delegation: spawn `pi --mode rpc`, deliver one prompt, select the
 * final assistant text, and tear the child down. Pi runs in its own process;
 * the parent session receives only the answer and fixed failure facts.
 *
 * @module dsh-subagent-pi/run
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { type ResolvedSubagentStartRequest, type SubagentRun } from '@deepseek-ai/dsh-subagent';
import { type PiControl } from './control.ts';
/** Resolved deployment settings shared by every delegation of one provider instance. */
export interface PiRunSpec {
    /** Executable name or absolute path of the Pi CLI. */
    readonly piPath: string;
    /** Pi's own config home; omitted keeps `PI_CODING_AGENT_DIR` or Pi's default. */
    readonly agentDir?: string;
    /** Directory for session storage and lookup; omitted keeps Pi's default. */
    readonly sessionDir?: string;
    /** Model spelled `provider/model`, or a Pi pattern. */
    readonly model?: string;
    /** Thinking level (`off` … `max`). */
    readonly thinking?: string;
    /** Pi tool names excluded from the session. */
    readonly excludeTools: readonly string[];
    /** Turn deadline in milliseconds after the prompt is sent. */
    readonly timeoutMs?: number;
    /** Trust project-local files, because no human can answer a trust dialog. */
    readonly approve: boolean;
    /** Receives safe summaries; native causes stay on the underlying Error. */
    readonly onError?: (error: Error) => void;
}
/** Validate and join the delegated text; Pi accepts one text task. */
export declare function textTask(prompt: readonly ContentBlock[]): string;
/** Build the child argv: RPC mode, the configured session, and the selector. */
export declare function piArgv(spec: PiRunSpec, control: PiControl): string[];
/**
 * Open one Pi RPC child and publish its one-shot run.
 * @param request - text task, resolved child directory, parent, cancellation.
 * @param spec - resolved deployment settings shared by one provider instance.
 * @returns the run after the child spawned; post-publication failures settle through result.
 */
export declare function startPiRun(request: ResolvedSubagentStartRequest, spec: PiRunSpec): Promise<SubagentRun>;
