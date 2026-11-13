---
description: "Pi coding agent as a DeepSeek Harness subagent provider: one isolated local `pi` process per delegation, with resumable sessions over Pi RPC."
kind: "package-bundle"
---

# dsh-subagent-pi

English | [中文](README.zh.md)

## What it is

`dsh-subagent-pi` lets a DeepSeek Harness (DSH) agent delegate work to the local
[Pi coding agent](https://github.com/earendil-works/pi-coding-agent). Each
delegation starts **its own `pi --mode rpc` process**; no Pi code runs inside
the DSH process, so a Pi extension bug, a crash, or a hung tool cannot take DSH
down with it.

The local Pi CLI stays authoritative: its models, authentication, skills,
extensions and MCP servers are exactly the ones you already use in the terminal.
This bundle adds no Pi dependency of its own.

| Row | Module | What it registers |
|---|---|---|
| `subagent-pi` | `dsh-subagent-pi` | the `pi` subagent provider (spawns the RPC child) |
| `tool-subagent-pi` | `dsh-subagent-pi/tool` | the `delegate_pi` model tool |

## Install

```sh
pnpm install && pnpm build
dsh plugin --profile <profile> add /absolute/path/to/dsh-subagent-pi
```

Or install the directory through the Plugins page. Restart DSH if the profile
does not hot-load bundles. `delegate_pi` then appears for the model.

Requirements: the Pi CLI **1.5.x** (verified against 1.5.2) on `PATH`, or
configured through `piPath`; Pi's own authentication and models must already
work for the account running DSH. The history table reads Pi's session files,
so it needs the same `agentDir` / `sessionDir` the provider uses.

## Resumable sessions (the point)

Every result carries a `piSessionId`. Pass it back as `session` — with the same
`cwd` — to continue that Pi conversation:

```jsonc
// first delegation
{ "description": "Fix flaky test", "prompt": "Reproduce and fix the flaky test.", "cwd": "." }
// -> { "piSessionId": "0c1f…", "subagentId": "…" }

// later: Pi already has the whole history, so this costs no re-explaining
{ "description": "Review the fix", "prompt": "Now review your change for edge cases.", "session": "0c1f…", "cwd": "." }
```

The provider maps this onto Pi's own flags: `--session-id <id>` for a first
delegation and `--session <id>` for a resume. Sessions live where Pi keeps them,
so `pi --session <id>` or `pi --resume` in that directory reaches the same
conversation.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `pi` | name registered on the subagent service |
| `piPath` | `pi` | Pi executable name or absolute path (from `PATH` by default) |
| `agentDir` | Pi default | sets `PI_CODING_AGENT_DIR` for the child |
| `sessionDir` | Pi default | `--session-dir`, where sessions are stored and looked up |
| `approve` | `true` | pass `--approve`: no human can answer Pi's project-trust dialog |
| `model` | Pi selection | `--model`, e.g. `deepseek/deepseek-flash` |
| `thinking` | Pi selection | `--thinking`: `off` … `max` |
| `excludeTools` | `[]` | `--exclude-tools`, Pi tool names to disable |
| `timeout` | none | deadline such as `1h`, `30m`, `45s`, or milliseconds |

`model`, `thinking`, `excludeTools` and `timeout` are editable from the
Plugins page and apply to the next delegation. `providerName`, `piPath`,
`agentDir`, `sessionDir` and `approve` are YAML-only, because they identify the
provider instance and its environment.

```yaml
- id: subagent-pi
  config:
    providerName: pi
    piPath: /Users/me/.local/bin/pi
    model: deepseek/deepseek-flash
    thinking: medium
- id: tool-subagent-pi
  config:
    providerName: pi
    toolName: delegate_pi
```

## Deadlines and long tasks

There is **no deadline by default**: a delegation lives until Pi settles or the
parent cancels. Set `timeout` only as a safety valve:

- `30m`, `1h`, `1h30m`, `45s`, or a whole number of milliseconds; the ceiling is
  the Node timer limit (about 24.9 days).
- When the deadline passes, Pi gets a 30-second grace window to settle on its
  own; only then is it stopped, so work that finishes just late is not wasted.
- A stopped run keeps its Pi session. The diagnostic names the `piSessionId`,
  and `delegate_pi` with `session` continues the same conversation — the parent
  can inspect what Pi did and finish the work instead of starting over.
- Parent cancellation and DSH shutdown close the child's stdin, so Pi shuts down
  rather than leaking a process.

## How a delegation runs

1. The model calls `delegate_pi`; the tool picks a Pi session id and returns
   `{ subagentId, piSessionId, resumed }` immediately.
2. The provider spawns `pi --mode rpc` in the child `cwd` and sends one
   `prompt` record.
3. It reads strict JSONL from stdout, keeps the last non-empty assistant
   message, and waits for `agent_settled`.
4. Extension dialogs are answered `cancelled` (there is no human), the child is
   shut down, and the answer reaches the parent as a completion notice.

The only private channel between the tool and the provider is one reserved
control block appended to the prompt and stripped before Pi sees it; it carries
the session id and whether this is a resume.

## Session history

The configuration page lists Pi sessions started from this plugin:

| Column | Source |
|---|---|
| Session | Pi's `session_info` name, else the first user message |
| Model | the last model change / assistant message |
| Turns | assistant messages in the session |
| Input / Cached in / Output / Total | summed `usage` of assistant, tool-reported and compaction entries |
| Cost | summed `usage.cost.total` |
| Updated | the last entry's timestamp |

Rows come from Pi's own JSONL files under `<agentDir>/sessions/` (or the
configured `sessionDir`), streamed read-only; no Pi process is started. The plugin records the ids it delegated in
`$DSH_HOME/dsh-subagent-pi/sessions.json`, so the default **Delegated here**
view is exact. Switch to **All Pi sessions** to browse recent sessions started
by your own `pi` runs in the same Pi home.

## Known limits

- One prompt per child process: no mid-run steering, no streaming into the
  parent, no progress events.
- A resume needs the same `cwd` and the same `--session-dir`, because Pi looks
  sessions up per directory.
- Pi dialogs that require an answer are cancelled; enable `approve` (default)
  so project-local files are trusted without a prompt.
- Extension flags and versions are whatever the local Pi provides; RPC is
  version-specific enough that this bundle documents Pi 1.5.x as its baseline
  (verified against 1.5.2).

## Repository history

This repository was published as `dsh-pi` with three packages (`dsh-pi`,
`dsh-subagent-pi`, `dsh-tool-subagent-pi`). It is now the single package
`dsh-subagent-pi`; the old GitHub URLs redirect here.

## License

[MIT](LICENSE)
