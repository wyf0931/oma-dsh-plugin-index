/**
 * Minimal Pi RPC transport: spawn the local `pi --mode rpc` child, frame its
 * strict JSONL stdout, answer the extension dialogs a human would answer, and
 * own orderly shutdown. No Pi SDK is imported and no Pi code runs in this
 * process; the child is the isolation boundary.
 *
 * @module dsh-subagent-pi/rpc
 */
/** One parsed RPC record. Only `type` is guaranteed by the protocol. */
export interface PiRecord {
    readonly type: string;
    readonly [key: string]: unknown;
}
/** Options for starting one Pi RPC child. */
export interface PiProcessOptions {
    /** Executable name or absolute path, from configuration. */
    readonly command: string;
    /** Arguments, including `--mode rpc` and the session selector. */
    readonly argv: readonly string[];
    /** Working directory the delegated task runs in. */
    readonly cwd: string;
    /** Environment for the child; the host's environment by default. */
    readonly env?: NodeJS.ProcessEnv;
    /** Receives each parsed record, in order. */
    readonly onRecord: (record: PiRecord) => void;
    /** Receives the first transport/protocol failure; the child is then unusable. */
    readonly onFatal?: (error: Error) => void;
}
/**
 * Split a UTF-8 buffer into complete JSONL records. Only LF terminates a
 * record, because U+2028 and U+2029 are legal inside JSON strings and Node's
 * readline would split on them.
 * @param buffer - text read so far.
 * @returns complete lines and the incomplete remainder.
 */
export declare function drainLines(buffer: string): {
    records: string[];
    rest: string;
};
/** Live child process plus framing state. */
export declare class PiProcess {
    private readonly child;
    private readonly options;
    private buffer;
    private readonly decoder;
    private stderrText;
    private fatal;
    private readonly exit;
    private constructor();
    /**
     * Start the child and resolve after it has spawned (not after it is ready —
     * RPC accepts commands immediately).
     * @throws PiSubagentFailure with stage `spawn` when the executable is missing.
     */
    static start(options: PiProcessOptions): Promise<PiProcess>;
    /** Whether the transport or the child already failed. */
    get failure(): Error | undefined;
    /** Write one command record. Writes after failure are dropped. */
    send(command: Record<string, unknown>): void;
    /** Close stdin, which asks Pi for an orderly shutdown. */
    endInput(): void;
    /** Wait for the child to exit, at most `graceMs`; then signal it. */
    shutdown(graceMs?: number): Promise<void>;
    /** Resolve with the exit code once the child exits. */
    whenExited(): Promise<number | null>;
    /** Terminate the child now. */
    kill(): void;
    /** The tail of the child's stderr, for local diagnostics only. */
    stderr(): string;
    private read;
    private fail;
}
/** True when a record is a dialog an unattended client must answer. */
export declare function isDialog(record: PiRecord): record is PiRecord & {
    id: string;
    method: string;
};
