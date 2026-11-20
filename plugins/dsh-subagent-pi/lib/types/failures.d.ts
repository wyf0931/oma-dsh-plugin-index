/**
 * Typed failure classification for the Pi subagent provider. Every stage of a
 * delegation produces a fixed, actionable sentence; native causes stay on the
 * Error for local debugging and never reach the model-facing diagnostic, where
 * they could carry paths, credentials, or protocol payloads.
 *
 * @module dsh-subagent-pi/failures
 */
/** The delegation stage at which a failure occurred. */
export type PiFailureStage = 'spawn' | 'startup' | 'turn' | 'abort' | 'dispose';
/** Machine-readable failure category within a stage. */
export type PiFailureCategory = 'not-found' | 'unsupported' | 'cancelled' | 'timeout' | 'misconfigured' | 'protocol' | 'unknown';
/** Structured Pi provider failure with its stage and category. */
export declare class PiSubagentFailure extends Error {
    readonly stage: PiFailureStage;
    readonly category: PiFailureCategory;
    /**
     * @param stage - the delegation stage that failed.
     * @param category - machine-readable failure category.
     * @param options - standard Error options (retains the native cause for local debugging).
     */
    constructor(stage: PiFailureStage, category: PiFailureCategory, options?: ErrorOptions);
}
/** Normalize a thrown value to an Error. */
export declare function toError(value: unknown): Error;
