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
import { PiSubagentFailure } from "./failures.js";
/** Reserved prefix of the control block. `\u0000` never starts a real task. */
export const CONTROL_PREFIX = '\u0000dsh-pi ';
/** Build the prompt the provider receives: the task, then the control block. */
export function withControl(prompt, control) {
    return [...prompt, { type: 'text', text: CONTROL_PREFIX + JSON.stringify(control) }];
}
/**
 * Split a provider-facing prompt into the task blocks and the control.
 * @param prompt - content supplied by the delegation tool.
 * @returns the task blocks and, when present, the parsed control.
 * @throws PiSubagentFailure when a control block is present but malformed.
 */
export function takeControl(prompt) {
    const last = prompt.at(-1);
    if (last === undefined || last.type !== 'text' || !last.text.startsWith(CONTROL_PREFIX)) {
        return { prompt };
    }
    let value;
    try {
        value = JSON.parse(last.text.slice(CONTROL_PREFIX.length));
    }
    catch (error) {
        throw new PiSubagentFailure('startup', 'misconfigured', { cause: error });
    }
    const control = value !== null && typeof value === 'object' ? value : undefined;
    if (control === undefined || typeof control.sessionId !== 'string' || control.sessionId.trim().length === 0
        || control.sessionId.length > 128 || typeof control.resume !== 'boolean') {
        throw new PiSubagentFailure('startup', 'misconfigured');
    }
    return { prompt: prompt.slice(0, -1), control: { sessionId: control.sessionId, resume: control.resume } };
}
//# sourceMappingURL=control.js.map