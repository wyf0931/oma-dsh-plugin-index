/**
 * Human-readable deadlines for long delegations. A bare number is milliseconds
 * for callers that already speak them; a unit suffix makes `30m` or `1h30m`
 * readable in the profile and in the Plugins page.
 *
 * @module dsh-subagent-pi/duration
 */
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout';
import { PiSubagentFailure } from "./failures.js";
const UNIT_SECONDS = { h: 3600, m: 60, s: 1 };
/**
 * Parse a duration into milliseconds.
 * @param text - `3600000`, or one to three `<number><unit>` groups such as `45m`, `1h`, `1h30m`.
 * @returns the duration in whole milliseconds.
 * @throws PiSubagentFailure when the text is not a positive duration within the timer ceiling.
 */
export function parseDuration(text) {
    const value = text.trim();
    const plain = /^(\d+)$/.exec(value);
    const parts = plain === null ? /^(\d+[hms])+$/i.exec(value.replace(/\s+/gu, '')) : null;
    let ms;
    if (plain !== null) {
        ms = Number(plain[1]);
    }
    else if (parts !== null) {
        ms = 0;
        for (const match of value.replace(/\s+/gu, '').matchAll(/(\d+)([hms])/giu)) {
            const unit = match[2].toLowerCase();
            ms += Number(match[1]) * UNIT_SECONDS[unit] * 1000;
        }
    }
    else {
        throw invalid(text);
    }
    if (!Number.isSafeInteger(ms) || ms < 1 || ms > MAX_TIMER_DELAY_MS)
        throw invalid(text);
    return ms;
}
/** Format a duration the way a person reads it, for diagnostics. */
export function formatDuration(ms) {
    if (ms % 3_600_000 === 0)
        return `${ms / 3_600_000}h`;
    if (ms % 60_000 === 0)
        return `${ms / 60_000}m`;
    if (ms % 1000 === 0)
        return `${ms / 1000}s`;
    return `${ms}ms`;
}
function invalid(text) {
    return new PiSubagentFailure('startup', 'misconfigured', {
        cause: new Error(`Not a duration: ${JSON.stringify(text)}. Use 30m, 45s, 1h, 1h30m, or milliseconds.`),
    });
}
//# sourceMappingURL=duration.js.map