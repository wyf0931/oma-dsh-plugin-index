/**
 * The private control block the delegation tool appends to the prompt for the
 * provider, and the provider strips before Pi ever sees a character of it.
 *
 * The subagent seam deliberately has no provider-specific request field, so
 * the two halves of this bundle carry the chosen Pi session id in one extra
 * text block with a reserved prefix. Any other text block is the task itself.
 *
 * @module dsh-subagent-pi/control
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
/** Reserved prefix of the control block. `\u0000` never starts a real task. */
export declare const CONTROL_PREFIX = "\0dsh-pi ";
/** Which Pi session one delegation runs on, and whether it already exists. */
export interface PiControl {
    /** Pi session id: created on a first delegation, continued on a resume. */
    readonly sessionId: string;
    /** True to continue an existing session instead of creating one. */
    readonly resume: boolean;
}
/** Build the prompt the provider receives: the task, then the control block. */
export declare function withControl(prompt: readonly ContentBlock[], control: PiControl): ContentBlock[];
/**
 * Split a provider-facing prompt into the task blocks and the control.
 * @param prompt - content supplied by the delegation tool.
 * @returns the task blocks and, when present, the parsed control.
 * @throws PiSubagentFailure when a control block is present but malformed.
 */
export declare function takeControl(prompt: readonly ContentBlock[]): {
    prompt: readonly ContentBlock[];
    control?: PiControl;
};
