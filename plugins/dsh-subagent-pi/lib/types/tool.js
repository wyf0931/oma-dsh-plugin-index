/**
 * Model-facing delegation tool for the Pi subagent provider. One call starts
 * one Pi session in its own process; the same call can continue an earlier
 * session by its id, so follow-up work reuses Pi's context instead of paying
 * for it again.
 *
 * @module dsh-subagent-pi/tool
 */
import { randomUUID } from 'node:crypto';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { withControl } from "./control.js";
export const name = 'tool-subagent-pi';
export const inject = ['tools', 'subagents'];
const DEFAULT_TOOL_NAME = 'delegate_pi';
const DEFAULT_PROVIDER_NAME = 'pi';
export const Config = z.object({
    providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
    toolName: z.string().min(1).default(DEFAULT_TOOL_NAME),
});
/**
 * Register the delegation tool.
 * @param ctx - shared tool registry and managed subagent service.
 * @param config - the target provider and model-facing tool name.
 */
export function apply(ctx, config) {
    const providerName = config.providerName ?? DEFAULT_PROVIDER_NAME;
    const toolName = config.toolName ?? DEFAULT_TOOL_NAME;
    const provider = ctx.subagents.getProvider(providerName);
    if (provider !== undefined && (provider.prepareContinuable !== undefined || provider.inheritsParentContext)) {
        throw new Error(`${toolName} requires a one-shot provider with independent conversation context`);
    }
    ctx.tools.register(defineTool({
        name: toolName,
        description: 'Delegate a self-contained task to the local Pi coding agent. '
            + 'Pi runs as a separate `pi` process in its own session, with its own model, tools, skills and extensions. '
            + 'The child does not see this conversation. This tool returns a child id and a piSessionId immediately; '
            + 'a later completion notice carries Pi\'s final answer. '
            + 'To continue the same Pi conversation later, pass that piSessionId as `session` with the same `cwd`; '
            + 'Pi then reuses the whole session, so follow-up work costs no re-explanation. '
            + 'A run stopped by its deadline or ending with an error keeps its Pi session: '
            + 'call again with that piSessionId to inspect what it did and continue. '
            + 'Start independent tasks together and continue useful work while they run.',
        parameters: {
            description: {
                type: 'string',
                required: true,
                description: 'A short description of the delegated task, for display.',
            },
            prompt: {
                type: 'string',
                required: true,
                description: 'The complete, self-contained task. Include all context Pi needs.',
            },
            cwd: {
                type: 'string',
                description: 'Initial child working directory. Relative paths use your current directory; omission inherits it.',
            },
            session: {
                type: 'string',
                description: 'A piSessionId returned by an earlier call, to continue that Pi conversation. Requires the same cwd.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    kind: { type: 'string', required: true, const: 'activation' },
                    subagentId: { type: 'string', required: true },
                    piSessionId: { type: 'string', required: true },
                    resumed: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `started pi subagent ${value.subagentId} (pi session ${value.piSessionId}${value.resumed ? ', resumed' : ''})`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const parent = exec.agent;
            if (parent === undefined)
                throw new Error(`${toolName} requires a calling agent`);
            const sessionId = args.session ?? randomUUID();
            const activation = await ctx.subagents.startActivation({
                provider: providerName,
                label: args.description,
                parent,
                prompt: withControl([{ type: 'text', text: args.prompt }], {
                    sessionId,
                    resume: args.session !== undefined,
                }),
                ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
                signal: exec.signal,
                delivery: 'parent',
            });
            return {
                kind: 'activation',
                subagentId: activation.childId,
                piSessionId: sessionId,
                resumed: args.session !== undefined,
            };
        },
        presentCall: args => ({ card: 'generic', title: args.description, rawInput: args }),
    }));
}
//# sourceMappingURL=tool.js.map