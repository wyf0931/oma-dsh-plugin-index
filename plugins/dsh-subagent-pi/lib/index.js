import { i as toError, r as PiSubagentFailure, t as takeControl } from "./control-5eU4oxyU.js";
import { dirname, join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { NO_START_CAPABILITIES, assertUsableCwd, subprocessRunHandle } from "@deepseek-ai/dsh-subagent";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { randomUUID } from "node:crypto";
import { brandString } from "@deepseek-ai/dsh-brand";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
// lib/types/duration.js
/**
* Human-readable deadlines for long delegations. A bare number is milliseconds
* for callers that already speak them; a unit suffix makes `30m` or `1h30m`
* readable in the profile and in the Plugins page.
*
* @module dsh-subagent-pi/duration
*/
const UNIT_SECONDS = {
	h: 3600,
	m: 60,
	s: 1
};
/**
* Parse a duration into milliseconds.
* @param text - `3600000`, or one to three `<number><unit>` groups such as `45m`, `1h`, `1h30m`.
* @returns the duration in whole milliseconds.
* @throws PiSubagentFailure when the text is not a positive duration within the timer ceiling.
*/
function parseDuration(text) {
	const value = text.trim();
	const plain = /^(\d+)$/.exec(value);
	const parts = plain === null ? /^(\d+[hms])+$/i.exec(value.replace(/\s+/gu, "")) : null;
	let ms;
	if (plain !== null) ms = Number(plain[1]);
	else if (parts !== null) {
		ms = 0;
		for (const match of value.replace(/\s+/gu, "").matchAll(/(\d+)([hms])/giu)) {
			const unit = match[2].toLowerCase();
			ms += Number(match[1]) * UNIT_SECONDS[unit] * 1e3;
		}
	} else throw invalid(text);
	if (!Number.isSafeInteger(ms) || ms < 1 || ms > MAX_TIMER_DELAY_MS) throw invalid(text);
	return ms;
}
/** Format a duration the way a person reads it, for diagnostics. */
function formatDuration(ms) {
	if (ms % 36e5 === 0) return `${ms / 36e5}h`;
	if (ms % 6e4 === 0) return `${ms / 6e4}m`;
	if (ms % 1e3 === 0) return `${ms / 1e3}s`;
	return `${ms}ms`;
}
function invalid(text) {
	return new PiSubagentFailure("startup", "misconfigured", { cause: /* @__PURE__ */ new Error(`Not a duration: ${JSON.stringify(text)}. Use 30m, 45s, 1h, 1h30m, or milliseconds.`) });
}
// lib/types/answer.js
/**
* Answer selection for one delegated Pi turn. Pi emits both streamed text
* deltas and completed messages; the completed non-empty assistant message is
* authoritative, matching the shared SubagentResult rule "last non-empty
* assistant message, else the accumulated text stream".
*
* @module dsh-subagent-pi/answer
*/
/** Extract the concatenated text content of one assistant message. */
function assistantText(message) {
	let text = "";
	for (const block of message.content) if (block.type === "text" && block.text !== void 0) text += block.text;
	return text;
}
/**
* Create an answer collector for one delegated turn.
* @returns a collector that prefers the last non-empty completed message.
*/
function createAnswerCollector() {
	let streamed = "";
	let lastMessage = "";
	return {
		delta(text) {
			streamed += text;
		},
		message(message) {
			const text = assistantText(message);
			if (text.trim().length > 0) lastMessage = text;
		},
		answer() {
			return lastMessage !== "" ? lastMessage : streamed;
		}
	};
}
// lib/types/rpc.js
/**
* Minimal Pi RPC transport: spawn the local `pi --mode rpc` child, frame its
* strict JSONL stdout, answer the extension dialogs a human would answer, and
* own orderly shutdown. No Pi SDK is imported and no Pi code runs in this
* process; the child is the isolation boundary.
*
* @module dsh-subagent-pi/rpc
*/
/**
* Split a UTF-8 buffer into complete JSONL records. Only LF terminates a
* record, because U+2028 and U+2029 are legal inside JSON strings and Node's
* readline would split on them.
* @param buffer - text read so far.
* @returns complete lines and the incomplete remainder.
*/
function drainLines(buffer) {
	const records = [];
	let start = 0;
	for (let index = 0; index < buffer.length; index += 1) {
		if (buffer[index] !== "\n") continue;
		let line = buffer.slice(start, index);
		if (line.endsWith("\r")) line = line.slice(0, -1);
		start = index + 1;
		if (line.trim().length > 0) records.push(line);
	}
	return {
		records,
		rest: buffer.slice(start)
	};
}
/** Live child process plus framing state. */
var PiProcess = class PiProcess {
	child;
	options;
	buffer = "";
	decoder = new StringDecoder("utf8");
	stderrText = "";
	fatal;
	exit;
	constructor(child, options) {
		this.child = child;
		this.options = options;
		child.stdout.on("data", (chunk) => this.read(chunk));
		child.stderr.on("data", (chunk) => {
			this.stderrText = (this.stderrText + chunk.toString("utf8")).slice(-8192);
		});
		child.stdin.on("error", () => {});
		child.on("error", (error) => this.fail(error));
		this.exit = new Promise((resolve) => child.once("close", (code) => resolve(code)));
	}
	/**
	* Start the child and resolve after it has spawned (not after it is ready —
	* RPC accepts commands immediately).
	* @throws PiSubagentFailure with stage `spawn` when the executable is missing.
	*/
	static async start(options) {
		const child = spawn(options.command, [...options.argv], {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
		try {
			await once(child, "spawn");
		} catch (error) {
			child.kill("SIGKILL");
			if (error?.code === "ENOENT") throw new PiSubagentFailure("spawn", "not-found", { cause: toError(error) });
			throw new PiSubagentFailure("spawn", "unknown", { cause: toError(error) });
		}
		return new PiProcess(child, options);
	}
	/** Whether the transport or the child already failed. */
	get failure() {
		return this.fatal;
	}
	/** Write one command record. Writes after failure are dropped. */
	send(command) {
		if (this.fatal !== void 0 || this.child.stdin.destroyed) return;
		try {
			this.child.stdin.write(`${JSON.stringify(command)}\n`);
		} catch (error) {
			this.fail(toError(error));
		}
	}
	/** Close stdin, which asks Pi for an orderly shutdown. */
	endInput() {
		try {
			this.child.stdin.end();
		} catch {}
	}
	/** Wait for the child to exit, at most `graceMs`; then signal it. */
	async shutdown(graceMs = 2e3) {
		this.endInput();
		if (await within(this.exit, graceMs)) return;
		this.child.kill("SIGTERM");
		if (await within(this.exit, graceMs)) return;
		this.child.kill("SIGKILL");
		await this.exit.catch(() => null);
	}
	/** Resolve with the exit code once the child exits. */
	whenExited() {
		return this.exit;
	}
	/** Terminate the child now. */
	kill() {
		this.child.kill("SIGKILL");
	}
	/** The tail of the child's stderr, for local diagnostics only. */
	stderr() {
		return this.stderrText;
	}
	read(chunk) {
		if (this.fatal !== void 0) return;
		this.buffer += this.decoder.write(chunk);
		const { records, rest } = drainLines(this.buffer);
		this.buffer = rest;
		for (const line of records) {
			let record;
			try {
				const parsed = JSON.parse(line);
				if (parsed === null || typeof parsed !== "object" || typeof parsed.type !== "string") throw new Error("subagent-pi: RPC record without a type");
				record = parsed;
			} catch (error) {
				this.fail(new PiSubagentFailure("turn", "protocol", { cause: toError(error) }));
				return;
			}
			this.options.onRecord(record);
			if (this.fatal !== void 0) return;
		}
	}
	fail(error) {
		if (this.fatal !== void 0) return;
		this.fatal = error;
		this.options.onFatal?.(error);
	}
};
/** Resolve true when `promise` settles within `ms`. */
async function within(promise, ms) {
	let timer;
	const timeout = new Promise((resolve) => {
		timer = setTimeout(() => resolve(false), ms);
	});
	const settled = promise.then(() => true, () => true);
	try {
		return await Promise.race([settled, timeout]);
	} finally {
		if (timer !== void 0) clearTimeout(timer);
	}
}
/** True when a record is a dialog an unattended client must answer. */
function isDialog(record) {
	if (record.type !== "extension_ui_request") return false;
	const method = record.method;
	return typeof record.id === "string" && (method === "select" || method === "confirm" || method === "input" || method === "editor");
}
// lib/types/sessions.js
/**
* Pi session history for the configuration page. Reads Pi's own JSONL session
* files (read-only) and joins them with the ids this plugin recorded, so the
* table shows the delegations made here first. No Pi process is started.
*
* @module dsh-subagent-pi/sessions
*/
/** Default / maximum rows returned by the history route. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Bounded cache of parsed files, keyed by path and mtime. */
const cache = /* @__PURE__ */ new Map();
const CACHE_LIMIT = 400;
/** Resolve Pi's config home exactly as the provider does. */
function resolveAgentDir(configured) {
	if (configured !== void 0 && configured !== "") return configured;
	const pinned = process.env.PI_CODING_AGENT_DIR;
	if (pinned !== void 0 && pinned !== "") return pinned;
	return join(homedir(), ".pi", "agent");
}
/** The plugin's own state directory inside the DSH home. */
function stateDir() {
	const home = process.env.DSH_HOME;
	return join(home === void 0 || home === "" ? join(homedir(), ".dsh") : home, "dsh-subagent-pi");
}
/** Where the plugin records the session ids it delegated. */
function registryFile() {
	return join(stateDir(), "sessions.json");
}
/** Record one delegation so the history can tell it apart from manual Pi runs. */
async function recordSession(id, cwd) {
	try {
		const file = registryFile();
		let registry = {};
		try {
			const parsed = JSON.parse(await readFile(file, "utf8"));
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) registry = parsed;
		} catch {}
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const previous = registry[id];
		registry[id] = {
			cwd,
			firstSeenAt: previous?.firstSeenAt ?? now,
			lastSeenAt: now
		};
		await mkdir(dirname(file), { recursive: true });
		const temporary = `${file}.${process.pid}.tmp`;
		await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 384 });
		await rename(temporary, file);
	} catch {}
}
/** Read the recorded delegations; an unreadable registry is empty. */
async function readRegistry() {
	try {
		const parsed = JSON.parse(await readFile(registryFile(), "utf8"));
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}
/** Text of one message's content blocks. */
function messageText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	let text = "";
	for (const block of content) if (block !== null && typeof block === "object" && block.type === "text") {
		const value = block.text;
		if (typeof value === "string") text += value;
	}
	return text;
}
/** Collapse whitespace and cut a title to a readable length. */
function toTitle(text) {
	const flat = text.replace(/\s+/gu, " ").trim();
	if (flat === "") return "";
	return flat.length <= 80 ? flat : `${flat.slice(0, 79)}…`;
}
/** Add one usage record to the accumulator. */
function addUsage(target, usage) {
	target.input += typeof usage.input === "number" ? usage.input : 0;
	target.output += typeof usage.output === "number" ? usage.output : 0;
	target.cacheRead += typeof usage.cacheRead === "number" ? usage.cacheRead : 0;
	target.cacheWrite += typeof usage.cacheWrite === "number" ? usage.cacheWrite : 0;
	target.total += typeof usage.totalTokens === "number" ? usage.totalTokens : 0;
	target.cost += typeof usage.cost?.total === "number" ? usage.cost.total : 0;
}
/**
* Fold one session entry into the accumulator. Unknown entry types are ignored,
* so a newer Pi format never breaks the table.
* @param entry - one parsed JSONL record.
* @param into - the accumulator for the file.
*/
function foldEntry(entry, into) {
	if (entry === null || typeof entry !== "object") return;
	const record = entry;
	if (typeof record.timestamp === "string") into.lastTimestamp = record.timestamp;
	if (record.type === "session") {
		const header = entry;
		if (typeof header.id === "string" && typeof header.cwd === "string" && typeof header.timestamp === "string") into.header = {
			id: header.id,
			cwd: header.cwd,
			timestamp: header.timestamp
		};
		return;
	}
	if (record.type === "session_info") {
		if (typeof record.name === "string" && record.name.trim() !== "") into.name = record.name.trim();
		return;
	}
	if (record.type === "model_change") {
		if (typeof record.provider === "string" && typeof record.modelId === "string") into.model = `${record.provider}/${record.modelId}`;
		return;
	}
	if (record.type === "usage" || record.type === "compaction" || record.type === "branch_summary") {
		if (record.usage !== void 0) addUsage(into, record.usage);
		return;
	}
	if (record.type !== "message" || record.message === void 0) return;
	const message = record.message;
	if (message.provider !== void 0 && message.model !== void 0 && typeof message.provider === "string" && typeof message.model === "string") into.model = `${message.provider}/${message.model}`;
	if (message.usage !== void 0) addUsage(into, message.usage);
	if (message.role === "assistant") {
		into.turns += 1;
		return;
	}
	if (message.role === "user") {
		into.userMessages += 1;
		if (into.firstUserText === void 0) {
			const text = toTitle(messageText(message.content));
			if (text !== "") into.firstUserText = text;
		}
		return;
	}
	if (message.role === "toolResult") into.toolCalls += 1;
}
/** Turn one accumulated file into a summary. */
function summarize(accumulator, fallbackId) {
	const header = accumulator.header;
	const id = header?.id ?? fallbackId;
	const createdAt = header?.timestamp ?? accumulator.lastTimestamp ?? (/* @__PURE__ */ new Date(0)).toISOString();
	return {
		id,
		title: accumulator.name ?? accumulator.firstUserText ?? `Pi session ${id.slice(0, 8)}`,
		cwd: header?.cwd ?? "",
		model: accumulator.model ?? "",
		createdAt,
		updatedAt: accumulator.lastTimestamp ?? createdAt,
		turns: accumulator.turns,
		userMessages: accumulator.userMessages,
		toolCalls: accumulator.toolCalls,
		input: accumulator.input,
		cacheRead: accumulator.cacheRead,
		cacheWrite: accumulator.cacheWrite,
		output: accumulator.output,
		total: accumulator.total,
		cost: accumulator.cost
	};
}
/** Stream a JSONL file and fold each record, so large sessions stay bounded. */
async function readSessionFile(path) {
	const accumulator = {
		turns: 0,
		userMessages: 0,
		toolCalls: 0,
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		total: 0,
		cost: 0
	};
	const fallbackId = (path.split("_").at(-1) ?? "unknown").replace(/\.jsonl$/u, "");
	let remainder = "";
	const stream = createReadStream(path, { encoding: "utf8" });
	for await (const chunk of stream) {
		const text = remainder + chunk;
		let start = 0;
		for (let index = 0; index < text.length; index += 1) {
			if (text[index] !== "\n") continue;
			const line = text.slice(start, index);
			start = index + 1;
			if (line.trim() === "") continue;
			try {
				foldEntry(JSON.parse(line), accumulator);
			} catch {}
		}
		remainder = text.slice(start);
	}
	return summarize(accumulator, fallbackId);
}
/**
* Index every `*.jsonl` under a Pi session directory, without reading contents.
* Pi keeps one subdirectory per working directory by default, and writes flat
* files when `--session-dir` is set, so both layouts are indexed.
* @param root - the session directory (`<agentDir>/sessions` or a configured `sessionDir`).
* @returns every session file found.
*/
async function indexSessions(root) {
	const files = [];
	const add = async (dir, name) => {
		if (!name.endsWith(".jsonl")) return;
		const path = join(dir, name);
		try {
			const info = await stat(path);
			files.push({
				id: name.replace(/\.jsonl$/u, "").split("_").at(-1) ?? name,
				path,
				mtimeMs: info.mtimeMs
			});
		} catch {}
	};
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	for (const entry of entries) {
		if (entry.isFile()) {
			await add(root, entry.name);
			continue;
		}
		if (!entry.isDirectory()) continue;
		const dir = join(root, entry.name);
		let names;
		try {
			names = await readdir(dir);
		} catch {
			continue;
		}
		for (const name of names) await add(dir, name);
	}
	return files;
}
/** Load one file through the cache. */
async function summaryOf(file) {
	const cached = cache.get(file.path);
	if (cached !== void 0 && cached.mtimeMs === file.mtimeMs) return cached.summary;
	const summary = await readSessionFile(file.path);
	cache.set(file.path, {
		mtimeMs: file.mtimeMs,
		summary
	});
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== void 0) cache.delete(oldest);
	}
	return summary;
}
/**
* List Pi session history.
* @param sessionsRoot - Pi's session directory (or the configured `sessionDir`).
* @param request - scope (`delegated` joins the recorded ids; `all` scans recent files) and row limit.
* @returns rows newest first.
*/
async function listSessions(sessionsRoot, request = {}) {
	const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const files = await indexSessions(sessionsRoot);
	if (request.scope === "all") {
		const recent = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
		return (await Promise.all(recent.map(summaryOf))).map((row) => ({
			...row,
			delegated: false
		}));
	}
	const registry = await readRegistry();
	const registered = Object.keys(registry);
	if (registered.length === 0) return [];
	const byId = new Map(files.map((file) => [file.id, file]));
	const selected = [];
	for (const id of registered) {
		const file = byId.get(id);
		if (file === void 0) continue;
		const summary = await summaryOf(file);
		const meta = registry[id];
		selected.push({
			...summary,
			delegated: true,
			...meta === void 0 ? {} : { cwd: summary.cwd === "" ? meta.cwd : summary.cwd }
		});
	}
	return selected.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, limit);
}
/** Total number of Pi session files, for the empty state. */
async function countSessionFiles(sessionsRoot) {
	return (await indexSessions(sessionsRoot)).length;
}
// lib/types/run.js
/**
* One Pi delegation: spawn `pi --mode rpc`, deliver one prompt, select the
* final assistant text, and tear the child down. Pi runs in its own process;
* the parent session receives only the answer and fixed failure facts.
*
* @module dsh-subagent-pi/run
*/
/** How long a cancellation waits for Pi to honour the abort before signals. */
const ABORT_GRACE_MS = 2e3;
/** How long Pi may still settle after the deadline before the run is stopped. */
const TIMEOUT_GRACE_MS = 3e4;
/** Validate and join the delegated text; Pi accepts one text task. */
function textTask(prompt) {
	if (prompt.length === 0) throw new PiSubagentFailure("startup", "misconfigured");
	const texts = [];
	for (const block of prompt) {
		if (block.type !== "text") throw new PiSubagentFailure("startup", "misconfigured");
		texts.push(block.text);
	}
	const joined = texts.join("");
	if (joined.trim().length === 0) throw new PiSubagentFailure("startup", "misconfigured");
	return joined;
}
/** Build the child argv: RPC mode, the configured session, and the selector. */
function piArgv(spec, control) {
	const argv = ["--mode", "rpc"];
	if (spec.sessionDir !== void 0) argv.push("--session-dir", spec.sessionDir);
	if (spec.approve) argv.push("--approve");
	if (spec.model !== void 0) argv.push("--model", spec.model);
	if (spec.thinking !== void 0) argv.push("--thinking", spec.thinking);
	if (spec.excludeTools.length > 0) argv.push("--exclude-tools", spec.excludeTools.join(","));
	argv.push(control.resume ? "--session" : "--session-id", control.sessionId);
	return argv;
}
/** Report a failure to the local log without letting the observer change the result. */
function report(spec, error) {
	try {
		spec.onError?.(error);
	} catch {}
}
/** Build the state machine for one delegation. */
function createRun(spec, prompt, sessionId, pi) {
	const collector = createAnswerCollector();
	const settled = Promise.withResolvers();
	const promptId = `prompt-${randomUUID()}`;
	const resumeHint = `Continue with session ${sessionId} to keep the same Pi conversation and inspect what it already did.`;
	const diagnostics = {
		rejected: "Pi rejected the prompt. Check the model, the account, and the Pi CLI version.",
		exited: `Pi exited before the run settled. ${resumeHint}`,
		aborted: `The run was cancelled before Pi settled. ${resumeHint}`,
		timeout: `Pi was still working after ${formatDuration(spec.timeoutMs ?? 0)}. It was stopped and its session was kept. ${resumeHint}`
	};
	let phase = "idle";
	let deadline;
	let grace;
	const output = () => {
		const answer = collector.answer();
		return answer.length === 0 ? [] : [{
			type: "text",
			text: answer
		}];
	};
	const clearTimers = () => {
		for (const timer of [deadline, grace]) if (timer !== void 0) clearTimeout(timer);
		deadline = void 0;
		grace = void 0;
	};
	const finish = (result) => {
		if (phase === "done") return;
		phase = "done";
		clearTimers();
		settled.resolve(result);
	};
	const stop = (result) => {
		if (phase === "done") return;
		finish(result);
		pi().send({ type: "abort" });
	};
	const cancel = () => {
		stop({
			output: output(),
			stopReason: "aborted",
			diagnostic: diagnostics.aborted
		});
	};
	const overdue = () => {
		if (phase !== "running" || grace !== void 0) return;
		grace = setTimeout(() => {
			stop({
				output: output(),
				stopReason: "error",
				diagnostic: diagnostics.timeout
			});
		}, TIMEOUT_GRACE_MS);
	};
	return {
		result: settled.promise,
		cancel,
		exited: () => {
			if (phase === "done") return;
			report(spec, new PiSubagentFailure("turn", "unknown"));
			finish({
				output: output(),
				stopReason: "error",
				diagnostic: diagnostics.exited
			});
		},
		start: () => {
			if (phase !== "idle") return;
			phase = "running";
			pi().send({
				id: promptId,
				type: "prompt",
				message: prompt
			});
			if (spec.timeoutMs !== void 0) deadline = setTimeout(overdue, spec.timeoutMs);
		},
		handle: (record) => {
			if (phase !== "running") return;
			switch (record.type) {
				case "message_update": {
					const update = record.assistantMessageEvent;
					if (update === null || typeof update !== "object") return;
					const event = update;
					if (event.type === "text_delta" && typeof event.delta === "string") collector.delta(event.delta);
					return;
				}
				case "message_end": {
					const message = record.message;
					if (message === null || typeof message !== "object") return;
					const value = message;
					if (value.role !== "assistant" || !Array.isArray(value.content)) return;
					collector.message({ content: value.content });
					return;
				}
				case "agent_settled":
					finish({
						output: output(),
						stopReason: record.aborted === true ? "aborted" : "completed"
					});
					return;
				case "response":
					if (record.command !== "prompt" || record.id !== promptId) return;
					if (record.success !== true) {
						finish({
							output: output(),
							stopReason: "error",
							diagnostic: diagnostics.rejected
						});
						return;
					}
					if ((record.data !== null && typeof record.data === "object" ? record.data : void 0)?.disposition === "handled") finish({
						output: output(),
						stopReason: "completed"
					});
					return;
				default: return;
			}
		}
	};
}
/**
* Open one Pi RPC child and publish its one-shot run.
* @param request - text task, resolved child directory, parent, cancellation.
* @param spec - resolved deployment settings shared by one provider instance.
* @returns the run after the child spawned; post-publication failures settle through result.
*/
async function startPiRun(request, spec) {
	const split = takeControl(request.prompt);
	const prompt = textTask(split.prompt);
	const control = split.control ?? {
		sessionId: randomUUID(),
		resume: false
	};
	const cwd = assertUsableCwd("subagent-pi", "child cwd", request.cwd);
	if (request.signal.aborted) throw new PiSubagentFailure("startup", "cancelled");
	await recordSession(control.sessionId, cwd);
	let pi;
	const state = createRun(spec, prompt, control.sessionId, () => {
		if (pi === void 0) throw new PiSubagentFailure("startup", "cancelled");
		return pi;
	});
	try {
		pi = await PiProcess.start({
			command: spec.piPath,
			argv: piArgv(spec, control),
			cwd,
			...spec.agentDir === void 0 ? {} : { env: {
				...process.env,
				PI_CODING_AGENT_DIR: spec.agentDir
			} },
			onRecord: (record) => {
				if (isDialog(record)) {
					pi?.send({
						type: "extension_ui_response",
						id: record.id,
						cancelled: true
					});
					return;
				}
				state.handle(record);
			},
			onFatal: (error) => report(spec, error)
		});
	} catch (error) {
		throw error instanceof PiSubagentFailure ? error : new PiSubagentFailure("spawn", "unknown", { cause: toError(error) });
	}
	const child = pi;
	const onAbort = () => {
		state.cancel();
	};
	request.signal.addEventListener("abort", onAbort, { once: true });
	if (request.signal.aborted) onAbort();
	child.whenExited().then(() => state.exited());
	const teardown = async () => {
		state.cancel();
		await child.shutdown(ABORT_GRACE_MS);
		await state.result;
	};
	try {
		state.start();
	} catch (error) {
		request.signal.removeEventListener("abort", onAbort);
		await teardown();
		throw new PiSubagentFailure("startup", "unknown", { cause: toError(error) });
	}
	return subprocessRunHandle({
		id: brandString(randomUUID()),
		result: state.result,
		signal: request.signal,
		onAbort,
		requestCancel: onAbort,
		teardown: async () => {
			request.signal.removeEventListener("abort", onAbort);
			await teardown();
		}
	});
}
// lib/types/index.js
/**
* Named one-shot subagent provider backed by the local Pi CLI in RPC mode.
* Every delegation spawns its own `pi --mode rpc` child and disposes it when
* the turn settles; no Pi code runs inside this process.
*
* @module dsh-subagent-pi
*/
const name = "subagent-pi";
const inject = ["subagents"];
const DEFAULT_PROVIDER_NAME = "pi";
/** Thinking levels Pi accepts; an unknown word would be clamped silently. */
const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
const Config = z.object({
	providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
	piPath: z.string().min(1).default("pi"),
	agentDir: z.string().min(1),
	sessionDir: z.string().min(1),
	approve: z.boolean().default(true),
	model: z.string().min(1).volatile(),
	thinking: z.string().min(1).volatile(),
	excludeTools: z.array(z.string().min(1)).default([]).volatile(),
	timeout: z.string().min(1).volatile()
});
/**
* Read the live deployment settings for one delegation.
* @param config - the plugin config carrying volatile references.
* @returns the resolved one-shot run settings.
* @throws PiSubagentFailure when a configured value Pi would silently clamp.
*/
function readSpec(config) {
	const thinking = config.thinking?.get();
	if (thinking !== void 0 && !THINKING_LEVELS.includes(thinking)) throw new PiSubagentFailure("startup", "misconfigured", { cause: /* @__PURE__ */ new Error(`Pi has no thinking level ${thinking} (levels: ${THINKING_LEVELS.join(", ")})`) });
	const timeout = config.timeout?.get();
	const model = config.model?.get();
	return {
		piPath: config.piPath ?? "pi",
		approve: config.approve ?? true,
		excludeTools: config.excludeTools?.get() ?? [],
		...config.agentDir === void 0 ? {} : { agentDir: config.agentDir },
		...config.sessionDir === void 0 ? {} : { sessionDir: config.sessionDir },
		...thinking === void 0 ? {} : { thinking },
		...timeout === void 0 ? {} : { timeoutMs: parseDuration(timeout) },
		...model === void 0 ? {} : { model }
	};
}
/**
* Serve the session history table. Reads Pi's own JSONL files; never spawns Pi.
* @param config - the provider configuration that names Pi's home.
* @param request - POST request whose body selects scope and row limit.
* @returns JSON with the rows, or a fixed failure message.
*/
async function history(config, request) {
	const headers = { "cache-control": "no-store" };
	try {
		let body = {};
		try {
			const parsed = await request.json();
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
		} catch {}
		const scope = body.scope === "all" ? "all" : "delegated";
		const limit = typeof body.limit === "number" ? body.limit : void 0;
		const sessionsRoot = config.sessionDir ?? join(resolveAgentDir(config.agentDir), "sessions");
		const sessions = await listSessions(sessionsRoot, {
			scope,
			...limit === void 0 ? {} : { limit }
		});
		const total = await countSessionFiles(sessionsRoot);
		return Response.json({
			ok: true,
			value: {
				sessions,
				total
			}
		}, { headers });
	} catch {
		return Response.json({
			ok: false,
			error: { message: "Could not read Pi session history." }
		}, { headers });
	}
}
/**
* Register one Pi RPC provider with the shared subagent service.
* @param ctx - context carrying the shared subagent service.
* @param config - provider name, CLI path, Pi home and deployment settings.
*/
function apply(ctx, config) {
	const providerName = config.providerName ?? DEFAULT_PROVIDER_NAME;
	const spec = () => ({
		...readSpec(config),
		onError: (error) => {
			ctx.logger.warn("subagent-pi \"%s\": %s", providerName, error.message);
		}
	});
	const provider = {
		name: providerName,
		capabilities: NO_START_CAPABILITIES,
		inheritsParentContext: false,
		start: (request) => startPiRun(request, spec())
	};
	ctx.subagents.registerProvider(provider);
	ctx.inject(["connection"], (scope) => {
		const connection = scope.connection;
		if (connection === void 0) return;
		const dispose = connection.fetch.register({
			path: "/api/dsh-subagent-pi/sessions",
			methods: ["POST"],
			requestBody: "buffered",
			fetch: (request) => history(config, request)
		});
		scope.effect(() => () => {
			dispose();
		}, "subagent-pi: history route");
	});
}
export { Config, apply, inject, name };
