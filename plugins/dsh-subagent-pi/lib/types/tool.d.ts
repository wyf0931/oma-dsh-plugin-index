/**
 * Model-facing delegation tool for the Pi subagent provider. One call starts
 * one Pi session in its own process; the same call can continue an earlier
 * session by its id, so follow-up work reuses Pi's context instead of paying
 * for it again.
 *
 * @module dsh-subagent-pi/tool
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "tool-subagent-pi";
export declare const inject: string[];
/** Configuration of the Pi delegation tool. */
export interface Config {
    /** Registered Pi provider name the tool starts delegations on (default pi). */
    providerName?: string;
    /** Model-facing tool name (default delegate_pi). */
    toolName?: string;
}
export declare const Config: z<Config>;
/**
 * Register the delegation tool.
 * @param ctx - shared tool registry and managed subagent service.
 * @param config - the target provider and model-facing tool name.
 */
export declare function apply(ctx: Context, config: Config): void;
