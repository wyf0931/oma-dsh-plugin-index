---
description: "把本机 Pi coding agent 接成 DeepSeek Harness 子代理提供方：每次委派一个隔离的 pi 子进程，会话可通过 Pi RPC 续跑。"
kind: "package-bundle"
---

# dsh-subagent-pi

English | 中文

## 它是什么

`dsh-subagent-pi` 让 DeepSeek Harness（DSH）里的智能体把任务交给**本机**的
[Pi coding agent](https://github.com/earendil-works/pi-coding-agent)。每次委派
都会启动一个**自己的 `pi --mode rpc` 子进程**，Pi 的任何代码都不进入 DSH 进程；
Pi 扩展出错、崩溃、命令挂死，都不会把 DSH 一起拖下水。

Pi CLI 仍是权威：模型、认证、技能、扩展、MCP，全都用你在终端里已经配好的那一套。
本插件不打包任何 Pi 依赖，也不复制 Pi 的安装。

| 行 | 模块 | 注册什么 |
|---|---|---|
| `subagent-pi` | `dsh-subagent-pi` | `pi` 子代理提供方（拉起 RPC 子进程） |
| `tool-subagent-pi` | `dsh-subagent-pi/tool` | 模型可见的 `delegate_pi` 工具 |

## 安装

```sh
pnpm install && pnpm build
dsh plugin --profile <profile> add /absolute/path/to/dsh-subagent-pi
```

也可以用 Plugins 页面安装该目录。若 profile 不热加载插件，重启 DSH；之后模型即可
调用 `delegate_pi`。

要求 DSH **0.2.2-rc.5** 或更高的 0.2.x 版本。

要求：`PATH` 上有 Pi CLI **1.5.x**（已按 1.5.2 验证），或用 `piPath` 指定；运行 DSH
的账号必须已经能用 Pi 的认证与模型。历史表直接读 Pi 的 session 文件，因此要使用与
provider 相同的 `agentDir` / `sessionDir`。

## 可续跑会话（核心特性）

每次结果都带一个 `piSessionId`。把它作为 `session` 传回（**cwd 必须相同**），
就能继续同一个 Pi 会话：

```jsonc
// 第一次
{ "description": "修 flaky 测试", "prompt": "复现并修复这个 flaky 测试。", "cwd": "." }
// -> { "piSessionId": "0c1f…", "subagentId": "…" }

// 之后：Pi 已有完整历史，不用重新解释
{ "description": "审查修复", "prompt": "现在审查你的改动，看边界情况。", "session": "0c1f…", "cwd": "." }
```

映射到 Pi 自己的参数：首次用 `--session-id <id>`，续跑用 `--session <id>`。会话存在
Pi 自己的位置上，所以在该目录执行 `pi --session <id>` 或 `pi --resume` 能打开同一个
对话。

## 配置

| 字段 | 默认 | 含义 |
|---|---|---|
| `providerName` | `pi` | 注册到子代理服务的名称 |
| `piPath` | `pi` | Pi 可执行文件名或绝对路径（默认走 `PATH`） |
| `agentDir` | Pi 默认 | 给子进程设置 `PI_CODING_AGENT_DIR` |
| `sessionDir` | Pi 默认 | `--session-dir`，会话存储与查找目录 |
| `approve` | `true` | 传 `--approve`：无人能回答 Pi 的项目信任对话框 |
| `model` | Pi 自身选择 | `--model`，例如 `deepseek/deepseek-flash` |
| `thinking` | Pi 自身选择 | `--thinking`：`off` … `max` |
| `excludeTools` | `[]` | `--exclude-tools`，要禁用的 Pi 工具名 |
| `timeout` | 不设时限 | 时限，支持 `1h`、`30m`、`45s` 或毫秒数 |

`model`、`thinking`、`excludeTools`、`timeout` 可在 Plugins 页面编辑，下一次委派
生效。`providerName`、`piPath`、`agentDir`、`sessionDir`、`approve` 只走 YAML，
因为它们标识提供方实例与其环境。

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

## 时限与长任务

默认**没有时限**：一次委派会一直活到 Pi 自己收敛，或父会话取消它。`timeout` 只是
保险丝：

- `30m`、`1h`、`1h30m`、`45s` 或整数毫秒；上限是 Node 定时器上限（约 24.9 天）。
- 到时限后 Pi 还有 **30 秒宽限**自然收尾，之后才被停止——刚好晚一点完成的任务不会白干。
- 被停止的运行会保留 Pi 会话：诊断里直接给出 `piSessionId`，用它作为 `session`
  再调一次 `delegate_pi` 就能继续同一个对话，父智能体可以先探查再收尾，而不是从零重来。
- 父会话取消或 DSH 关闭时，子进程的 stdin 会被关闭，Pi 会自行退出，不会遗留孤儿进程。

## 一次委派发生了什么

1. 模型调用 `delegate_pi`；工具选好 Pi 会话 id，立即返回
   `{ subagentId, piSessionId, resumed }`。
2. provider 在子 `cwd` 里启动 `pi --mode rpc`，发送一条 `prompt` 记录。
3. 从 stdout 读严格 JSONL，取最后一条非空 assistant 消息，等待 `agent_settled`。
4. 扩展对话框一律回 `cancelled`（没有人可答），关闭子进程，答案以完成通知回到父会话。

工具与 provider 之间只有一条私有通道：prompt 末尾一个保留控制块，provider 解析后
剥离，Pi 永远看不到；它只携带会话 id 和是否为续跑。

## 会话历史

Plugins 页的配置页会列出本插件发起的 Pi 会话：

| 列 | 来源 |
|---|---|
| 会话 | Pi 的 `session_info` 名称，没有则取第一条用户消息 |
| 模型 | 最后一次 model change / assistant 消息 |
| 轮次 | session 里的 assistant 消息数 |
| 输入 / 缓存输入 / 输出 / 合计 | assistant、工具上报与压缩条目的 `usage` 之和 |
| 成本 | `usage.cost.total` 之和 |
| 更新时间 | 最后一条条目的时间 |

数据直接流式读取 `<agentDir>/sessions/`（或配置的 `sessionDir`）下 Pi 自己的 JSONL 文件，不启动任何 Pi 进程。
插件把自己委派过的 session id 记在 `$DSH_HOME/dsh-subagent-pi/sessions.json`，所以默认的
**本插件委派** 视图是精确的；切到 **全部 Pi 会话** 可以浏览同一个 Pi 主目录下你自己
用 `pi` 跑出来的最近会话。

## 已知限制

- 一个子进程只跑一个提示：不支持中途 steer、不向父会话流式输出进度。
- 续跑要求相同 `cwd` 和相同 `--session-dir`，因为 Pi 按目录查找会话。
- 需要回答的 Pi 对话框会被取消；默认 `approve: true`，避免项目信任弹窗。
- 扩展参数与版本取决于本机 Pi；RPC 协议随版本演进，本插件以 Pi 1.5.x 为基线（已按 1.5.2 验证）。

## 仓库历史

本仓库曾以 `dsh-pi` 发布，内含三个包（`dsh-pi`、`dsh-subagent-pi`、
`dsh-tool-subagent-pi`）。现在是单包 `dsh-subagent-pi`，旧 GitHub 链接会自动跳转。

## 许可

[MIT](LICENSE)
