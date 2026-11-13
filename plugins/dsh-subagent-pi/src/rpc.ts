/**
 * Minimal Pi RPC transport: spawn the local `pi --mode rpc` child, frame its
 * strict JSONL stdout, answer the extension dialogs a human would answer, and
 * own orderly shutdown. No Pi SDK is imported and no Pi code runs in this
 * process; the child is the isolation boundary.
 *
 * @module dsh-subagent-pi/rpc
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { StringDecoder } from 'node:string_decoder'
import { PiSubagentFailure, toError } from './failures.ts'

/** One parsed RPC record. Only `type` is guaranteed by the protocol. */
export interface PiRecord {
  readonly type: string
  readonly [key: string]: unknown
}

/** Options for starting one Pi RPC child. */
export interface PiProcessOptions {
  /** Executable name or absolute path, from configuration. */
  readonly command: string
  /** Arguments, including `--mode rpc` and the session selector. */
  readonly argv: readonly string[]
  /** Working directory the delegated task runs in. */
  readonly cwd: string
  /** Environment for the child; the host's environment by default. */
  readonly env?: NodeJS.ProcessEnv
  /** Receives each parsed record, in order. */
  readonly onRecord: (record: PiRecord) => void
  /** Receives the first transport/protocol failure; the child is then unusable. */
  readonly onFatal?: (error: Error) => void
}

/**
 * Split a UTF-8 buffer into complete JSONL records. Only LF terminates a
 * record, because U+2028 and U+2029 are legal inside JSON strings and Node's
 * readline would split on them.
 * @param buffer - text read so far.
 * @returns complete lines and the incomplete remainder.
 */
export function drainLines(buffer: string): { records: string[]; rest: string } {
  const records: string[] = []
  let start = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== '\n') continue
    let line = buffer.slice(start, index)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    start = index + 1
    if (line.trim().length > 0) records.push(line)
  }
  return { records, rest: buffer.slice(start) }
}

/** Live child process plus framing state. */
export class PiProcess {
  private buffer = ''
  private readonly decoder = new StringDecoder('utf8')
  private stderrText = ''
  private fatal: Error | undefined
  private readonly exit: Promise<number | null>

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly options: PiProcessOptions,
  ) {
    child.stdout.on('data', chunk => this.read(chunk))
    child.stderr.on('data', chunk => { this.stderrText = (this.stderrText + chunk.toString('utf8')).slice(-8192) })
    child.stdin.on('error', () => { /* The child may exit between a check and a write. */ })
    child.on('error', error => this.fail(error))
    this.exit = new Promise(resolve => child.once('close', code => resolve(code)))
  }

  /**
   * Start the child and resolve after it has spawned (not after it is ready —
   * RPC accepts commands immediately).
   * @throws PiSubagentFailure with stage `spawn` when the executable is missing.
   */
  static async start(options: PiProcessOptions): Promise<PiProcess> {
    const child = spawn(options.command, [...options.argv], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    try {
      await once(child, 'spawn')
    } catch (error: unknown) {
      child.kill('SIGKILL')
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code === 'ENOENT') throw new PiSubagentFailure('spawn', 'not-found', { cause: toError(error) })
      throw new PiSubagentFailure('spawn', 'unknown', { cause: toError(error) })
    }
    return new PiProcess(child, options)
  }

  /** Whether the transport or the child already failed. */
  get failure(): Error | undefined {
    return this.fatal
  }

  /** Write one command record. Writes after failure are dropped. */
  send(command: Record<string, unknown>): void {
    if (this.fatal !== undefined || this.child.stdin.destroyed) return
    try {
      this.child.stdin.write(`${JSON.stringify(command)}\n`)
    } catch (error: unknown) {
      this.fail(toError(error))
    }
  }

  /** Close stdin, which asks Pi for an orderly shutdown. */
  endInput(): void {
    try {
      this.child.stdin.end()
    } catch { /* Already closed. */ }
  }

  /** Wait for the child to exit, at most `graceMs`; then signal it. */
  async shutdown(graceMs = 2_000): Promise<void> {
    this.endInput()
    if (await within(this.exit, graceMs)) return
    this.child.kill('SIGTERM')
    if (await within(this.exit, graceMs)) return
    this.child.kill('SIGKILL')
    await this.exit.catch(() => null)
  }

  /** Resolve with the exit code once the child exits. */
  whenExited(): Promise<number | null> {
    return this.exit
  }

  /** Terminate the child now. */
  kill(): void {
    this.child.kill('SIGKILL')
  }

  /** The tail of the child's stderr, for local diagnostics only. */
  stderr(): string {
    return this.stderrText
  }

  private read(chunk: Buffer): void {
    if (this.fatal !== undefined) return
    this.buffer += this.decoder.write(chunk)
    const { records, rest } = drainLines(this.buffer)
    this.buffer = rest
    for (const line of records) {
      let record: PiRecord
      try {
        const parsed: unknown = JSON.parse(line)
        if (parsed === null || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
          throw new Error('subagent-pi: RPC record without a type')
        }
        record = parsed as PiRecord
      } catch (error: unknown) {
        this.fail(new PiSubagentFailure('turn', 'protocol', { cause: toError(error) }))
        return
      }
      this.options.onRecord(record)
      if (this.fatal !== undefined) return
    }
  }

  private fail(error: Error): void {
    if (this.fatal !== undefined) return
    this.fatal = error
    this.options.onFatal?.(error)
  }
}

/** Resolve true when `promise` settles within `ms`. */
async function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), ms)
  })
  const settled = promise.then(() => true, () => true)
  try {
    return await Promise.race([settled, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** True when a record is a dialog an unattended client must answer. */
export function isDialog(record: PiRecord): record is PiRecord & { id: string; method: string } {
  if (record.type !== 'extension_ui_request') return false
  const method = record.method
  return typeof record.id === 'string'
    && (method === 'select' || method === 'confirm' || method === 'input' || method === 'editor')
}
