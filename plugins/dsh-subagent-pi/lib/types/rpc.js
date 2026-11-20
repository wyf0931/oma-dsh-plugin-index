/**
 * Minimal Pi RPC transport: spawn the local `pi --mode rpc` child, frame its
 * strict JSONL stdout, answer the extension dialogs a human would answer, and
 * own orderly shutdown. No Pi SDK is imported and no Pi code runs in this
 * process; the child is the isolation boundary.
 *
 * @module dsh-subagent-pi/rpc
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { PiSubagentFailure, toError } from "./failures.js";
/**
 * Split a UTF-8 buffer into complete JSONL records. Only LF terminates a
 * record, because U+2028 and U+2029 are legal inside JSON strings and Node's
 * readline would split on them.
 * @param buffer - text read so far.
 * @returns complete lines and the incomplete remainder.
 */
export function drainLines(buffer) {
    const records = [];
    let start = 0;
    for (let index = 0; index < buffer.length; index += 1) {
        if (buffer[index] !== '\n')
            continue;
        let line = buffer.slice(start, index);
        if (line.endsWith('\r'))
            line = line.slice(0, -1);
        start = index + 1;
        if (line.trim().length > 0)
            records.push(line);
    }
    return { records, rest: buffer.slice(start) };
}
/** Live child process plus framing state. */
export class PiProcess {
    child;
    options;
    buffer = '';
    decoder = new StringDecoder('utf8');
    stderrText = '';
    fatal;
    exit;
    constructor(child, options) {
        this.child = child;
        this.options = options;
        child.stdout.on('data', chunk => this.read(chunk));
        child.stderr.on('data', chunk => { this.stderrText = (this.stderrText + chunk.toString('utf8')).slice(-8192); });
        child.stdin.on('error', () => { });
        child.on('error', error => this.fail(error));
        this.exit = new Promise(resolve => child.once('close', code => resolve(code)));
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
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        try {
            await once(child, 'spawn');
        }
        catch (error) {
            child.kill('SIGKILL');
            const code = error?.code;
            if (code === 'ENOENT')
                throw new PiSubagentFailure('spawn', 'not-found', { cause: toError(error) });
            throw new PiSubagentFailure('spawn', 'unknown', { cause: toError(error) });
        }
        return new PiProcess(child, options);
    }
    /** Whether the transport or the child already failed. */
    get failure() {
        return this.fatal;
    }
    /** Write one command record. Writes after failure are dropped. */
    send(command) {
        if (this.fatal !== undefined || this.child.stdin.destroyed)
            return;
        try {
            this.child.stdin.write(`${JSON.stringify(command)}\n`);
        }
        catch (error) {
            this.fail(toError(error));
        }
    }
    /** Close stdin, which asks Pi for an orderly shutdown. */
    endInput() {
        try {
            this.child.stdin.end();
        }
        catch { /* Already closed. */ }
    }
    /** Wait for the child to exit, at most `graceMs`; then signal it. */
    async shutdown(graceMs = 2_000) {
        this.endInput();
        if (await within(this.exit, graceMs))
            return;
        this.child.kill('SIGTERM');
        if (await within(this.exit, graceMs))
            return;
        this.child.kill('SIGKILL');
        await this.exit.catch(() => null);
    }
    /** Resolve with the exit code once the child exits. */
    whenExited() {
        return this.exit;
    }
    /** Terminate the child now. */
    kill() {
        this.child.kill('SIGKILL');
    }
    /** The tail of the child's stderr, for local diagnostics only. */
    stderr() {
        return this.stderrText;
    }
    read(chunk) {
        if (this.fatal !== undefined)
            return;
        this.buffer += this.decoder.write(chunk);
        const { records, rest } = drainLines(this.buffer);
        this.buffer = rest;
        for (const line of records) {
            let record;
            try {
                const parsed = JSON.parse(line);
                if (parsed === null || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
                    throw new Error('subagent-pi: RPC record without a type');
                }
                record = parsed;
            }
            catch (error) {
                this.fail(new PiSubagentFailure('turn', 'protocol', { cause: toError(error) }));
                return;
            }
            this.options.onRecord(record);
            if (this.fatal !== undefined)
                return;
        }
    }
    fail(error) {
        if (this.fatal !== undefined)
            return;
        this.fatal = error;
        this.options.onFatal?.(error);
    }
}
/** Resolve true when `promise` settles within `ms`. */
async function within(promise, ms) {
    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve(false), ms);
    });
    const settled = promise.then(() => true, () => true);
    try {
        return await Promise.race([settled, timeout]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
/** True when a record is a dialog an unattended client must answer. */
export function isDialog(record) {
    if (record.type !== 'extension_ui_request')
        return false;
    const method = record.method;
    return typeof record.id === 'string'
        && (method === 'select' || method === 'confirm' || method === 'input' || method === 'editor');
}
//# sourceMappingURL=rpc.js.map