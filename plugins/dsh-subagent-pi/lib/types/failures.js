/**
 * Typed failure classification for the Pi subagent provider. Every stage of a
 * delegation produces a fixed, actionable sentence; native causes stay on the
 * Error for local debugging and never reach the model-facing diagnostic, where
 * they could carry paths, credentials, or protocol payloads.
 *
 * @module dsh-subagent-pi/failures
 */
const advice = {
    spawn: 'Install the Pi CLI, or point piPath at it, before retrying.',
    startup: 'Check the Pi CLI version, the model, and the session directory.',
    turn: 'Check the selected model and its account before retrying.',
    abort: 'Pi did not accept the interruption; the process was terminated.',
    dispose: 'The Pi process may still be active; check it before starting another task.',
};
/** Structured Pi provider failure with its stage and category. */
export class PiSubagentFailure extends Error {
    stage;
    category;
    /**
     * @param stage - the delegation stage that failed.
     * @param category - machine-readable failure category.
     * @param options - standard Error options (retains the native cause for local debugging).
     */
    constructor(stage, category, options) {
        super(`Pi subagent failure (stage: ${stage}; category: ${category}). ${advice[stage]}`, options);
        this.name = 'PiSubagentFailure';
        this.stage = stage;
        this.category = category;
    }
}
/** Normalize a thrown value to an Error. */
export function toError(value) {
    return value instanceof Error ? value : new Error(String(value));
}
//# sourceMappingURL=failures.js.map