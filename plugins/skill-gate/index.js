// skill-gate — Host half.
//
// Wraps the live `skills` registry (list/snapshot/get) so every consumer that
// views skills through an agent scope — the durable <available_skills> catalog
// published at each pre-step, the `skill` tool, the `/name` gesture injection,
// and the remote catalog the Web UI reads — only ever sees the skills enabled
// for that session. The gate itself is plain JSON state persisted under
// $DSH_HOME/skill-gate/state.json; a session without a stored selection is
// unrestricted (every skill enabled), matching the dsh default.
//
// The composer control talks to two authenticated Fetch routes on the
// connection's shared /api channel, the same channel dsh-context uses. The
// package deliberately imports nothing from @deepseek-ai/*: profile-installed
// bundles cannot rely on resolving the application's runtime packages, and
// every capability it needs is reachable as an injected Cordis service.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Cordis plugin id, also the loader row id in cordis.patch.yml. */
const name = "skill-gate";
/** Hard dependencies; everything else is optional and read defensively. */
const inject = ["skills", "agents", "workingDirectory", "sessionQuery"];

/** Public skill-name grammar, mirrored from the registry contract. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Marker the wrapper leaves on the registry so HMR re-apply stays idempotent. */
const WRAP_KEY = Symbol("skill-gate.originals");
/** Kept sessions in the state file; oldest entries are pruned beyond this. */
const MAX_SESSIONS = 500;

/** Resolve the state file under the dsh home, mirroring dsh-home-paths. */
function statePath() {
	const home = typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME !== "" ? process.env.DSH_HOME : join(homedir(), ".dsh");
	return resolve(home, "skill-gate/state.json");
}

/**
 * Normalize one stored selection: `null` (no restriction) or a deduplicated
 * array of kebab-case skill names. Anything else is rejected as `undefined`.
 * @param {unknown} value - raw persisted or submitted value.
 * @returns {null | string[] | undefined} the clean value, or undefined when invalid.
 */
function sanitizeEnabled(value) {
	if (value === null) return null;
	if (Array.isArray(value) !== true) return undefined;
	const names = [];
	for (const candidate of value) {
		if (typeof candidate !== "string" || SKILL_NAME.test(candidate) !== true) return undefined;
		if (names.includes(candidate) !== true) names.push(candidate);
	}
	return names;
}

/**
 * Normalize a whole persisted state document, dropping damaged fields rather
 * than failing the plugin.
 * @param {unknown} raw - parsed JSON document.
 * @returns {{ default: null | string[], sessions: Record<string, null | string[]> }} clean state.
 */
function sanitizeState(raw) {
	const state = { default: null, sessions: {} };
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return state;
	const defaults = sanitizeEnabled(raw.default);
	if (defaults !== undefined) state.default = defaults;
	if (raw.sessions !== null && typeof raw.sessions === "object" && Array.isArray(raw.sessions) !== true) {
		for (const [sessionId, value] of Object.entries(raw.sessions)) {
			if (typeof sessionId !== "string" || sessionId === "") continue;
			const enabled = sanitizeEnabled(value);
			if (enabled !== undefined) state.sessions[sessionId] = enabled;
		}
	}
	return state;
}

/** Drop the oldest session entries once the file outgrows the cap. */
function pruneSessions(state) {
	const keys = Object.keys(state.sessions);
	if (keys.length <= MAX_SESSIONS) return;
	for (const key of keys.slice(0, keys.length - MAX_SESSIONS)) delete state.sessions[key];
}

/**
 * Wrap one live registry instance with per-scope filtering. Called once per
 * activation; a leftover wrapper from a previous generation is removed first
 * so re-apply never stacks filters.
 * @param {object} registry - the live `skills` service instance.
 * @param {(scope: unknown) => Set<string> | null} gateSetForScope - enabled-set resolver for a view scope.
 * @param {object} logger - context logger for activation diagnostics.
 * @returns {{ originals: object, restore: () => void } | undefined} the wrap handle, or undefined when the service shape is not compatible.
 */
function wrapRegistry(registry, gateSetForScope, logger) {
	if (typeof registry?.list !== "function" || typeof registry?.snapshot !== "function" || typeof registry?.get !== "function") {
		logger.warn("skill-gate: the mounted skills service lacks list/snapshot/get; visibility control stays inactive");
		return undefined;
	}
	const previous = registry[WRAP_KEY];
	if (previous !== undefined) restoreWrapped(registry, previous);
	const originals = { list: registry.list, snapshot: registry.snapshot, get: registry.get };
	const wrappers = {
		async list(options = {}) {
			const skills = await originals.list.call(this, options);
			const gate = gateSetForScope(options?.scope);
			if (gate === null || Array.isArray(skills) !== true) return skills;
			return skills.filter((skill) => gate.has(skill?.name));
		},
		async snapshot(options = {}) {
			const snapshot = await originals.snapshot.call(this, options);
			const gate = gateSetForScope(options?.scope);
			if (gate === null || snapshot === null || typeof snapshot !== "object") return snapshot;
			const skills = Array.isArray(snapshot.skills) === true ? snapshot.skills : [];
			return { ...snapshot, skills: skills.filter((skill) => gate.has(skill?.name)) };
		},
		async get(skillName, options = {}) {
			const gate = gateSetForScope(options?.scope);
			if (gate !== null && gate.has(skillName) !== true) return undefined;
			return originals.get.call(this, skillName, options);
		}
	};
	registry.list = wrappers.list;
	registry.snapshot = wrappers.snapshot;
	registry.get = wrappers.get;
	registry[WRAP_KEY] = { originals, wrappers };
	logger.info("skill-gate: per-session skill visibility control is active");
	return { originals, restore: () => restoreWrapped(registry, { originals, wrappers }) };
}

/**
 * Remove exactly this generation's own-property wrappers, restoring the
 * prototype methods. Someone else's later wrapper is left untouched.
 * @param {object} registry - the wrapped service instance.
 * @param {{ originals: object, wrappers: object }} handle - the generation to remove.
 */
function restoreWrapped(registry, handle) {
	for (const key of ["list", "snapshot", "get"]) {
		if (registry[key] === handle.wrappers[key]) delete registry[key];
	}
	if (registry[WRAP_KEY] === handle) delete registry[WRAP_KEY];
}

/** Dispose a session observation or preset lease without throwing. */
async function disposeHeld(held) {
	try {
		const asyncDispose = held?.[Symbol.asyncDispose];
		if (typeof asyncDispose === "function") return await asyncDispose.call(held);
		const syncDispose = held?.[Symbol.dispose];
		if (typeof syncDispose === "function") syncDispose.call(held);
	} catch {}
}

/**
 * Host plugin body: load the gate state, wrap the registry, then register the
 * two Fetch routes the composer control calls.
 * @param {object} ctx - plugin context.
 */
function apply(ctx) {
	// ---------- persisted gate state ----------
	let state = { default: null, sessions: {} };
	let loaded = false;
	/**
	 * Re-read the persisted document. Damaged or missing files fall back to the
	 * unrestricted default rather than failing the plugin.
	 */
	const reload = async () => {
		loaded = true;
		try {
			state = sanitizeState(JSON.parse(await readFile(statePath(), "utf8")));
		} catch {
			state = { default: null, sessions: {} };
		}
		return state;
	};
	const loadOnce = () => loaded ? state : reload();
	/**
	 * Atomically persist one complete next state; the caller commits it to
	 * memory only after the rename succeeds, so the file and the live gate
	 * never diverge through a failed write.
	 */
	const persist = async (next) => {
		const file = statePath();
		await mkdir(dirname(file), { recursive: true });
		const temporary = `${file}.${process.pid}.tmp`;
		await writeFile(temporary, `${JSON.stringify(next, null, "\t")}\n`, "utf8");
		await rename(temporary, file);
	};
	void reload();
	// Keep the live gate aligned when the document changes outside this plugin
	// (hand edits, external tooling, or another process).
	try {
		ctx.watch(statePath(), () => {
			void reload();
		});
	} catch {}

	/** The raw selection record for one session, falling back to the profile default. */
	const enabledRecordOf = (sessionId) => Object.hasOwn(state.sessions, sessionId) ? state.sessions[sessionId] : state.default;
	/** The enabled-set for a viewing scope, or null when that view is unrestricted. */
	const gateSetForScope = (scope) => {
		if (scope === null || typeof scope !== "object") return null;
		const sessionId = scope.id;
		if (typeof sessionId !== "string" || sessionId === "") return null;
		const record = enabledRecordOf(sessionId);
		return record === null ? null : new Set(record);
	};

	// ---------- wrap the skills registry ----------
	const registry = ctx.skills;
	const wrapped = wrapRegistry(registry, gateSetForScope, ctx.logger);
	if (wrapped !== undefined) ctx.effect(() => () => wrapped.restore(), "skill-gate: skills wrapper");

	// ---------- session view for the picker ----------
	/**
	 * Borrow the default preset's standing scope so a session that does not
	 * exist yet still lists the skills its composition would mount.
	 */
	const defaultPresetScope = async () => {
		const presets = ctx.get("agentPresets");
		if (presets === undefined) return {};
		try {
			const preset = await presets.resolve();
			const lease = await presets.acquireScope(preset.id);
			return { scope: lease?.key, lease };
		} catch {
			return {};
		}
	};

	/**
	 * Resolve the directory and skills view for one session: live agents keep
	 * their ensured cwd and their own scope; cold sessions read the projected
	 * log and borrow a standing preset scope, exactly like the session skill
	 * catalog remote. A session the log does not know yet — the composer for a
	 * chat that has not sent its first message — falls back to the default
	 * directory and the default preset's scope.
	 */
	const sessionContextOf = async (sessionId) => {
		const live = sessionId === undefined ? undefined : ctx.agents.get(sessionId);
		if (live !== undefined) return { cwd: await ctx.workingDirectory.ensure(live), scope: live, live, lease: undefined };
		let cwd;
		let agentPreset;
		if (sessionId !== undefined) {
			let observation;
			try {
				observation = await ctx.sessionQuery.observeSession(sessionId);
			} catch {
				observation = undefined;
			}
			if (observation !== undefined) {
				try {
					if (observation?.projections !== undefined) {
						cwd = observation.projections.values?.workingDirectory ?? observation.header?.cwd ?? ctx.workingDirectory.defaultDirectory;
						agentPreset = observation.projections.values?.agentPreset ?? undefined;
					}
				} finally {
					await disposeHeld(observation);
				}
			}
		}
		if (cwd === undefined) cwd = ctx.workingDirectory.defaultDirectory;
		let scope;
		let lease;
		if (agentPreset !== undefined) {
			const presets = ctx.get("agentPresets");
			if (presets !== undefined) {
				try {
					lease = await presets.acquireScope(agentPreset);
					scope = lease?.key;
				} catch {
					lease = undefined;
				}
			}
		}
		if (scope === undefined) {
			const fallback = await defaultPresetScope();
			scope = fallback.scope;
			if (lease === undefined) lease = fallback.lease;
		}
		return { cwd, scope, live: undefined, lease };
	};

	/**
	 * Every model-invocable skill a session's composition can see, taken
	 * through the unwrapped registry so the picker always lists the whole
	 * universe even while a gate is active. `list()` delegates to
	 * `this.snapshot()`, which is filtered too, so the original `snapshot`
	 * must be read directly — otherwise an empty allowlist would hide the
	 * entire catalog and leave no way to re-select anything.
	 */
	const universeOf = async (sessionContext) => {
		const presets = ctx.get("agentPresets");
		const target = sessionContext.live !== undefined ? presets?.serviceFor?.(sessionContext.live, "skills") ?? registry : registry;
		const options = { cwd: sessionContext.cwd };
		if (sessionContext.scope !== undefined) options.scope = sessionContext.scope;
		const snapshotMethod = wrapped?.originals.snapshot ?? registry.snapshot;
		const snapshot = await snapshotMethod.call(target, options);
		const listed = Array.isArray(snapshot?.skills) === true ? snapshot.skills : [];
		const skills = [];
		const seen = new Set();
		for (const skill of listed) {
			if (skill === null || typeof skill !== "object") continue;
			if (typeof skill.name !== "string" || SKILL_NAME.test(skill.name) !== true) continue;
			if (skill.invocation?.modelInvocable === false) continue;
			if (seen.has(skill.name) === true) continue;
			seen.add(skill.name);
			skills.push({
				name: skill.name,
				description: typeof skill.description === "string" ? skill.description : "",
				...(typeof skill.path === "string" && skill.path !== "" ? { path: skill.path } : {}),
				...(typeof skill.source === "string" && skill.source !== "" ? { source: skill.source } : {}),
				...(typeof skill.provider === "string" && skill.provider !== "" ? { provider: skill.provider } : {})
			});
		}
		skills.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
		return skills;
	};

	// ---------- authenticated Fetch routes ----------
	const jsonResponse = (value) => Response.json(value, { headers: { "cache-control": "no-store" } });
	const jsonFailure = (code, message) => jsonResponse({ ok: false, error: { code, message } });
	const readJsonBody = async (request) => {
		try {
			const body = await request.json();
			return body !== null && typeof body === "object" && Array.isArray(body) !== true ? body : {};
		} catch {
			return {};
		}
	};
	const sessionIdOf = (body) => typeof body.sessionId === "string" && body.sessionId !== "" ? body.sessionId : undefined;

	ctx.inject(["connection"], (scope) => {
		const registerRoute = (path, handler) => {
			const dispose = scope.connection.fetch.register({ path, methods: ["POST"], requestBody: "buffered", fetch: handler });
			scope.effect(() => () => {
				void dispose();
			}, `skill-gate: route ${path}`);
		};

		registerRoute("/api/skill-gate/state", async (request) => {
			try {
				const body = await readJsonBody(request);
				await loadOnce();
				const sessionId = sessionIdOf(body);
				const sessionContext = await sessionContextOf(sessionId);
				try {
					const skills = await universeOf(sessionContext);
					const record = sessionId === undefined ? state.default : enabledRecordOf(sessionId);
					return jsonResponse({
						ok: true,
						value: {
							skills,
							gate: { enabled: record, scope: sessionId === undefined ? "default" : sessionId },
							total: skills.length
						}
					});
				} finally {
					await disposeHeld(sessionContext.lease);
				}
			} catch (error) {
				return jsonFailure("skill-gate/state-failed", String(error));
			}
		});

		registerRoute("/api/skill-gate/set", async (request) => {
			try {
				const body = await readJsonBody(request);
				await loadOnce();
				const sessionId = sessionIdOf(body);
				let enabled;
				if (body.enabled === null) enabled = null;
				else {
					const names = sanitizeEnabled(body.enabled);
					if (names === undefined) return jsonFailure("skill-gate/bad-request", "enabled must be null or an array of kebab-case skill names");
					enabled = names;
				}
				let next;
				if (sessionId === undefined) next = { ...state, default: enabled };
				else {
					const sessions = { ...state.sessions };
					if (enabled === null) delete sessions[sessionId];
					else sessions[sessionId] = enabled;
					next = { ...state, sessions };
				}
				pruneSessions(next);
				try {
					await persist(next);
				} catch (error) {
					return jsonFailure("skill-gate/persist-failed", String(error));
				}
				state = next;
				return jsonResponse({ ok: true, value: { enabled, scope: sessionId === undefined ? "default" : sessionId } });
			} catch (error) {
				return jsonFailure("skill-gate/set-failed", String(error));
			}
		});
	});
}

export { apply, inject, name };
