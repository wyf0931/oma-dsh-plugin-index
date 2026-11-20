// lib/types/failures.js
/**
* Typed failure classification for the Pi subagent provider. Every stage of a
* delegation produces a fixed, actionable sentence; native causes stay on the
* Error for local debugging and never reach the model-facing diagnostic, where
* they could carry paths, credentials, or protocol payloads.
*
* @module dsh-subagent-pi/failures
*/
const advice = {
	spawn: "Install the Pi CLI, or point piPath at it, before retrying.",
	startup: "Check the Pi CLI version, the model, and the session directory.",
	turn: "Check the selected model and its account before retrying.",
	abort: "Pi did not accept the interruption; the process was terminated.",
	dispose: "The Pi process may still be active; check it before starting another task."
};
/** Structured Pi provider failure with its stage and category. */
var PiSubagentFailure = class extends Error {
	stage;
	category;
	/**
	* @param stage - the delegation stage that failed.
	* @param category - machine-readable failure category.
	* @param options - standard Error options (retains the native cause for local debugging).
	*/
	constructor(stage, category, options) {
		super(`Pi subagent failure (stage: ${stage}; category: ${category}). ${advice[stage]}`, options);
		this.name = "PiSubagentFailure";
		this.stage = stage;
		this.category = category;
	}
};
/** Normalize a thrown value to an Error. */
function toError(value) {
	return value instanceof Error ? value : new Error(String(value));
}
// lib/types/control.js
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
/** Reserved prefix of the control block. `\u0000` never starts a real task. */
const CONTROL_PREFIX = "\0dsh-pi ";
/** Build the prompt the provider receives: the task, then the control block. */
function withControl(prompt, control) {
	return [...prompt, {
		type: "text",
		text: CONTROL_PREFIX + JSON.stringify(control)
	}];
}
/**
* Split a provider-facing prompt into the task blocks and the control.
* @param prompt - content supplied by the delegation tool.
* @returns the task blocks and, when present, the parsed control.
* @throws PiSubagentFailure when a control block is present but malformed.
*/
function takeControl(prompt) {
	const last = prompt.at(-1);
	if (last === void 0 || last.type !== "text" || !last.text.startsWith("\0dsh-pi ")) return { prompt };
	let value;
	try {
		value = JSON.parse(last.text.slice(8));
	} catch (error) {
		throw new PiSubagentFailure("startup", "misconfigured", { cause: error });
	}
	const control = value !== null && typeof value === "object" ? value : void 0;
	if (control === void 0 || typeof control.sessionId !== "string" || control.sessionId.trim().length === 0 || control.sessionId.length > 128 || typeof control.resume !== "boolean") throw new PiSubagentFailure("startup", "misconfigured");
	return {
		prompt: prompt.slice(0, -1),
		control: {
			sessionId: control.sessionId,
			resume: control.resume
		}
	};
}
export { toError as i, withControl as n, PiSubagentFailure as r, takeControl as t };
