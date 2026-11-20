/**
 * Human-readable deadlines for long delegations. A bare number is milliseconds
 * for callers that already speak them; a unit suffix makes `30m` or `1h30m`
 * readable in the profile and in the Plugins page.
 *
 * @module dsh-subagent-pi/duration
 */
/**
 * Parse a duration into milliseconds.
 * @param text - `3600000`, or one to three `<number><unit>` groups such as `45m`, `1h`, `1h30m`.
 * @returns the duration in whole milliseconds.
 * @throws PiSubagentFailure when the text is not a positive duration within the timer ceiling.
 */
export declare function parseDuration(text: string): number;
/** Format a duration the way a person reads it, for diagnostics. */
export declare function formatDuration(ms: number): string;
