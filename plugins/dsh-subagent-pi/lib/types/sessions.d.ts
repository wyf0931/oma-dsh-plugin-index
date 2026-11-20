/**
 * Pi session history for the configuration page. Reads Pi's own JSONL session
 * files (read-only) and joins them with the ids this plugin recorded, so the
 * table shows the delegations made here first. No Pi process is started.
 *
 * @module dsh-subagent-pi/sessions
 */
/** One row of the history table. */
export interface SessionSummary {
    readonly id: string;
    readonly title: string;
    readonly cwd: string;
    readonly model: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly turns: number;
    readonly userMessages: number;
    readonly toolCalls: number;
    readonly input: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
    readonly output: number;
    readonly total: number;
    readonly cost: number;
    /** True when this plugin started or resumed the session. */
    readonly delegated: boolean;
}
/** Request body of the history route. */
export interface HistoryRequest {
    readonly scope?: 'delegated' | 'all';
    readonly limit?: number;
}
/** Resolve Pi's config home exactly as the provider does. */
export declare function resolveAgentDir(configured?: string): string;
/** The plugin's own state directory inside the DSH home. */
export declare function stateDir(): string;
/** Where the plugin records the session ids it delegated. */
export declare function registryFile(): string;
/** Record one delegation so the history can tell it apart from manual Pi runs. */
export declare function recordSession(id: string, cwd: string): Promise<void>;
/** Read the recorded delegations; an unreadable registry is empty. */
export declare function readRegistry(): Promise<Record<string, {
    cwd: string;
    firstSeenAt: string;
    lastSeenAt: string;
}>>;
/** Mutable accumulator while one file is read. */
interface Accumulator {
    header?: {
        id: string;
        cwd: string;
        timestamp: string;
    };
    name?: string;
    model?: string;
    firstUserText?: string;
    lastTimestamp?: string;
    turns: number;
    userMessages: number;
    toolCalls: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
    cost: number;
}
/**
 * Fold one session entry into the accumulator. Unknown entry types are ignored,
 * so a newer Pi format never breaks the table.
 * @param entry - one parsed JSONL record.
 * @param into - the accumulator for the file.
 */
export declare function foldEntry(entry: unknown, into: Accumulator): void;
/** Parse a whole session file held in memory; exported for tests. */
export declare function parseSession(text: string, fallbackId?: string): Omit<SessionSummary, 'delegated'>;
/**
 * List Pi session history.
 * @param sessionsRoot - Pi's session directory (or the configured `sessionDir`).
 * @param request - scope (`delegated` joins the recorded ids; `all` scans recent files) and row limit.
 * @returns rows newest first.
 */
export declare function listSessions(sessionsRoot: string, request?: HistoryRequest): Promise<SessionSummary[]>;
/** Total number of Pi session files, for the empty state. */
export declare function countSessionFiles(sessionsRoot: string): Promise<number>;
export {};
