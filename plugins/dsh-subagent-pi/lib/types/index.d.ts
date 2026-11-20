/**
 * Named one-shot subagent provider backed by the local Pi CLI in RPC mode.
 * Every delegation spawns its own `pi --mode rpc` child and disposes it when
 * the turn settles; no Pi code runs inside this process.
 *
 * @module dsh-subagent-pi
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "subagent-pi";
export declare const inject: string[];
/** Configuration of one Pi subagent provider instance. */
export interface Config {
    /** Name registered on the subagent service (default pi). */
    providerName?: string;
    /** Pi CLI executable name or absolute path (default pi, resolved from PATH). */
    piPath?: string;
    /** Pi global config home; omission uses `PI_CODING_AGENT_DIR` or Pi's default. */
    agentDir?: string;
    /** Directory for Pi session storage and lookup; omission uses Pi's default. */
    sessionDir?: string;
    /** Trust project-local files for this run, because no human answers the dialog. */
    approve?: boolean;
    /** Model spelled `provider/model`, or a Pi pattern; omission keeps Pi's selection. */
    model?: string;
    /** Thinking level; omission keeps Pi's selection. */
    thinking?: string;
    /** Pi tool names excluded from every delegated session. */
    excludeTools?: string[];
    /** Deadline such as `30m` or `1h` after the prompt is sent; omission means no deadline. */
    timeout?: string;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    providerName: z<string, string, "defined">;
    piPath: z<string, string, "defined">;
    agentDir: z<string, string, "plain">;
    sessionDir: z<string, string, "plain">;
    approve: z<boolean, boolean, "defined">;
    model: z<string, string, "volatile">;
    thinking: z<string, string, "volatile">;
    excludeTools: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    timeout: z<string, string, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    providerName: z<string, string, "defined">;
    piPath: z<string, string, "defined">;
    agentDir: z<string, string, "plain">;
    sessionDir: z<string, string, "plain">;
    approve: z<boolean, boolean, "defined">;
    model: z<string, string, "volatile">;
    thinking: z<string, string, "volatile">;
    excludeTools: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    timeout: z<string, string, "volatile">;
}>>, "plain">;
/** Resolved configuration: volatile fields are live references into the profile layer. */
export type ResolvedConfig = ReturnType<typeof Config>;
/**
 * Register one Pi RPC provider with the shared subagent service.
 * @param ctx - context carrying the shared subagent service.
 * @param config - provider name, CLI path, Pi home and deployment settings.
 */
export declare function apply(ctx: Context, config: ResolvedConfig): void;
