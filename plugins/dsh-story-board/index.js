/**
 * dsh-story-board — Host half.
 *
 * One file-backed document (products → projects → boards → stories) behind
 * three agent tools and two authenticated /api routes for the Web panel. The
 * domain lives in `store.js`; this module only wires it to Cordis.
 *
 * The deliberate split, copied from the Harness user-action guidance: the UI
 * button and the agent tool call the exact same store method, so a card the
 * model moves and a card the user drags cannot diverge. WIP limits are
 * returned as warnings instead of refusals — the board surfaces a breach
 * rather than silently blocking the drop.
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { PRIORITIES, STATUSES, StoryBoardStore } from './store.js';

/** Cordis plugin id and the loader row id in cordis.patch.yml. */
export const name = 'dsh-story-board';

/** Where the document lives; `DSH_STORY_BOARD_STORE` overrides for tests or shared stores. */
export function storeFilePath() {
	const explicit = process.env.DSH_STORY_BOARD_STORE;
	if (typeof explicit === 'string' && explicit.trim() !== '') return resolve(explicit.trim());
	const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
		? process.env.DSH_HOME
		: join(homedir(), '.dsh');
	return resolve(home, 'story-board', 'store.json');
}

/** The five status ids accepted by the tools. */
const STATUS_ENUM = STATUSES.map((status) => status.id);

/** Text shared by both tools: the hierarchy, statuses, and where data lives. */
const MODEL = `Data model (one board document):
- Product: a product or learning project (key, name, description, color, repoUrl, localPath). repoUrl is the GitHub/repository address; localPath is the absolute local project root that ties the board to the code checkout.
- Project: a time-boxed initiative under one product. A project is the container that keeps boards separate; never mix two initiatives on one board.
- Board: one iteration (or a continuous-flow board) under one project. Stories with no board live in the project backlog.
- Story: the card. key is "US-01" per project, stable forever. status is one of ${STATUS_ENUM.join(' | ')}. priority is ${PRIORITIES.join(' | ')}. estimate is story points. acceptanceCriteria is a checklist (Given/When/Then preferred).

Status meanings: backlog = 待办 (candidate pool), todo = 待开发 (committed to this board), in_progress = 开发中 (WIP 3), verify = 待验收 (WIP 5), done = 已完成 (meets DoD). WIP limits are advisory: a move succeeds and returns a wip_exceeded warning.`;

/** Query tool: read before writing so ids and existing keys are real. */
const QUERY_DESCRIPTION = `Read the user story board: products, projects, boards, stories, and the overview.

Call this before any write that needs an id, and whenever the user asks "what's on the board / what's blocked / what's in progress / which stories exist". Never guess ids or story keys.

Views:
- overview — counts, counts by status, WIP breaches, blocked stories, recent activity.
- products — products with project/board/story counts.
- projects — projects with counts; filter by productId.
- boards — boards with story counts and per-column WIP; filter by projectId.
- stories — story list; filter by projectId, boardId, status, priority, assignee, epic, query (free text); set includeDone:false to hide done.
- story — one story by id (or key like "US-03"), with its project and board.
- board — one board with all its stories and WIP counts, ready to render.

${MODEL}

Pass filters at the top level. Results are JSON; story records include asA/iWant/soThat and the acceptance-criteria checklist.`;

/** Apply tool: every mutation, one action at a time. */
const APPLY_DESCRIPTION = `Create, update, delete, move, or seed entities on the user story board.

Workflow: call story_board_query first, then one action. To import a whole story document, use story_board_import instead of many create_story calls.

Actions:
- create_product {name, key?, description?, color?, repoUrl?, localPath?} → product
- update_product {id, name?, key?, description?, color?, repoUrl?, localPath?} — repoUrl/localPath set the product's code link; pass an empty string to clear one
- delete_product {id, cascade?} — cascade:true also deletes projects/boards/stories (default true; set false to refuse when children exist)
- create_project {productId, name, key?, description?, objective?, startDate?, endDate?}
- update_project {id, ...same fields}
- delete_project {id, cascade?} — same rule as above
- create_board {projectId, name, goal?, startDate?, endDate?, wip?} — wip overrides e.g. {"in_progress":4}
- update_board {id, name?, goal?, startDate?, endDate?, status?, wip?}
- delete_board {id, moveTo?} — moveTo:"backlog" (default) keeps stories in the project backlog; "delete" removes them
- create_story {projectId, boardId?, title, asA?, iWant?, soThat?, acceptanceCriteria?, priority?, estimate?, assignee?, epic?, tags?, status?, blocked?, blockedReason?, key?}
- update_story {id, ...any story field} — changing status here is allowed
- move_story {id, status, boardId?, beforeStoryId?|afterStoryId?} — the drag-and-drop path; returns from/to and WIP warnings
- delete_story {id}
- seed_demo {} — creates the nine-story 滴滴赶车 demo product/project/board (no-op if it already exists)
- reset_store {seedDemo?} — DESTRUCTIVE: clears products/projects/boards/stories/activity. Pass seedDemo:false to stay empty; defaults to reseeding the demo. Only when the user explicitly asks to start over.

Story rules:
- title is required; use a verb phrase ("预估到达时间"), not a ticket number.
- asA/iWant/soThat are the Connextra sentence; acceptanceCriteria is an array of strings or {text,done} objects. Write observable, testable criteria.
- A story created with a boardId defaults to status "todo"; without one it defaults to "backlog".
- Story keys auto-increment per project (US-01, US-02...). Pass key only to preserve a document's numbering.
- Prefer moving existing stories over creating duplicates. Call story_board_query first.

${MODEL}

Returns {ok, value, warnings}. A wip_exceeded warning means the move succeeded but the column is over its limit — report it, do not retry.`;

/** Import tool: the bridge from a crafted Markdown document to a live board. */
const IMPORT_DESCRIPTION = `Import a whole user-story document into a board in one call. This is the intended finish line for the user-story-crafter skill: write the document, then import it.

Inputs (at least one of stories / markdown / markdownPath):
- stories: array of story objects. Fields: key?, title, asA?, iWant?, soThat?, acceptanceCriteria? (array), priority?, estimate?, assignee?, epic?, tags?, status?, blocked?, blockedReason?.
- markdown: the full Markdown text (the template's "**US-01：标题**" + Connextra + "AC" bullets are recognized).
- markdownPath: a workspace-relative or absolute path to that Markdown file; this tool reads it.

Target (the hierarchy is created on demand when names are given):
- productId | productKey | productName
- projectId | projectKey | projectName
- boardId | boardName (a board is created only when boardName is given; otherwise stories go to the project backlog)

Behavior:
- Idempotent: an existing story in the same project with the same key or the same title is updated, not duplicated. Re-import after refining the document is safe.
- defaultStatus applies to new stories; it defaults to "todo" when a board is targeted and "backlog" otherwise.
- Returns created/updated counts, the resolved product/project/board, the story list, and WIP warnings.

Prefer structured stories when you already have them in context; use markdownPath when the document was just written to disk.`;

/** JSON Schema for the read tool. */
const QUERY_PARAMETERS = {
	type: 'object',
	properties: {
		view: {
			type: 'string',
			enum: ['overview', 'products', 'projects', 'boards', 'stories', 'story', 'board'],
			description: 'Which slice to read.'
		},
		productId: { type: 'string', description: 'Filter projects/stories by product id.' },
		projectId: { type: 'string', description: 'Filter boards/stories by project id.' },
		boardId: { type: 'string', description: 'Filter stories by board id, or select the board for view "board".' },
		id: { type: 'string', description: 'Story id for view "story".' },
		key: { type: 'string', description: 'Story key like "US-03" for view "story".' },
		status: { type: 'string', enum: STATUS_ENUM, description: 'Filter stories by status.' },
		priority: { type: 'string', enum: [...PRIORITIES], description: 'Filter stories by priority.' },
		assignee: { type: 'string', description: 'Filter stories by assignee (exact match).' },
		epic: { type: 'string', description: 'Filter stories by epic (exact match).' },
		query: { type: 'string', description: 'Free-text filter over key, title, Connextra text, tags, epic.' },
		includeDone: { type: 'boolean', description: 'Set false to hide done stories. Defaults to true.' }
	},
	required: ['view']
};

/** JSON Schema for the write tool. */
const APPLY_PARAMETERS = {
	type: 'object',
	properties: {
		action: {
			type: 'string',
			enum: [
				'create_product', 'update_product', 'delete_product',
				'create_project', 'update_project', 'delete_project',
				'create_board', 'update_board', 'delete_board',
				'create_story', 'update_story', 'move_story', 'delete_story',
				'seed_demo', 'reset_store'
			],
			description: 'The single mutation to apply.'
		},
		id: { type: 'string', description: 'Target entity id for update/delete/move.' },
		productId: { type: 'string' },
		projectId: { type: 'string' },
		boardId: { type: 'string', description: 'Target board; null moves a story to the project backlog.' },
		name: { type: 'string' },
		key: { type: 'string', description: 'Human key (product/project) or story key such as US-07.' },
		description: { type: 'string' },
		color: { type: 'string', enum: ['blue', 'green', 'amber', 'red', 'slate'] },
		objective: { type: 'string', description: 'The one-sentence goal of a project.' },
		goal: { type: 'string', description: 'The one-sentence goal of an iteration board.' },
		startDate: { type: 'string', description: 'YYYY-MM-DD.' },
		endDate: { type: 'string', description: 'YYYY-MM-DD.' },
		wip: { type: 'object', description: 'Board WIP overrides, e.g. {"in_progress":4,"verify":6}.', additionalProperties: { type: ['number', 'null'] } },
		title: { type: 'string', description: 'Story title (verb phrase).' },
		asA: { type: 'string', description: 'Connextra role: "作为一个<角色>".' },
		iWant: { type: 'string', description: 'Connextra want: "我想要<功能>".' },
		soThat: { type: 'string', description: 'Connextra value: "以便于<价值>".' },
		acceptanceCriteria: {
			type: 'array',
			items: { type: ['string', 'object'] },
			description: 'Acceptance criteria; strings or {text,done} objects.'
		},
		priority: { type: 'string', enum: [...PRIORITIES] },
		estimate: { type: 'number', description: 'Story points.' },
		assignee: { type: 'string' },
		epic: { type: 'string' },
		tags: { type: 'array', items: { type: 'string' } },
		status: { type: 'string', enum: STATUS_ENUM },
		beforeStoryId: { type: 'string', description: 'For move_story: insert before this story in the target column.' },
		afterStoryId: { type: 'string', description: 'For move_story: insert after this story in the target column.' },
		blocked: { type: 'boolean' },
		blockedReason: { type: 'string' },
		cascade: { type: 'boolean', description: 'For deletes: also remove children. Defaults to true.' },
		moveTo: { type: 'string', enum: ['backlog', 'delete'], description: 'For delete_board: what to do with its stories.' },
		force: { type: 'boolean', description: 'For seed_demo: create another demo even when one exists.' },
		story: { type: 'object', description: 'Alternative bag for create_story fields.' },
		product: { type: 'object', description: 'Alternative bag for product fields.' },
		project: { type: 'object', description: 'Alternative bag for project fields.' },
		board: { type: 'object', description: 'Alternative bag for board fields.' },
		patch: { type: 'object', description: 'Alternative bag for update_* fields.' },
		payload: { type: 'object', description: 'Alternative bag; merged over the flat fields.' }
	},
	required: ['action']
};

/** JSON Schema for the import tool. */
const IMPORT_PARAMETERS = {
	type: 'object',
	properties: {
		productId: { type: 'string' },
		productKey: { type: 'string' },
		productName: { type: 'string', description: 'Creates the product when it does not exist.' },
		projectId: { type: 'string' },
		projectKey: { type: 'string' },
		projectName: { type: 'string', description: 'Creates the project under the resolved product when it does not exist.' },
		boardId: { type: 'string' },
		boardName: { type: 'string', description: 'Finds or creates this board in the project.' },
		boardGoal: { type: 'string' },
		startDate: { type: 'string' },
		endDate: { type: 'string' },
		defaultStatus: { type: 'string', enum: STATUS_ENUM },
		stories: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					key: { type: 'string' },
					title: { type: 'string' },
					asA: { type: 'string' },
					iWant: { type: 'string' },
					soThat: { type: 'string' },
					acceptanceCriteria: { type: 'array', items: { type: ['string', 'object'] } },
					priority: { type: 'string', enum: [...PRIORITIES] },
					estimate: { type: 'number' },
					assignee: { type: 'string' },
					epic: { type: 'string' },
					tags: { type: 'array', items: { type: 'string' } },
					status: { type: 'string', enum: STATUS_ENUM },
					blocked: { type: 'boolean' },
					blockedReason: { type: 'string' }
				},
				required: ['title']
			}
		},
		markdown: { type: 'string', description: 'Full Markdown document to parse.' },
		markdownPath: { type: 'string', description: 'Path to a Markdown document (relative to the session workspace or absolute).' }
	}
};

/** One JSON tool result for the model. */
const toolOutput = {
	schema: { type: 'object', additionalProperties: true },
	render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
};

/** Canonical failure object; never throws out of a tool. */
function failureOf(error) {
	return {
		ok: false,
		error: {
			code: error?.code ?? 'story_board_failed',
			message: error?.message ?? String(error)
		}
	};
}

/** Merge the optional `payload` bag over the flat arguments. */
function inputOf(args) {
	if (args === null || typeof args !== 'object') return {};
	const { payload, ...rest } = args;
	return payload !== null && typeof payload === 'object' && Array.isArray(payload) !== true
		? { ...rest, ...payload }
		: rest;
}

/** The session workspace, for resolving a relative markdownPath. */
function cwdOf(ctx, exec) {
	try {
		const agentId = exec?.agent?.id;
		if (typeof agentId === 'string' && agentId !== '') {
			const session = ctx.get('sessions')?.get?.(agentId);
			const cwd = session?.header?.cwd;
			if (typeof cwd === 'string' && cwd !== '') return cwd;
		}
	} catch {
		// The sessions service is optional in exotic scopes.
	}
	try {
		const cwd = ctx.get('workingDirectory')?.defaultDirectory;
		if (typeof cwd === 'string' && cwd !== '') return cwd;
	} catch {
		// Fall through to the process directory.
	}
	return process.cwd();
}

/** Read an import document through the fs service so the session sandbox is respected. */
async function readDocument(ctx, exec, pathLike) {
	const cwd = cwdOf(ctx, exec);
	const absolute = isAbsolute(pathLike) ? pathLike : resolve(cwd, pathLike);
	const fsService = ctx.get('fs');
	if (fsService !== undefined && typeof fsService.resolve === 'function' && typeof fsService.readText === 'function') {
		const target = await fsService.resolve(absolute, { cwd, signal: exec?.signal });
		return await fsService.readText(target, exec?.signal);
	}
	return await readFile(absolute, 'utf8');
}

/** Build the three tool definitions over one store. */
function toolsOf(ctx, store) {
	return [
		{
			name: 'story_board_query',
			description: QUERY_DESCRIPTION,
			parameters: QUERY_PARAMETERS,
			output: toolOutput,
			timeoutMs: 15_000,
			isConcurrencySafe: () => true,
			async execute(args) {
				try {
					const input = inputOf(args);
					const value = await store.query(String(input.view ?? ''), input);
					return { ok: true, ...value };
				} catch (error) {
					return failureOf(error);
				}
			}
		},
		{
			name: 'story_board_apply',
			description: APPLY_DESCRIPTION,
			parameters: APPLY_PARAMETERS,
			output: toolOutput,
			timeoutMs: 15_000,
			isConcurrencySafe: () => false,
			async execute(args) {
				try {
					const input = inputOf(args);
					const action = String(input.action ?? '');
					delete input.action;
					const result = await store.command(action, input);
					if (result.ok !== true) return result;
					return { ok: true, value: result.value, warnings: result.warnings ?? [] };
				} catch (error) {
					return failureOf(error);
				}
			}
		},
		{
			name: 'story_board_import',
			description: IMPORT_DESCRIPTION,
			parameters: IMPORT_PARAMETERS,
			output: toolOutput,
			timeoutMs: 30_000,
			isConcurrencySafe: () => false,
			async execute(args, exec) {
				try {
					const input = inputOf(args);
					const needsMarkdown = (typeof input.markdown !== 'string' || input.markdown.trim() === '')
						&& Array.isArray(input.stories) !== true;
					if (needsMarkdown === true) {
						if (typeof input.markdownPath !== 'string' || input.markdownPath.trim() === '') {
							return {
								ok: false,
								error: { code: 'missing_input', message: 'Provide stories[], markdown, or markdownPath.' }
							};
						}
						input.markdown = await readDocument(ctx, exec, input.markdownPath.trim());
					}
					const result = await store.command('import_stories', input);
					if (result.ok !== true) return result;
					return { ok: true, value: result.value, warnings: result.warnings ?? [] };
				} catch (error) {
					return failureOf(error);
				}
			}
		}
	];
}

/**
 * The harness's directory-picker seam, resolved to its native capability.
 * The product form delegates folder picking to the host OS chooser instead of
 * shipping a file browser; only a `native` seam can open that chooser.
 */
export function nativePickerOf(ctx) {
	try {
		const seam = ctx.get('directoryPicker');
		const capability = typeof seam?.capability === 'function' ? seam.capability() : undefined;
		if (capability?.kind === 'native' && typeof capability.pick === 'function') return capability;
	} catch {
		// The seam is optional: a host without a picker simply cannot pick.
	}
	return undefined;
}

/** JSON response helper for the panel's routes. */
function jsonResponse(value) {
	return Response.json(value, { headers: { 'cache-control': 'no-store' } });
}

/** Host plugin body. */
export function apply(ctx) {
	const file = storeFilePath();
	const store = new StoryBoardStore({ file });
	ctx.logger.info('dsh-story-board store: %s', file);

	// Agent tools. Keep the disposer owned by our own effect so HMR and unload
	// both remove them.
	ctx.inject(['tools'], (scope) => {
		const disposers = toolsOf(scope, store).map((definition) => scope.tools.register(definition));
		scope.effect(() => () => {
			for (const dispose of disposers) dispose();
		}, 'dsh-story-board: tools');
	});

	// Panel data routes on the authenticated connection channel, mirroring the
	// channel skill-gate uses. The UI and the tools share `store`.
	ctx.inject(['connection'], (scope) => {
		const register = (route, handler) => {
			const dispose = scope.connection.fetch.register({
				path: route,
				methods: ['POST'],
				requestBody: 'buffered',
				fetch: handler
			});
			scope.effect(() => () => {
				void dispose();
			}, `dsh-story-board: route ${route}`);
		};

		const readBody = async (request) => {
			try {
				const body = await request.json();
				return body !== null && typeof body === 'object' && Array.isArray(body) !== true ? body : {};
			} catch {
				return {};
			}
		};

		register('/api/story-board/state', async () => {
			try {
				return jsonResponse({ ok: true, value: await store.snapshot() });
			} catch (error) {
				return jsonResponse(failureOf(error));
			}
		});

		register('/api/story-board/pick-directory', async (request) => {
			try {
				const picker = nativePickerOf(ctx);
				if (picker === undefined) {
					return jsonResponse({
						ok: false,
						error: {
							code: 'native_picker_unavailable',
							message: '当前环境没有系统目录选择器，请直接输入本地路径'
						}
					});
				}
				const path = await picker.pick(request.signal);
				return jsonResponse({ ok: true, value: { path: typeof path === 'string' && path !== '' ? path : null } });
			} catch (error) {
				return jsonResponse(failureOf(error));
			}
		});

		register('/api/story-board/command', async (request) => {
			try {
				const body = await readBody(request);
				const action = typeof body.action === 'string' ? body.action : '';
				if (action === '') {
					return jsonResponse({ ok: false, error: { code: 'bad_request', message: 'action is required' } });
				}
				const result = await store.command(action, body);
				if (result.ok !== true) return jsonResponse(result);
				return jsonResponse({ ok: true, value: result.value, warnings: result.warnings ?? [] });
			} catch (error) {
				return jsonResponse(failureOf(error));
			}
		});
	});
}
