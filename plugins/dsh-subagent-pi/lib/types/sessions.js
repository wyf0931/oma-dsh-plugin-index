/**
 * Pi session history for the configuration page. Reads Pi's own JSONL session
 * files (read-only) and joins them with the ids this plugin recorded, so the
 * table shows the delegations made here first. No Pi process is started.
 *
 * @module dsh-subagent-pi/sessions
 */
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
/** Default / maximum rows returned by the history route. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
/** Bounded cache of parsed files, keyed by path and mtime. */
const cache = new Map();
const CACHE_LIMIT = 400;
/** Resolve Pi's config home exactly as the provider does. */
export function resolveAgentDir(configured) {
    if (configured !== undefined && configured !== '')
        return configured;
    const pinned = process.env.PI_CODING_AGENT_DIR;
    if (pinned !== undefined && pinned !== '')
        return pinned;
    return join(homedir(), '.pi', 'agent');
}
/** The plugin's own state directory inside the DSH home. */
export function stateDir() {
    const home = process.env.DSH_HOME;
    return join(home === undefined || home === '' ? join(homedir(), '.dsh') : home, 'dsh-subagent-pi');
}
/** Where the plugin records the session ids it delegated. */
export function registryFile() {
    return join(stateDir(), 'sessions.json');
}
/** Record one delegation so the history can tell it apart from manual Pi runs. */
export async function recordSession(id, cwd) {
    try {
        const file = registryFile();
        let registry = {};
        try {
            const parsed = JSON.parse(await readFile(file, 'utf8'));
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                registry = parsed;
            }
        }
        catch { /* First write, or unreadable: start a fresh registry. */ }
        const now = new Date().toISOString();
        const previous = registry[id];
        registry[id] = { cwd, firstSeenAt: previous?.firstSeenAt ?? now, lastSeenAt: now };
        await mkdir(dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
        await rename(temporary, file);
    }
    catch { /* Recording is best-effort and must never fail a delegation. */ }
}
/** Read the recorded delegations; an unreadable registry is empty. */
export async function readRegistry() {
    try {
        const parsed = JSON.parse(await readFile(registryFile(), 'utf8'));
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
/** Text of one message's content blocks. */
function messageText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    let text = '';
    for (const block of content) {
        if (block !== null && typeof block === 'object' && block.type === 'text') {
            const value = block.text;
            if (typeof value === 'string')
                text += value;
        }
    }
    return text;
}
/** Collapse whitespace and cut a title to a readable length. */
function toTitle(text) {
    const flat = text.replace(/\s+/gu, ' ').trim();
    if (flat === '')
        return '';
    return flat.length <= 80 ? flat : `${flat.slice(0, 79)}…`;
}
/** Add one usage record to the accumulator. */
function addUsage(target, usage) {
    target.input += typeof usage.input === 'number' ? usage.input : 0;
    target.output += typeof usage.output === 'number' ? usage.output : 0;
    target.cacheRead += typeof usage.cacheRead === 'number' ? usage.cacheRead : 0;
    target.cacheWrite += typeof usage.cacheWrite === 'number' ? usage.cacheWrite : 0;
    target.total += typeof usage.totalTokens === 'number' ? usage.totalTokens : 0;
    target.cost += typeof usage.cost?.total === 'number' ? usage.cost.total : 0;
}
/**
 * Fold one session entry into the accumulator. Unknown entry types are ignored,
 * so a newer Pi format never breaks the table.
 * @param entry - one parsed JSONL record.
 * @param into - the accumulator for the file.
 */
export function foldEntry(entry, into) {
    if (entry === null || typeof entry !== 'object')
        return;
    const record = entry;
    if (typeof record.timestamp === 'string')
        into.lastTimestamp = record.timestamp;
    if (record.type === 'session') {
        const header = entry;
        if (typeof header.id === 'string' && typeof header.cwd === 'string' && typeof header.timestamp === 'string') {
            into.header = { id: header.id, cwd: header.cwd, timestamp: header.timestamp };
        }
        return;
    }
    if (record.type === 'session_info') {
        if (typeof record.name === 'string' && record.name.trim() !== '')
            into.name = record.name.trim();
        return;
    }
    if (record.type === 'model_change') {
        if (typeof record.provider === 'string' && typeof record.modelId === 'string') {
            into.model = `${record.provider}/${record.modelId}`;
        }
        return;
    }
    if (record.type === 'usage' || record.type === 'compaction' || record.type === 'branch_summary') {
        if (record.usage !== undefined)
            addUsage(into, record.usage);
        return;
    }
    if (record.type !== 'message' || record.message === undefined)
        return;
    const message = record.message;
    if (message.provider !== undefined && message.model !== undefined
        && typeof message.provider === 'string' && typeof message.model === 'string') {
        into.model = `${message.provider}/${message.model}`;
    }
    if (message.usage !== undefined)
        addUsage(into, message.usage);
    if (message.role === 'assistant') {
        into.turns += 1;
        return;
    }
    if (message.role === 'user') {
        into.userMessages += 1;
        if (into.firstUserText === undefined) {
            const text = toTitle(messageText(message.content));
            if (text !== '')
                into.firstUserText = text;
        }
        return;
    }
    if (message.role === 'toolResult')
        into.toolCalls += 1;
}
/** Turn one accumulated file into a summary. */
function summarize(accumulator, fallbackId) {
    const header = accumulator.header;
    const id = header?.id ?? fallbackId;
    const createdAt = header?.timestamp ?? accumulator.lastTimestamp ?? new Date(0).toISOString();
    return {
        id,
        title: accumulator.name ?? accumulator.firstUserText ?? `Pi session ${id.slice(0, 8)}`,
        cwd: header?.cwd ?? '',
        model: accumulator.model ?? '',
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
        cost: accumulator.cost,
    };
}
/** Parse a whole session file held in memory; exported for tests. */
export function parseSession(text, fallbackId = 'unknown') {
    const accumulator = {
        turns: 0, userMessages: 0, toolCalls: 0,
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0,
    };
    for (const line of text.split('\n')) {
        if (line.trim() === '')
            continue;
        let entry;
        try {
            entry = JSON.parse(line);
        }
        catch {
            continue;
        }
        foldEntry(entry, accumulator);
    }
    return summarize(accumulator, fallbackId);
}
/** Stream a JSONL file and fold each record, so large sessions stay bounded. */
async function readSessionFile(path) {
    const accumulator = {
        turns: 0, userMessages: 0, toolCalls: 0,
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0,
    };
    const fallbackId = (path.split('_').at(-1) ?? 'unknown').replace(/\.jsonl$/u, '');
    let remainder = '';
    const stream = createReadStream(path, { encoding: 'utf8' });
    for await (const chunk of stream) {
        const text = remainder + chunk;
        let start = 0;
        for (let index = 0; index < text.length; index += 1) {
            if (text[index] !== '\n')
                continue;
            const line = text.slice(start, index);
            start = index + 1;
            if (line.trim() === '')
                continue;
            try {
                foldEntry(JSON.parse(line), accumulator);
            }
            catch { /* A truncated tail is normal for an active session. */ }
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
        if (!name.endsWith('.jsonl'))
            return;
        const path = join(dir, name);
        try {
            const info = await stat(path);
            files.push({ id: name.replace(/\.jsonl$/u, '').split('_').at(-1) ?? name, path, mtimeMs: info.mtimeMs });
        }
        catch { /* The file disappeared between listing and stat. */ }
    };
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    }
    catch {
        return [];
    }
    for (const entry of entries) {
        if (entry.isFile()) {
            await add(root, entry.name);
            continue;
        }
        if (!entry.isDirectory())
            continue;
        const dir = join(root, entry.name);
        let names;
        try {
            names = await readdir(dir);
        }
        catch {
            continue;
        }
        for (const name of names)
            await add(dir, name);
    }
    return files;
}
/** Load one file through the cache. */
async function summaryOf(file) {
    const cached = cache.get(file.path);
    if (cached !== undefined && cached.mtimeMs === file.mtimeMs)
        return cached.summary;
    const summary = await readSessionFile(file.path);
    cache.set(file.path, { mtimeMs: file.mtimeMs, summary });
    if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined)
            cache.delete(oldest);
    }
    return summary;
}
/**
 * List Pi session history.
 * @param sessionsRoot - Pi's session directory (or the configured `sessionDir`).
 * @param request - scope (`delegated` joins the recorded ids; `all` scans recent files) and row limit.
 * @returns rows newest first.
 */
export async function listSessions(sessionsRoot, request = {}) {
    const limit = Math.min(Math.max(request.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const files = await indexSessions(sessionsRoot);
    if (request.scope === 'all') {
        const recent = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
        const rows = await Promise.all(recent.map(summaryOf));
        return rows.map(row => ({ ...row, delegated: false }));
    }
    const registry = await readRegistry();
    const registered = Object.keys(registry);
    if (registered.length === 0)
        return [];
    const byId = new Map(files.map(file => [file.id, file]));
    const selected = [];
    for (const id of registered) {
        const file = byId.get(id);
        if (file === undefined)
            continue;
        const summary = await summaryOf(file);
        const meta = registry[id];
        selected.push({ ...summary, delegated: true, ...(meta === undefined ? {} : { cwd: summary.cwd === '' ? meta.cwd : summary.cwd }) });
    }
    return selected
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, limit);
}
/** Total number of Pi session files, for the empty state. */
export async function countSessionFiles(sessionsRoot) {
    return (await indexSessions(sessionsRoot)).length;
}
//# sourceMappingURL=sessions.js.map