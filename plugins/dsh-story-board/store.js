/**
 * dsh-story-board — domain layer.
 *
 * One plain-JSON document holds every product, project, board, story and the
 * recent activity feed. This module owns the document shape, every mutation
 * (shared by the HTTP routes and the agent tools), the WIP rules, and the
 * Markdown importer. It has no dependency on Cordis or React so the whole
 * domain can be tested with `node --test`.
 *
 * Board model (deliberately small):
 *
 *   Product (a thing being built)
 *     └── Project (a time-boxed initiative; the container that isolates boards)
 *           └── Board (one iteration or a continuous-flow board)
 *                 └── Story (the card: Connextra text + acceptance criteria)
 *
 * A story with no board is in the project's backlog pool. The five statuses
 * match the reference board in the team's own notes: 待办 / 待开发 / 开发中 /
 * 待验收 / 已完成. WIP limits are advisory and surfaced, never a hard block —
 * a board that silently refuses a drop teaches people to work around it.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** The five fixed workflow states, in board order. */
export const STATUSES = Object.freeze([
  { id: 'backlog', label: '待办', labelEn: 'Backlog', wip: null, tone: 'neutral' },
  { id: 'todo', label: '待开发', labelEn: 'To do', wip: null, tone: 'link' },
  { id: 'in_progress', label: '开发中', labelEn: 'In progress', wip: 3, tone: 'business' },
  { id: 'verify', label: '待验收', labelEn: 'To verify', wip: 5, tone: 'warn' },
  { id: 'done', label: '已完成', labelEn: 'Done', wip: null, tone: 'success' }
]);

export const STATUS_IDS = Object.freeze(STATUSES.map((status) => status.id));
export const STATUS_BY_ID = Object.freeze(Object.fromEntries(STATUSES.map((status) => [status.id, status])));
export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
export const PRIORITY_RANK = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });
export const PRODUCT_COLORS = Object.freeze(['blue', 'green', 'amber', 'red', 'slate']);

/** Schema version of the persisted document. */
export const SCHEMA_VERSION = 1;

/** Cap on the activity feed kept in the document. */
const MAX_ACTIVITY = 80;

/** A bad caller payload: reported as `{ ok: false, error }` instead of thrown out of a route. */
export class BadInput extends Error {
	constructor(message, code = 'bad_input') {
		super(message);
		this.name = 'BadInput';
		this.code = code;
	}
}

/** True for a non-null, non-array object. */
const isObject = (value) => value !== null && typeof value === 'object' && Array.isArray(value) !== true;

/** A fresh identifier with a readable prefix: `us_9f2c1a4b7d`. */
export function newId(prefix) {
	return `${prefix}_${randomBytes(5).toString('hex')}`;
}

/** Trim and hard-limit a string; anything else becomes the empty string. */
export function textOf(value, max = 400) {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Read a required non-empty string or throw a caller-facing error. */
function requireText(value, label, max = 400) {
	const clean = textOf(value, max);
	if (clean === '') throw new BadInput(`${label}不能为空`);
	return clean;
}

/** Join a tag list from an array or a comma/、 separated string. */
export function normalizeTags(value) {
	const raw = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.replace(/[#＃]/g, '').split(/[,，、;；]/)
			: [];
	const seen = new Set();
	const tags = [];
	for (const candidate of raw) {
		const tag = textOf(candidate, 24);
		if (tag === '' || seen.has(tag) === true) continue;
		seen.add(tag);
		tags.push(tag);
		if (tags.length >= 8) break;
	}
	return tags;
}

/** Normalize a repository address: `owner/repo`, `git@host:owner/repo`, ssh, https. */
export function normalizeRepoUrl(value) {
	let clean = textOf(value, 300).replace(/\.git\/?$/i, '').replace(/\/+$/, '');
	if (clean === '') return '';
	const scp = /^git@([^:/\s]+):(.+)$/.exec(clean);
	if (scp !== null) clean = `https://${scp[1]}/${scp[2]}`;
	const ssh = /^ssh:\/\/git@([^/]+)\/(.+)$/i.exec(clean);
	if (ssh !== null) clean = `https://${ssh[1]}/${ssh[2]}`;
	const git = /^git:\/\/([^/]+)\/(.+)$/i.exec(clean);
	if (git !== null) clean = `https://${git[1]}/${git[2]}`;
	if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean) === true) clean = `https://github.com/${clean}`;
	if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}\//.test(clean) === true) clean = `https://${clean}`;
	// A repository link is rendered as an anchor: keep only web URLs.
	if (/^https?:\/\//i.test(clean) !== true) return '';
	return clean.slice(0, 300);
}

/** Normalize a local project root: trim quotes, keep `~`, drop a trailing separator. */
export function normalizeLocalPath(value) {
	let clean = textOf(value, 500).replace(/^["']+|["']+$/g, '').trim();
	if (clean === '') return '';
	if (clean.length > 1 && /^[A-Za-z]:[\\/]$/.test(clean) !== true) clean = clean.replace(/[\\/]+$/, '');
	return clean.slice(0, 500);
}

/** Read the optional code-link fields from a flat or nested product payload. */
function productCodeOf(source) {
	if (isObject(source) !== true) return {};
	const repo = source.repoUrl ?? source.repository ?? source.repo ?? source.githubRepo;
	const local = source.localPath ?? source.homePath ?? source.projectHome ?? source.localProjectHome;
	const fields = {};
	if (repo !== undefined) fields.repoUrl = normalizeRepoUrl(isObject(repo) ? repo.url : repo);
	if (local !== undefined) fields.localPath = normalizeLocalPath(local);
	return fields;
}

/** Normalize acceptance criteria into `{ id, text, done }` rows. */
export function normalizeAcceptance(value) {
	const raw = Array.isArray(value)
		? value
		: typeof value === 'string'
			? value.split(/\r?\n/)
			: [];
	const criteria = [];
	for (const entry of raw) {
		if (criteria.length >= 30) break;
		const source = typeof entry === 'string' ? entry : entry?.text;
		const text = textOf(source, 400).replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '');
		if (text === '') continue;
		criteria.push({
			id: isObject(entry) && typeof entry.id === 'string' && entry.id !== '' ? entry.id : newId('ac'),
			text,
			done: isObject(entry) && entry.done === true
		});
	}
	return criteria;
}

/** Accept English or Chinese status labels beside the canonical ids. */
export function statusOf(value) {
	if (typeof value !== 'string') return undefined;
	const clean = value.trim();
	if (STATUS_BY_ID[clean] !== undefined) return clean;
	const alias = {
		待办: 'backlog',
		backlog: 'backlog',
		待开发: 'todo',
		todo: 'todo',
		'to do': 'todo',
		ready: 'todo',
		开发中: 'in_progress',
		'in progress': 'in_progress',
		doing: 'in_progress',
		inprogress: 'in_progress',
		待验收: 'verify',
		'to verify': 'verify',
		verify: 'verify',
		review: 'verify',
		已完成: 'done',
		完成: 'done',
		done: 'done',
		closed: 'done'
	};
	const mapped = alias[clean.toLowerCase()] ?? alias[clean];
	return mapped !== undefined && STATUS_BY_ID[mapped] !== undefined ? mapped : undefined;
}

/** Accept P0..P3, 0..3, or a Chinese "高/中/低" label. */
export function priorityOf(value) {
	if (typeof value === 'number' && Number.isFinite(value)) {
		const index = Math.max(0, Math.min(3, Math.trunc(value)));
		return PRIORITIES[index];
	}
	if (typeof value !== 'string') return undefined;
	const clean = value.trim().toUpperCase();
	if (PRIORITIES.includes(clean) === true) return clean;
	if (/^[0-3]$/.test(clean) === true) return `P${clean}`;
	const alias = { 高: 'P0', 最高: 'P0', 中: 'P2', 低: 'P3', HIGH: 'P1', MEDIUM: 'P2', LOW: 'P3' };
	return alias[value.trim()] ?? alias[clean];
}

/** Parse an estimate into a non-negative number of story points. */
export function estimateOf(value) {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[^\d.]/g, ''));
	if (Number.isFinite(parsed) !== true || parsed < 0) return null;
	return Math.min(100, Math.round(parsed * 10) / 10);
}

/** Derive a short uppercase key from a name, falling back to a prefix. */
function deriveKey(name, fallback) {
	const ascii = name
		.normalize('NFKD')
		.replace(/[^A-Za-z0-9]+/g, '')
		.toUpperCase()
		.slice(0, 8);
	return ascii === '' ? fallback : ascii;
}

/** Sanitize an explicitly supplied key, or derive one. */
function keyOf(value, name, fallback) {
	const supplied = textOf(value, 16).replace(/[^A-Za-z0-9-]+/g, '').toUpperCase();
	return supplied === '' ? deriveKey(name, fallback) : supplied;
}

/** Ensure a key is unique within a list, suffixing -2, -3, … when taken. */
function uniqueKey(list, candidate) {
	const taken = new Set(list.map((entry) => entry.key));
	if (taken.has(candidate) !== true) return candidate;
	let index = 2;
	while (taken.has(`${candidate}-${String(index)}`) === true) index += 1;
	return `${candidate}-${String(index)}`;
}

/** Normalize a story key to `US-01`; returns undefined for non-story keys. */
export function normalizeStoryKey(value) {
	if (typeof value !== 'string') return undefined;
	const match = /US[\s-_]?(\d{1,4})/i.exec(value);
	if (match === null) return undefined;
	return `US-${match[1].padStart(2, '0')}`;
}

/** The next `US-nn` key for a project. */
function nextStoryKey(state, projectId) {
	let highest = 0;
	for (const story of state.stories) {
		if (story.projectId !== projectId) continue;
		const match = /^US-(\d+)$/.exec(story.key);
		if (match !== null) highest = Math.max(highest, Number(match[1]));
	}
	return `US-${String(highest + 1).padStart(2, '0')}`;
}

/** Effective WIP limit of one status on a board (`null` means unlimited). */
export function wipLimitOf(board, statusId) {
	if (board?.wip !== undefined && board.wip !== null && Object.hasOwn(board.wip, statusId) === true) {
		const override = board.wip[statusId];
		if (override === null) return null;
		if (typeof override === 'number' && Number.isFinite(override) === true) return Math.max(0, Math.trunc(override));
	}
	return STATUS_BY_ID[statusId]?.wip ?? null;
}

/** Counts and limit breaches for one board. */
export function boardWip(state, boardId) {
	const board = state.boards.find((entry) => entry.id === boardId);
	if (board === undefined) return [];
	return STATUSES.map((status) => {
		const limit = wipLimitOf(board, status.id);
		const count = state.stories.filter((story) => story.boardId === boardId && story.status === status.id).length;
		return {
			status: status.id,
			count,
			limit,
			exceeded: limit !== null && count > limit
		};
	}).filter((entry) => entry.limit !== null);
}

/** Warnings for every exceeded WIP limit on a board; empty when healthy. */
export function wipWarnings(state, boardId) {
	if (typeof boardId !== 'string' || boardId === '') return [];
	return boardWip(state, boardId)
		.filter((entry) => entry.exceeded === true)
		.map((entry) => ({
			code: 'wip_exceeded',
			status: entry.status,
			count: entry.count,
			limit: entry.limit,
			message: `${entry.status} has ${String(entry.count)} stories, above its WIP limit of ${String(entry.limit)}`
		}));
}

/** Empty document. */
export function emptyState() {
	return {
		schemaVersion: SCHEMA_VERSION,
		products: [],
		projects: [],
		boards: [],
		stories: [],
		activity: []
	};
}

/** Coerce a stored document into the current shape, dropping only unusable entries. */
export function normalizeState(raw) {
	const state = emptyState();
	if (isObject(raw) !== true) return state;
	if (Array.isArray(raw.products) === true) state.products = raw.products.filter(isObject).map((entry) => ({
		id: typeof entry.id === 'string' ? entry.id : newId('prd'),
		key: textOf(entry.key, 16).toUpperCase(),
		name: textOf(entry.name, 80),
		description: textOf(entry.description, 400),
		color: PRODUCT_COLORS.includes(entry.color) ? entry.color : 'blue',
		repoUrl: normalizeRepoUrl(isObject(entry.repo) ? entry.repo.url : entry.repoUrl ?? entry.repository ?? entry.repo),
		localPath: normalizeLocalPath(entry.localPath ?? entry.homePath ?? entry.projectHome ?? entry.localProjectHome),
		createdAt: textOf(entry.createdAt, 40),
		updatedAt: textOf(entry.updatedAt, 40)
	})).filter((entry) => entry.id !== '' && entry.name !== '');
	if (Array.isArray(raw.projects) === true) state.projects = raw.projects.filter(isObject).map((entry) => ({
		id: typeof entry.id === 'string' ? entry.id : newId('prj'),
		productId: textOf(entry.productId, 40),
		key: textOf(entry.key, 16).toUpperCase(),
		name: textOf(entry.name, 80),
		description: textOf(entry.description, 600),
		objective: textOf(entry.objective, 300),
		startDate: textOf(entry.startDate, 20),
		endDate: textOf(entry.endDate, 20),
		status: entry.status === 'closed' ? 'closed' : 'active',
		createdAt: textOf(entry.createdAt, 40),
		updatedAt: textOf(entry.updatedAt, 40)
	})).filter((entry) => entry.name !== '');
	if (Array.isArray(raw.boards) === true) state.boards = raw.boards.filter(isObject).map((entry) => ({
		id: typeof entry.id === 'string' ? entry.id : newId('brd'),
		projectId: textOf(entry.projectId, 40),
		name: textOf(entry.name, 80),
		goal: textOf(entry.goal, 300),
		startDate: textOf(entry.startDate, 20),
		endDate: textOf(entry.endDate, 20),
		status: entry.status === 'closed' ? 'closed' : 'active',
		wip: isObject(entry.wip) ? entry.wip : {},
		createdAt: textOf(entry.createdAt, 40),
		updatedAt: textOf(entry.updatedAt, 40)
	})).filter((entry) => entry.name !== '');
	if (Array.isArray(raw.stories) === true) state.stories = raw.stories.filter(isObject).map((entry) => ({
		id: typeof entry.id === 'string' ? entry.id : newId('us'),
		projectId: textOf(entry.projectId, 40),
		boardId: typeof entry.boardId === 'string' && entry.boardId !== '' ? entry.boardId : null,
		key: normalizeStoryKey(entry.key) ?? normalizeStoryKey(entry.id) ?? 'US-00',
		title: textOf(entry.title, 200),
		asA: textOf(entry.asA, 200),
		iWant: textOf(entry.iWant, 400),
		soThat: textOf(entry.soThat, 400),
		acceptanceCriteria: normalizeAcceptance(entry.acceptanceCriteria),
		priority: priorityOf(entry.priority) ?? 'P2',
		estimate: estimateOf(entry.estimate),
		assignee: textOf(entry.assignee, 60),
		epic: textOf(entry.epic, 100),
		tags: normalizeTags(entry.tags),
		status: statusOf(entry.status) ?? 'backlog',
		blocked: entry.blocked === true,
		blockedReason: textOf(entry.blockedReason, 300),
		rank: typeof entry.rank === 'number' && Number.isFinite(entry.rank) ? entry.rank : 0,
		createdAt: textOf(entry.createdAt, 40),
		updatedAt: textOf(entry.updatedAt, 40)
	})).filter((entry) => entry.title !== '');
	if (Array.isArray(raw.activity) === true) state.activity = raw.activity.filter(isObject).map((entry) => ({
		id: typeof entry.id === 'string' ? entry.id : newId('ev'),
		at: textOf(entry.at, 40),
		kind: textOf(entry.kind, 40),
		label: textOf(entry.label, 200),
		refs: isObject(entry.refs) ? entry.refs : {}
	})).filter((entry) => entry.kind !== '').slice(-MAX_ACTIVITY);
	return state;
}

/** Append one activity row, trimming the oldest entries. */
function recordActivity(state, kind, label, refs = {}, at) {
	state.activity.push({ id: newId('ev'), at, kind, label: textOf(label, 200), refs });
	if (state.activity.length > MAX_ACTIVITY) state.activity = state.activity.slice(-MAX_ACTIVITY);
}

/** Find one entity by id, throwing a helpful error when it does not exist. */
function mustFind(list, id, label) {
	if (typeof id !== 'string' || id === '') throw new BadInput(`${label} id 不能为空`);
	const found = list.find((entry) => entry.id === id);
	if (found === undefined) throw new BadInput(`${label} 不存在：${id}`, 'not_found');
	return found;
}

/** The project that owns a story, or throws. */
function projectOfStory(state, story) {
	const project = state.projects.find((entry) => entry.id === story.projectId);
	if (project === undefined) throw new BadInput(`故事 ${story.key} 所属项目不存在`, 'not_found');
	return project;
}

/** Validate that a board belongs to a project. */
function boardInProject(state, boardId, projectId) {
	if (boardId === null || boardId === undefined || boardId === '') return null;
	const board = mustFind(state.boards, boardId, '看板');
	if (board.projectId !== projectId) throw new BadInput('看板不属于该项目', 'bad_parent');
	return board;
}

/** A story's ordering rank at the end of its board column. */
function nextRank(state, boardId, statusId) {
	let highest = 0;
	for (const story of state.stories) {
		if (story.boardId === boardId && story.status === statusId && Number.isFinite(story.rank) === true) {
			highest = Math.max(highest, story.rank);
		}
	}
	return highest + 1;
}

/** Build a story record from caller input; shared by create and import. */
function buildStory(state, input, defaults, clock) {
	const projectId = textOf(input.projectId, 40) || defaults.projectId;
	const project = mustFind(state.projects, projectId, '项目');
	const requestedBoard = input.boardId === null ? null : textOf(input.boardId, 40) || defaults.boardId;
	const boardId = requestedBoard === undefined || requestedBoard === '' ? null : requestedBoard;
	boardInProject(state, boardId, projectId);
	const title = requireText(input.title ?? input.name, '故事标题', 200);
	const status = statusOf(input.status) ?? defaults.status ?? (boardId === null ? 'backlog' : 'todo');
	const providedKey = normalizeStoryKey(input.key);
	if (providedKey !== undefined && state.stories.some((story) => story.projectId === projectId && story.key === providedKey) === true) {
		throw new BadInput(`故事编号已存在：${providedKey}`, 'duplicate_key');
	}
	const at = clock();
	return {
		id: newId('us'),
		projectId: project.id,
		boardId: boardId ?? null,
		key: providedKey ?? nextStoryKey(state, projectId),
		title,
		asA: textOf(input.asA ?? input.role, 200),
		iWant: textOf(input.iWant ?? input.want ?? input.feature, 400),
		soThat: textOf(input.soThat ?? input.value ?? input.benefit, 400),
		acceptanceCriteria: normalizeAcceptance(input.acceptanceCriteria ?? input.ac ?? input.criteria),
		priority: priorityOf(input.priority) ?? 'P2',
		estimate: estimateOf(input.estimate ?? input.points ?? input.sp),
		assignee: textOf(input.assignee ?? input.owner, 60),
		epic: textOf(input.epic, 100),
		tags: normalizeTags(input.tags),
		status,
		blocked: input.blocked === true,
		blockedReason: textOf(input.blockedReason, 300),
		rank: nextRank(state, boardId ?? null, status),
		createdAt: at,
		updatedAt: at
	};
}

/** Patch one story with the fields a caller is allowed to change. */
function patchStory(story, patch, clock) {
	if (patch.title !== undefined) story.title = requireText(patch.title, '故事标题', 200);
	if (patch.asA !== undefined) story.asA = textOf(patch.asA, 200);
	if (patch.iWant !== undefined) story.iWant = textOf(patch.iWant, 400);
	if (patch.soThat !== undefined) story.soThat = textOf(patch.soThat, 400);
	if (patch.acceptanceCriteria !== undefined) story.acceptanceCriteria = normalizeAcceptance(patch.acceptanceCriteria);
	if (patch.priority !== undefined) story.priority = priorityOf(patch.priority) ?? story.priority;
	if (patch.estimate !== undefined) story.estimate = estimateOf(patch.estimate);
	if (patch.assignee !== undefined) story.assignee = textOf(patch.assignee, 60);
	if (patch.epic !== undefined) story.epic = textOf(patch.epic, 100);
	if (patch.tags !== undefined) story.tags = normalizeTags(patch.tags);
	if (patch.blocked !== undefined) story.blocked = patch.blocked === true;
	if (patch.blockedReason !== undefined) story.blockedReason = textOf(patch.blockedReason, 300);
	if (patch.status !== undefined) {
		const status = statusOf(patch.status);
		if (status === undefined) throw new BadInput(`未知状态：${String(patch.status)}`);
		story.status = status;
	}
	story.updatedAt = clock();
	return story;
}

/** Move one story within or across columns, computing a midpoint rank. */
function moveStory(state, story, input, clock) {
	const project = projectOfStory(state, story);
	const nextStatus = statusOf(input.status) ?? story.status;
	const nextBoardId = input.boardId === undefined ? story.boardId : input.boardId === null ? null : textOf(input.boardId, 40) || null;
	boardInProject(state, nextBoardId, project.id);
	story.status = nextStatus;
	story.boardId = nextBoardId;
	const siblings = state.stories
		.filter((entry) => entry.id !== story.id && entry.boardId === nextBoardId && entry.status === nextStatus)
		.sort((left, right) => left.rank - right.rank);
	if (typeof input.beforeStoryId === 'string' && input.beforeStoryId !== '') {
		const index = siblings.findIndex((entry) => entry.id === input.beforeStoryId);
		if (index === -1) throw new BadInput('beforeStoryId 不在目标列中', 'bad_order');
		const previous = index === 0 ? undefined : siblings[index - 1];
		story.rank = previous === undefined ? siblings[index].rank - 1 : (previous.rank + siblings[index].rank) / 2;
	} else if (typeof input.afterStoryId === 'string' && input.afterStoryId !== '') {
		const index = siblings.findIndex((entry) => entry.id === input.afterStoryId);
		if (index === -1) throw new BadInput('afterStoryId 不在目标列中', 'bad_order');
		const next = index === siblings.length - 1 ? undefined : siblings[index + 1];
		story.rank = next === undefined ? siblings[index].rank + 1 : (siblings[index].rank + next.rank) / 2;
	} else {
		story.rank = nextRank(state, nextBoardId, nextStatus);
	}
	story.updatedAt = clock();
	return story;
}

/** Compute counts used by the overview and by tool responses. */
export function summarize(state) {
	const byStatus = Object.fromEntries(STATUS_IDS.map((id) => [id, 0]));
	let points = 0;
	let blocked = 0;
	let unassigned = 0;
	for (const story of state.stories) {
		if (byStatus[story.status] !== undefined) byStatus[story.status] += 1;
		if (typeof story.estimate === 'number') points += story.estimate;
		if (story.blocked === true) blocked += 1;
		if (story.assignee === '') unassigned += 1;
	}
	return {
		counts: {
			products: state.products.length,
			projects: state.projects.length,
			boards: state.boards.length,
			stories: state.stories.length,
			points: Math.round(points * 10) / 10
		},
		byStatus,
		blocked,
		unassigned,
		wip: state.boards.flatMap((board) => boardWip(state, board.id).filter((entry) => entry.exceeded === true).map((entry) => ({
			boardId: board.id,
			boardName: board.name,
			...entry
		}))),
		blockers: state.stories
			.filter((story) => story.blocked === true)
			.map((story) => ({
				id: story.id,
				key: story.key,
				title: story.title,
				projectId: story.projectId,
				boardId: story.boardId,
				reason: story.blockedReason
			}))
	};
}

/**
 * Apply one command to the document in place. Throws `BadInput` for caller
 * mistakes; the Store turns that into `{ ok: false, error }`.
 */
export function mutate(state, rawAction, input = {}, { clock = () => new Date().toISOString() } = {}) {
	if (typeof rawAction !== 'string' || rawAction.trim() === '') throw new BadInput('action 不能为空');
	const action = rawAction.trim().toLowerCase().replace(/[.:/\s-]+/g, '_');
	const body = isObject(input) ? input : {};
	const at = clock();
	const patch = isObject(body.patch) ? body.patch : {};

	switch (action) {
		/* ------------------------------------------------------------ products */
		case 'create_product':
		case 'product_create': {
			const name = requireText(body.name ?? body.product?.name, '产品名称', 80);
			const code = { ...productCodeOf(body.product), ...productCodeOf(body) };
			const product = {
				id: newId('prd'),
				key: uniqueKey(state.products, keyOf(body.key ?? body.product?.key, name, 'PRD')),
				name,
				description: textOf(body.description ?? body.product?.description, 400),
				color: PRODUCT_COLORS.includes(body.color ?? body.product?.color) ? body.color ?? body.product.color : 'blue',
				repoUrl: code.repoUrl ?? '',
				localPath: code.localPath ?? '',
				createdAt: at,
				updatedAt: at
			};
			state.products.push(product);
			recordActivity(state, 'product.created', product.name, { productId: product.id }, at);
			return { ok: true, value: { product }, changed: true };
		}
		case 'update_product':
		case 'product_update': {
			const product = mustFind(state.products, body.id ?? body.productId, '产品');
			if (body.name !== undefined || patch.name !== undefined) product.name = requireText(body.name ?? patch.name, '产品名称', 80);
			if (body.key !== undefined || patch.key !== undefined) {
				const candidate = keyOf(body.key ?? patch.key, product.name, product.key);
				product.key = uniqueKey(state.products.filter((entry) => entry.id !== product.id), candidate);
			}
			if (body.description !== undefined || patch.description !== undefined) product.description = textOf(body.description ?? patch.description, 400);
			const code = { ...productCodeOf(patch), ...productCodeOf(body) };
			if (code.repoUrl !== undefined) product.repoUrl = code.repoUrl;
			if (code.localPath !== undefined) product.localPath = code.localPath;
			if (body.color !== undefined || patch.color !== undefined) {
				const color = body.color ?? patch.color;
				if (PRODUCT_COLORS.includes(color) === true) product.color = color;
			}
			product.updatedAt = at;
			recordActivity(state, 'product.updated', product.name, { productId: product.id }, at);
			return { ok: true, value: { product }, changed: true };
		}
		case 'delete_product':
		case 'product_delete': {
			const product = mustFind(state.products, body.id ?? body.productId, '产品');
			const projects = state.projects.filter((entry) => entry.productId === product.id);
			const projectIds = new Set(projects.map((entry) => entry.id));
			const boards = state.boards.filter((entry) => projectIds.has(entry.projectId));
			const boardIds = new Set(boards.map((entry) => entry.id));
			const stories = state.stories.filter((entry) => projectIds.has(entry.projectId));
			if (body.cascade === false && (projects.length > 0 || stories.length > 0)) {
				throw new BadInput('产品下仍有项目或故事；传 cascade: true 以级联删除', 'has_children');
			}
			state.products = state.products.filter((entry) => entry.id !== product.id);
			state.projects = state.projects.filter((entry) => projectIds.has(entry.id) !== true);
			state.boards = state.boards.filter((entry) => boardIds.has(entry.id) !== true);
			state.stories = state.stories.filter((entry) => projectIds.has(entry.projectId) !== true);
			recordActivity(state, 'product.deleted', product.name, {}, at);
			return { ok: true, value: { deleted: { products: 1, projects: projects.length, boards: boards.length, stories: stories.length } }, changed: true };
		}

		/* ------------------------------------------------------------ projects */
		case 'create_project':
		case 'project_create': {
			const name = requireText(body.name ?? body.project?.name, '项目名称', 80);
			const product = mustFind(state.products, body.productId ?? body.product?.productId, '产品');
			const project = {
				id: newId('prj'),
				productId: product.id,
				key: uniqueKey(state.projects, keyOf(body.key ?? body.project?.key, name, 'PRJ')),
				name,
				description: textOf(body.description ?? body.project?.description, 600),
				objective: textOf(body.objective ?? body.project?.objective, 300),
				startDate: textOf(body.startDate ?? body.project?.startDate, 20),
				endDate: textOf(body.endDate ?? body.project?.endDate, 20),
				status: body.status === 'closed' ? 'closed' : 'active',
				createdAt: at,
				updatedAt: at
			};
			state.projects.push(project);
			recordActivity(state, 'project.created', project.name, { productId: product.id, projectId: project.id }, at);
			return { ok: true, value: { project }, changed: true };
		}
		case 'update_project':
		case 'project_update': {
			const project = mustFind(state.projects, body.id ?? body.projectId, '项目');
			if (body.productId !== undefined) {
				const product = mustFind(state.products, body.productId, '产品');
				project.productId = product.id;
			}
			if (body.name !== undefined || patch.name !== undefined) project.name = requireText(body.name ?? patch.name, '项目名称', 80);
			if (body.key !== undefined || patch.key !== undefined) {
				const candidate = keyOf(body.key ?? patch.key, project.name, project.key);
				project.key = uniqueKey(state.projects.filter((entry) => entry.id !== project.id), candidate);
			}
			if (body.description !== undefined || patch.description !== undefined) project.description = textOf(body.description ?? patch.description, 600);
			if (body.objective !== undefined || patch.objective !== undefined) project.objective = textOf(body.objective ?? patch.objective, 300);
			if (body.startDate !== undefined || patch.startDate !== undefined) project.startDate = textOf(body.startDate ?? patch.startDate, 20);
			if (body.endDate !== undefined || patch.endDate !== undefined) project.endDate = textOf(body.endDate ?? patch.endDate, 20);
			if (body.status !== undefined || patch.status !== undefined) project.status = (body.status ?? patch.status) === 'closed' ? 'closed' : 'active';
			project.updatedAt = at;
			recordActivity(state, 'project.updated', project.name, { projectId: project.id }, at);
			return { ok: true, value: { project }, changed: true };
		}
		case 'delete_project':
		case 'project_delete': {
			const project = mustFind(state.projects, body.id ?? body.projectId, '项目');
			const boards = state.boards.filter((entry) => entry.projectId === project.id);
			const boardIds = new Set(boards.map((entry) => entry.id));
			const stories = state.stories.filter((entry) => entry.projectId === project.id);
			if (body.cascade === false && stories.length > 0) {
				throw new BadInput('项目下仍有故事；传 cascade: true 以级联删除', 'has_children');
			}
			state.projects = state.projects.filter((entry) => entry.id !== project.id);
			state.boards = state.boards.filter((entry) => boardIds.has(entry.id) !== true);
			state.stories = state.stories.filter((entry) => entry.projectId !== project.id);
			recordActivity(state, 'project.deleted', project.name, {}, at);
			return { ok: true, value: { deleted: { projects: 1, boards: boards.length, stories: stories.length } }, changed: true };
		}

		/* -------------------------------------------------------------- boards */
		case 'create_board':
		case 'board_create': {
			const name = requireText(body.name ?? body.board?.name, '看板名称', 80);
			const project = mustFind(state.projects, body.projectId ?? body.board?.projectId, '项目');
			const board = {
				id: newId('brd'),
				projectId: project.id,
				name,
				goal: textOf(body.goal ?? body.board?.goal, 300),
				startDate: textOf(body.startDate ?? body.board?.startDate, 20),
				endDate: textOf(body.endDate ?? body.board?.endDate, 20),
				status: body.status === 'closed' ? 'closed' : 'active',
				wip: normalizeWip(body.wip ?? body.board?.wip),
				createdAt: at,
				updatedAt: at
			};
			state.boards.push(board);
			recordActivity(state, 'board.created', board.name, { projectId: project.id, boardId: board.id }, at);
			return { ok: true, value: { board }, changed: true };
		}
		case 'update_board':
		case 'board_update': {
			const board = mustFind(state.boards, body.id ?? body.boardId, '看板');
			if (body.name !== undefined || patch.name !== undefined) board.name = requireText(body.name ?? patch.name, '看板名称', 80);
			if (body.goal !== undefined || patch.goal !== undefined) board.goal = textOf(body.goal ?? patch.goal, 300);
			if (body.startDate !== undefined || patch.startDate !== undefined) board.startDate = textOf(body.startDate ?? patch.startDate, 20);
			if (body.endDate !== undefined || patch.endDate !== undefined) board.endDate = textOf(body.endDate ?? patch.endDate, 20);
			if (body.status !== undefined || patch.status !== undefined) board.status = (body.status ?? patch.status) === 'closed' ? 'closed' : 'active';
			if (body.wip !== undefined || patch.wip !== undefined) board.wip = normalizeWip(body.wip ?? patch.wip);
			board.updatedAt = at;
			recordActivity(state, 'board.updated', board.name, { boardId: board.id }, at);
			return { ok: true, value: { board }, changed: true };
		}
		case 'delete_board':
		case 'board_delete': {
			const board = mustFind(state.boards, body.id ?? body.boardId, '看板');
			const stories = state.stories.filter((entry) => entry.boardId === board.id);
			if (body.moveTo === 'delete') {
				state.stories = state.stories.filter((entry) => entry.boardId !== board.id);
			} else {
				for (const story of stories) {
					story.boardId = null;
					story.status = 'backlog';
					story.rank = 0;
					story.updatedAt = at;
				}
			}
			state.boards = state.boards.filter((entry) => entry.id !== board.id);
			recordActivity(state, 'board.deleted', board.name, {}, at);
			return { ok: true, value: { deleted: { boards: 1, storiesMovedToBacklog: body.moveTo === 'delete' ? 0 : stories.length, storiesDeleted: body.moveTo === 'delete' ? stories.length : 0 } }, changed: true };
		}

		/* ------------------------------------------------------------- stories */
		case 'create_story':
		case 'story_create': {
			const input = isObject(body.story) ? { ...body.story, ...body } : body;
			const story = buildStory(state, input, { projectId: body.projectId, boardId: body.boardId }, clock);
			state.stories.push(story);
			recordActivity(state, 'story.created', `${story.key} ${story.title}`, {
				projectId: story.projectId,
				boardId: story.boardId,
				storyId: story.id
			}, at);
			const warnings = story.boardId === null ? [] : wipWarnings(state, story.boardId);
			return { ok: true, value: { story }, warnings, changed: true };
		}
		case 'update_story':
		case 'story_update': {
			const story = mustFind(state.stories, body.id ?? body.storyId ?? body.story?.id, '故事');
			const merged = { ...patch, ...body, id: undefined, storyId: undefined, story: undefined, action: undefined, patch: undefined };
			const nextBoardId = merged.boardId;
			if (nextBoardId !== undefined) {
				boardInProject(state, nextBoardId === null ? null : textOf(nextBoardId, 40), story.projectId);
				story.boardId = nextBoardId === null ? null : textOf(nextBoardId, 40);
			}
			patchStory(story, merged, clock);
			recordActivity(state, 'story.updated', `${story.key} ${story.title}`, {
				projectId: story.projectId,
				boardId: story.boardId,
				storyId: story.id
			}, at);
			const warnings = story.boardId === null ? [] : wipWarnings(state, story.boardId);
			return { ok: true, value: { story }, warnings, changed: true };
		}
		case 'move_story':
		case 'story_move': {
			const story = mustFind(state.stories, body.id ?? body.storyId, '故事');
			const before = story.status;
			moveStory(state, story, body, clock);
			recordActivity(state, 'story.moved', `${story.key} ${story.title}`, {
				projectId: story.projectId,
				boardId: story.boardId,
				storyId: story.id,
				from: before,
				to: story.status
			}, at);
			const warnings = story.boardId === null ? [] : wipWarnings(state, story.boardId);
			return { ok: true, value: { story, from: before, to: story.status }, warnings, changed: true };
		}
		case 'delete_story':
		case 'story_delete': {
			const story = mustFind(state.stories, body.id ?? body.storyId, '故事');
			state.stories = state.stories.filter((entry) => entry.id !== story.id);
			recordActivity(state, 'story.deleted', `${story.key} ${story.title}`, {}, at);
			return { ok: true, value: { deleted: { stories: 1 } }, changed: true };
		}

		/* --------------------------------------------------------------- import */
		case 'import_stories':
		case 'story_import':
		case 'import': {
			return importStories(state, body, { clock, at });
		}

		/* ---------------------------------------------------------------- reset */
		case 'reset_store':
		case 'reset':
		case 'store_reset': {
			state.products = [];
			state.projects = [];
			state.boards = [];
			state.stories = [];
			state.activity = [];
			if (body.seedDemo === false) {
				return { ok: true, value: { reset: true, seeded: false }, changed: true };
			}
			const result = seedDemo(state, { clock, at });
			return { ...result, value: { reset: true, seeded: true, ...result.value } };
		}

		/* ----------------------------------------------------------------- demo */
		case 'seed_demo':
		case 'demo_seed': {
			if (state.products.some((entry) => entry.key === 'DIDI') === true && body.force !== true) {
				return { ok: true, value: { created: false, reason: 'demo product DIDI already exists' }, changed: false };
			}
			return seedDemo(state, { clock, at });
		}

		default:
			throw new BadInput(`未知 action：${rawAction}`);
	}
}

/** Normalize a board WIP override map. */
function normalizeWip(value) {
	const wip = {};
	if (isObject(value) !== true) return wip;
	for (const status of STATUSES) {
		if (status.wip === null) continue;
		const limit = value[status.id];
		if (limit === null) {
			wip[status.id] = null;
			continue;
		}
		if (typeof limit === 'number' && Number.isFinite(limit) === true && limit >= 0) wip[status.id] = Math.min(20, Math.trunc(limit));
	}
	return wip;
}

/**
 * Import stories from an inline array or a Markdown document. Both paths feed
 * the same normalized shape; an existing story with the same key or title is
 * updated instead of duplicated, so re-importing a refined document is safe.
 */
function importStories(state, body, { clock, at }) {
	const projectTargeted = body.projectId !== undefined
		|| body.projectKey !== undefined
		|| body.projectName !== undefined
		|| isObject(body.project);
	if (projectTargeted !== true) {
		throw new BadInput('import 需要 projectId、projectKey 或 projectName（不会只创建产品）');
	}
	let product;
	if (body.productId !== undefined) product = mustFind(state.products, body.productId, '产品');
	else if (body.productKey !== undefined) product = state.products.find((entry) => entry.key === textOf(body.productKey, 16).toUpperCase());
	else if (body.productName !== undefined) product = state.products.find((entry) => entry.name === textOf(body.productName, 80));

	let project;
	const projectId = body.projectId;
	if (projectId !== undefined) project = mustFind(state.projects, projectId, '项目');
	else if (body.projectKey !== undefined) {
		project = state.projects.find((entry) => entry.key === textOf(body.projectKey, 16).toUpperCase() && (product === undefined || entry.productId === product.id));
	} else if (body.projectName !== undefined) {
		project = state.projects.find((entry) => entry.name === textOf(body.projectName, 80) && (product === undefined || entry.productId === product.id));
	}
	if (product === undefined && project !== undefined) product = state.products.find((entry) => entry.id === project.productId);

	if (product === undefined && (body.productName !== undefined || body.productKey !== undefined)) {
		const name = requireText(body.productName, '产品名称', 80);
		product = {
			id: newId('prd'),
			key: uniqueKey(state.products, keyOf(body.productKey, name, 'PRD')),
			name,
			description: '',
			color: 'blue',
			repoUrl: '',
			localPath: '',
			createdAt: at,
			updatedAt: at
		};
		state.products.push(product);
		recordActivity(state, 'product.created', product.name, { productId: product.id }, at);
	} else if (product === undefined && isObject(body.product) === true) {
		const name = requireText(body.product.name, '产品名称', 80);
		const code = productCodeOf(body.product);
		product = {
			id: newId('prd'),
			key: uniqueKey(state.products, keyOf(body.product.key, name, 'PRD')),
			name,
			description: textOf(body.product.description, 400),
			color: 'blue',
			repoUrl: code.repoUrl ?? '',
			localPath: code.localPath ?? '',
			createdAt: at,
			updatedAt: at
		};
		state.products.push(product);
		recordActivity(state, 'product.created', product.name, { productId: product.id }, at);
	}

	if (project === undefined && (body.projectName !== undefined || body.projectKey !== undefined || isObject(body.project) === true)) {
		if (product === undefined) throw new BadInput('创建项目需要 productId、productName 或 project 所属产品');
		const source = isObject(body.project) ? body.project : body;
		const name = requireText(source.name ?? body.projectName, '项目名称', 80);
		project = {
			id: newId('prj'),
			productId: product.id,
			key: uniqueKey(state.projects, keyOf(source.key ?? body.projectKey, name, 'PRJ')),
			name,
			description: textOf(source.description, 600),
			objective: textOf(source.objective, 300),
			startDate: textOf(source.startDate, 20),
			endDate: textOf(source.endDate, 20),
			status: 'active',
			createdAt: at,
			updatedAt: at
		};
		state.projects.push(project);
		recordActivity(state, 'project.created', project.name, { productId: product.id, projectId: project.id }, at);
	}
	if (project === undefined) throw new BadInput('import 需要 projectId、projectKey 或 projectName');

	let board;
	if (body.boardId !== undefined && body.boardId !== null && body.boardId !== '') {
		board = boardInProject(state, body.boardId, project.id);
	} else if (body.boardName !== undefined && textOf(body.boardName, 80) !== '') {
		const boardName = textOf(body.boardName, 80);
		board = state.boards.find((entry) => entry.projectId === project.id && entry.name === boardName);
		if (board === undefined) {
			board = {
				id: newId('brd'),
				projectId: project.id,
				name: boardName,
				goal: textOf(body.boardGoal, 300),
				startDate: textOf(body.startDate, 20),
				endDate: textOf(body.endDate, 20),
				status: 'active',
				wip: {},
				createdAt: at,
				updatedAt: at
			};
			state.boards.push(board);
			recordActivity(state, 'board.created', board.name, { projectId: project.id, boardId: board.id }, at);
		}
	}

	const input = Array.isArray(body.stories) === true
		? body.stories
		: typeof body.markdown === 'string' && body.markdown.trim() !== ''
			? parseStoriesMarkdown(body.markdown)
			: [];
	if (input.length === 0) throw new BadInput('没有可导入的故事：传 stories 数组或 markdown 文本');

	const defaultStatus = statusOf(body.defaultStatus) ?? (board === undefined ? 'backlog' : 'todo');
	const created = [];
	const updated = [];
	const warnings = [];
	for (const raw of input) {
		if (isObject(raw) !== true) continue;
		const key = normalizeStoryKey(raw.key ?? raw.id ?? raw.code);
		const title = textOf(raw.title ?? raw.name, 200);
		if (title === '' && key === undefined) continue;
		const existing = state.stories.find((entry) => entry.projectId === project.id && (
			(key !== undefined && entry.key === key) || (title !== '' && entry.title.toLowerCase() === title.toLowerCase())
		));
		if (existing !== undefined) {
			const before = existing.updatedAt;
			if (title !== '') existing.title = title;
			patchStory(existing, {
				asA: raw.asA ?? raw.role,
				iWant: raw.iWant ?? raw.want ?? raw.feature,
				soThat: raw.soThat ?? raw.value ?? raw.benefit,
				acceptanceCriteria: raw.acceptanceCriteria ?? raw.ac ?? raw.criteria,
				priority: raw.priority,
				estimate: raw.estimate ?? raw.points ?? raw.sp,
				assignee: raw.assignee ?? raw.owner,
				epic: raw.epic,
				tags: raw.tags,
				status: raw.status,
				blocked: raw.blocked,
				blockedReason: raw.blockedReason
			}, clock);
			if (existing.updatedAt === before) existing.updatedAt = clock();
			updated.push(existing);
		} else {
			const story = buildStory(state, {
				...raw,
				title,
				key: key,
				projectId: project.id,
				boardId: board?.id ?? null,
				status: raw.status ?? defaultStatus
			}, { projectId: project.id, boardId: board?.id ?? null, status: defaultStatus }, clock);
			state.stories.push(story);
			created.push(story);
		}
	}
	recordActivity(state, 'story.imported', `${String(created.length)} 新增 / ${String(updated.length)} 更新 · ${project.name}`, {
		productId: product?.id,
		projectId: project.id,
		boardId: board?.id
	}, at);
	if (board !== undefined) warnings.push(...wipWarnings(state, board.id));
	return {
		ok: true,
		value: {
			product,
			project,
			board: board ?? null,
			created: created.length,
			updated: updated.length,
			stories: [...created, ...updated].map((story) => ({ id: story.id, key: story.key, title: story.title, status: story.status }))
		},
		warnings,
		changed: created.length > 0 || updated.length > 0
	};
}

/** Resolve or build a demo product/project/board with the nine reference stories. */
function seedDemo(state, { clock, at }) {
	const product = {
		id: newId('prd'),
		key: uniqueKey(state.products, 'DIDI'),
		name: '滴滴出行（学习项目）',
		description: '用郊区赶火车的真实链路练习用户故事与看板管理。',
		color: 'amber',
		repoUrl: '',
		localPath: '',
		createdAt: at,
		updatedAt: at
	};
	state.products.push(product);
	const project = {
		id: newId('prj'),
		productId: product.id,
		key: uniqueKey(state.projects, 'JC-Q4'),
		name: '郊区 → 火车站赶车场景',
		description: '从叫车到下车，覆盖决策、等待、行程、异常补救的端到端闭环。',
		objective: '让赶高铁的乘客在时间压力下能确定地叫到车、看到车、顺利到达。',
		startDate: '2026-11-10',
		endDate: '2026-12-08',
		status: 'active',
		createdAt: at,
		updatedAt: at
	};
	state.projects.push(project);
	const board = {
		id: newId('brd'),
		projectId: project.id,
		name: '迭代 1 · 叫车决策与等待安全感',
		goal: '叫车到下车的核心链路可用：预估、车型、路线、司机位置。',
		startDate: '2026-11-10',
		endDate: '2026-11-24',
		status: 'active',
		wip: {},
		createdAt: at,
		updatedAt: at
	};
	state.boards.push(board);
	const demoStories = [
		{
			key: 'US-01',
			title: '预估到达时间',
			asA: '赶高铁的乘客',
			iWant: '在叫车前看到各车型的预估到达时间',
			soThat: '判断现在叫车还来不来得及',
			acceptanceCriteria: [
				'默认展示时间最短车型的预送达时间',
				'预送达时间与实际到达偏差超过 5 分钟时提示“路况变化”',
				'无可用车辆时明确告知并给出替代方案'
			],
			priority: 'P1',
			estimate: 3,
			assignee: '张三',
			epic: '叫车决策',
			tags: ['地图', '预估', '赶车场景'],
			status: 'in_progress'
		},
		{
			key: 'US-02',
			title: '车型选择',
			asA: '带行李的乘客',
			iWant: '按人数和行李数量筛选车型',
			soThat: '避免叫到装不下行李的车',
			acceptanceCriteria: [
				'车型卡片展示座位数与行李容量',
				'超出预算时标注价格区间',
				'选中后保留选择直到下单'
			],
			priority: 'P1',
			estimate: 2,
			assignee: '李四',
			epic: '叫车决策',
			tags: ['车型', '筛选'],
			status: 'todo'
		},
		{
			key: 'US-03',
			title: '预约用车',
			asA: '提前规划行程的乘客',
			iWant: '预约未来 7 天内的用车时间',
			soThat: '赶早班车时不用临时抢车',
			acceptanceCriteria: [
				'支持选择日期与时间，最小粒度 15 分钟',
				'预约成功后可修改一次时间',
				'出发前 30 分钟推送司机与车辆信息'
			],
			priority: 'P1',
			estimate: 5,
			assignee: '王五',
			epic: '预约与调度',
			tags: ['预约', '调度'],
			status: 'done'
		},
		{
			key: 'US-04',
			title: '司机实时位置',
			asA: '在路边等待的乘客',
			iWant: '在地图上实时看到司机位置与预计到达时间',
			soThat: '知道还要等多久、在哪里等',
			acceptanceCriteria: [
				'地图每 5 秒刷新司机位置',
				'展示司机距上车点的距离与步行指引',
				'司机长时间未移动时提示联系司机'
			],
			priority: 'P1',
			estimate: 3,
			assignee: '张三',
			epic: '等待安全感',
			tags: ['地图', '实时'],
			status: 'verify'
		},
		{
			key: 'US-05',
			title: '应急联系人',
			asA: '独自出行的乘客',
			iWant: '在行程中一键分享行程给紧急联系人',
			soThat: '遇到异常时家人能知道我在哪',
			acceptanceCriteria: [
				'行程页提供“分享行程”入口',
				'分享内容包含车牌、司机与实时位置链接',
				'链接在行程结束后 2 小时失效'
			],
			priority: 'P2',
			estimate: 2,
			assignee: '李四',
			epic: '异常与补救',
			tags: ['安全', '分享'],
			status: 'backlog'
		},
		{
			key: 'US-06',
			title: '自动推荐最优路线（含高速）',
			asA: '赶高铁的乘客',
			iWant: '系统自动规划走高速或最快路线',
			soThat: '尽可能缩短行程时间',
			acceptanceCriteria: [
				'默认时间优先，同时给出高速优先选项',
				'拥堵时主动提示切换路线及预计节省时间',
				'高速费在预估价格中单列'
			],
			priority: 'P0',
			estimate: 3,
			assignee: '王五',
			epic: '行程中',
			tags: ['路线', '高速', '赶车场景'],
			status: 'todo',
			blocked: true,
			blockedReason: '依赖地图 API v2 的实时路况字段，尚未开通'
		},
		{
			key: 'US-07',
			title: '行程分享',
			asA: '与家人同行的乘客',
			iWant: '把当前行程分享到微信',
			soThat: '同行的人能同步看到进度',
			acceptanceCriteria: [
				'支持分享到微信与复制链接',
				'被分享人无需登录即可查看行程状态',
				'分享页不展示完整手机号'
			],
			priority: 'P2',
			estimate: 2,
			assignee: '赵六',
			epic: '等待安全感',
			tags: ['分享', '微信'],
			status: 'backlog'
		},
		{
			key: 'US-08',
			title: '下车点推荐',
			asA: '第一次去火车站的乘客',
			iWant: '系统推荐离进站口最近的下车点',
			soThat: '少走路、不绕到错误的广场',
			acceptanceCriteria: [
				'按车次与进站口推荐下车点',
				'展示下车后步行距离与预计耗时',
				'司机可一键导航到推荐下车点'
			],
			priority: 'P2',
			estimate: 3,
			assignee: '李四',
			epic: '到达与异常处理',
			tags: ['下车点', '火车站'],
			status: 'backlog'
		},
		{
			key: 'US-09',
			title: '误车补偿',
			asA: '因平台原因误车的乘客',
			iWant: '在线提交误车证明并申请补偿',
			soThat: '不用反复打客服电话',
			acceptanceCriteria: [
				'支持上传车票与误车证明',
				'明确展示可补偿金额与到账时间',
				'48 小时内给出审核结果'
			],
			priority: 'P1',
			estimate: 5,
			assignee: '赵六',
			epic: '异常与补救',
			tags: ['补偿', '客服'],
			status: 'backlog',
			blocked: true,
			blockedReason: '补偿规则未与法务确认'
		}
	];
	let rank = 1;
	for (const raw of demoStories) {
		const story = buildStory(state, { ...raw, projectId: project.id, boardId: board.id }, { projectId: project.id, boardId: board.id, status: raw.status }, clock);
		story.rank = rank;
		rank += 1;
		state.stories.push(story);
	}
	recordActivity(state, 'demo.seeded', '载入示例：滴滴赶车场景', { productId: product.id, projectId: project.id, boardId: board.id }, at);
	return { ok: true, value: { created: true, product, project, board, stories: demoStories.length }, changed: true };
}

/* -------------------------------------------------------------------------- */
/* Markdown import                                                            */
/* -------------------------------------------------------------------------- */

/** Strip Markdown emphasis and list markers from a line. */
const cleanLine = (line) => line.replace(/\*\*/g, '').replace(/__/g, '').trim();

/**
 * Parse a user-story document (the shape `user-story-crafter` writes) into
 * plain story objects. Deliberately tolerant: headings carrying `US-nn` start
 * a story, the Connextra sentence is read in Chinese or English, and both
 * bullet lists and Given/When/Then blocks become acceptance criteria.
 */
export function parseStoriesMarkdown(markdown) {
	if (typeof markdown !== 'string' || markdown.trim() === '') return [];
	const lines = markdown.split(/\r?\n/);
	const blocks = [];
	let current = null;

	/** A story starts on `**US-01：…**`, `#### US-01 …`, or a bare `US-01：…` line. */
	const storyStartOf = (line) => {
		const bold = /^\s*\*\*\s*(US[\s-_]?\d{1,4})\s*[：:.\-–—]?\s*(.*?)\s*\*\*\s*$/.exec(line);
		if (bold !== null) return { key: bold[1], title: bold[2].trim() };
		const heading = /^\s*#{2,6}\s+(?:\[[^\]]*\]\s*)?(US[\s-_]?\d{1,4})\s*[：:.\-–—]?\s*(.*)$/.exec(line);
		if (heading !== null) return { key: heading[1], title: heading[2].trim() };
		const plain = /^\s*(US[\s-_]?\d{1,4})\s*[：:.\-–—]\s*(.+)$/.exec(line);
		if (plain !== null) return { key: plain[1], title: plain[2].trim() };
		return null;
	};

	for (const line of lines) {
		const start = storyStartOf(line);
		if (start !== null) {
			if (current !== null) blocks.push(current);
			current = { key: start.key, title: start.title, lines: [] };
			continue;
		}
		if (/^\s*#{1,6}\s+/.test(line) === true) {
			if (current !== null) {
				blocks.push(current);
				current = null;
			}
			continue;
		}
		if (current !== null) current.lines.push(line);
	}
	if (current !== null) blocks.push(current);

	const stories = [];
	for (const block of blocks) {
		const joined = block.lines.join('\n');
		const key = normalizeStoryKey(block.key) ?? normalizeStoryKey(joined);
		const title = block.title
			.replace(/^\[[^\]]*\]\s*/, '')
			.replace(/\*\*/g, '')
			.trim();
		if (title === '') continue;
		const story = {
			key,
			title,
			asA: '',
			iWant: '',
			soThat: '',
			acceptanceCriteria: []
		};

		const cn = /作为(?:一个|一名|一位)?\s*([^，,。\n]+)[，,]\s*我(?:想要|希望|需要|要)\s*([^，,。\n]+)[，,]\s*以便(?:于)?\s*([^。\n]+)[。]?/.exec(joined.replace(/\n/g, ' '));
		const en = /As an?\s+([^,]+),\s*I\s+(?:want|need|would like)\s+([^,]+),\s*so that\s+([^.\n]+)[.]?/i.exec(joined.replace(/\n/g, ' '));
		const match = cn ?? en;
		if (match !== null) {
			story.asA = cleanLine(match[1]);
			story.iWant = cleanLine(match[2]);
			story.soThat = cleanLine(match[3]);
		}

		const priority = /(?:优先级|Priority)\s*[：:]\s*(P[0-3])/i.exec(joined);
		if (priority !== null) story.priority = priority[1].toUpperCase();
		const estimate = /(?:估算|故事点|Story\s*Points?|SP)\s*[：:]?\s*(\d+(?:\.\d+)?)/i.exec(joined);
		if (estimate !== null) story.estimate = Number(estimate[1]);
		const assignee = /(?:负责人|Assignee|Owner)\s*[：:]\s*@?([^\s，,|）)]+)/i.exec(joined);
		if (assignee !== null) story.assignee = assignee[1];
		const epic = /(?:Epic|史诗)\s*[：:]\s*([^\n]+)/i.exec(joined);
		if (epic !== null) story.epic = cleanLine(epic[1]);
		const tags = /(?:标签|Tags?)\s*[：:]\s*([^\n]+)/i.exec(joined);
		if (tags !== null) story.tags = normalizeTags(tags[1]);

		const criteria = [];
		let inAc = false;
		for (const rawLine of block.lines) {
			const line = cleanLine(rawLine);
			if (line === '') continue;
			if (/^(?:验收标准(?:[（(]AC[)）])?|AC|Acceptance\s+Criteria)\s*[：:]?\s*$/i.test(line) === true) {
				inAc = true;
				continue;
			}
			if (/^(?:优先级|Priority|估算|故事点|Story\s*Points?|SP|负责人|Assignee|Owner|标签|Tags?|Epic|史诗)\s*[：:]/i.test(line) === true) {
				inAc = false;
				continue;
			}
			if (/^(INVEST|假设|待确认|备注|附录)/i.test(line) === true) {
				inAc = false;
				continue;
			}
			const bullet = /^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line);
			if (bullet !== null) {
				if (inAc === true) criteria.push(bullet[1].replace(/\*\*/g, '').trim());
				continue;
			}
			if (/^(Given|When|Then|And|But)\b/i.test(line) === true) {
				criteria.push(line);
				inAc = true;
				continue;
			}
			if (inAc === true && criteria.length === 0) criteria.push(line);
		}
		story.acceptanceCriteria = normalizeAcceptance(criteria);
		stories.push(story);
	}
	return stories;
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/** File-backed, serialized command store. UI routes and agent tools share it. */
export class StoryBoardStore {
	/**
	 * @param {{ file?: string | null, clock?: () => string }} options
	 *   `file: null` gives an in-memory store for tests.
	 */
	constructor({ file = null, clock = () => new Date().toISOString() } = {}) {
		this.file = file;
		this.clock = clock;
		this._state = emptyState();
		this._loaded = false;
		this._loadError = null;
		this._mtimeMs = 0;
		this._queue = Promise.resolve();
	}

	/** Absolute path of the persisted document, when file-backed. */
	get path() {
		return this.file;
	}

	/**
	 * Load the document, re-reading it when another process changed the file
	 * since our last read/write. This keeps a UI process and an agent process
	 * sharing one store from serving stale snapshots; writes are still
	 * last-writer-wins across processes (within one process they serialize).
	 */
	async load() {
		if (this.file === null) {
			this._loaded = true;
			return this._state;
		}
		if (this._loaded === true) {
			try {
				const info = await stat(this.file);
				if (info.mtimeMs === this._mtimeMs) return this._state;
			} catch {
				return this._state;
			}
		}
		try {
			const info = await stat(this.file);
			this._state = normalizeState(JSON.parse(await readFile(this.file, 'utf8')));
			this._mtimeMs = info.mtimeMs;
			this._loadError = null;
		} catch (error) {
			if (error?.code === 'ENOENT') {
				if (this._loaded !== true) this._state = emptyState();
			} else {
				this._loadError = String(error?.message ?? error);
				if (this._loaded !== true) this._state = emptyState();
			}
		}
		this._loaded = true;
		return this._state;
	}

	/** Serialize one mutation (and its write) behind earlier ones. */
	_enqueue(task) {
		const run = this._queue.then(task, task);
		this._queue = run.then(() => undefined, () => undefined);
		return run;
	}

	/** Persist atomically with a temp file + rename. */
	async save() {
		if (this.file === null) return;
		await mkdir(dirname(this.file), { recursive: true });
		const temporary = `${this.file}.${String(process.pid)}.tmp`;
		await writeFile(temporary, `${JSON.stringify(this._state, null, 2)}\n`, 'utf8');
		await rename(temporary, this.file);
		try {
			this._mtimeMs = (await stat(this.file)).mtimeMs;
		} catch {
			this._mtimeMs = Date.now();
		}
	}

	/** Apply a command; never throws for caller mistakes. */
	async command(action, input = {}) {
		return this._enqueue(async () => {
			await this.load();
			// A command mutates in memory and then persists. If either the
			// mutation or the write fails, restore the pre-command document so
			// an unpersisted change never leaks into the next read.
			const before = structuredClone(this._state);
			try {
				const result = mutate(this._state, action, input, { clock: this.clock });
				if (result.changed !== false) await this.save();
				return result;
			} catch (error) {
				this._state = before;
				return {
					ok: false,
					error: {
						code: error?.code ?? 'command_failed',
						message: error?.message ?? String(error)
					}
				};
			}
		});
	}

	/** Read the whole document plus response metadata (statuses, priorities, load health). */
	async snapshot() {
		await this.load();
		return {
			...structuredClone(this._state),
			meta: {
				schemaVersion: SCHEMA_VERSION,
				statuses: STATUSES.map((status) => ({ ...status })),
				priorities: [...PRIORITIES],
				colors: [...PRODUCT_COLORS],
				loadError: this._loadError,
				storePath: this.file
			}
		};
	}

	/** Read one view with optional filters (used by the query tool). */
	async query(view, filters = {}) {
		await this.load();
		const state = this._state;
		const projectId = textOf(filters.projectId, 40);
		const boardId = textOf(filters.boardId, 40);
		const matches = (story) => {
			if (projectId !== '' && story.projectId !== projectId) return false;
			if (boardId !== '' && story.boardId !== boardId) return false;
			if (filters.status !== undefined && statusOf(filters.status) !== undefined && story.status !== statusOf(filters.status)) return false;
			if (filters.priority !== undefined && priorityOf(filters.priority) !== undefined && story.priority !== priorityOf(filters.priority)) return false;
			if (typeof filters.assignee === 'string' && filters.assignee !== '' && story.assignee !== filters.assignee) return false;
			if (typeof filters.epic === 'string' && filters.epic !== '' && story.epic !== filters.epic) return false;
			if (typeof filters.query === 'string' && filters.query.trim() !== '') {
				const needle = filters.query.trim().toLowerCase();
				const haystack = `${story.key} ${story.title} ${story.asA} ${story.iWant} ${story.soThat} ${story.tags.join(' ')} ${story.epic}`.toLowerCase();
				if (haystack.includes(needle) !== true) return false;
			}
			if (filters.includeDone === false && story.status === 'done') return false;
			return true;
		};

		switch (view) {
			case 'overview':
				return { view, ...summarize(state), activity: state.activity.slice(-12).reverse() };
			case 'products':
				return {
					view,
					items: state.products.map((product) => ({
						...product,
						projects: state.projects.filter((project) => project.productId === product.id).length,
						boards: state.boards.filter((board) => state.projects.some((project) => project.id === board.projectId && project.productId === product.id)).length,
						stories: state.stories.filter((story) => state.projects.some((project) => project.id === story.projectId && project.productId === product.id)).length
					}))
				};
			case 'projects':
				return {
					view,
					items: state.projects
						.filter((project) => projectId === '' || project.id === projectId)
						.filter((project) => filters.productId === undefined || project.productId === filters.productId)
						.map((project) => ({
							...project,
							product: state.products.find((product) => product.id === project.productId)?.name ?? '',
							boards: state.boards.filter((board) => board.projectId === project.id).length,
							stories: state.stories.filter((story) => story.projectId === project.id).length
						}))
				};
			case 'boards':
				return {
					view,
					items: state.boards
						.filter((board) => projectId === '' || board.projectId === projectId)
						.filter((board) => filters.projectId === undefined || board.projectId === filters.projectId)
						.map((board) => ({
							...board,
							project: state.projects.find((project) => project.id === board.projectId)?.name ?? '',
							stories: state.stories.filter((story) => story.boardId === board.id).length,
							wip: boardWip(state, board.id)
						}))
				};
			case 'stories':
				return {
					view,
					items: state.stories.filter(matches).sort((left, right) => left.boardId === right.boardId
						? (PRIORITY_RANK[left.priority] ?? 9) - (PRIORITY_RANK[right.priority] ?? 9) || left.rank - right.rank
						: String(left.boardId ?? '').localeCompare(String(right.boardId ?? ''))),
					total: state.stories.length
				};
			case 'story': {
				const story = state.stories.find((entry) => (filters.id !== undefined && entry.id === filters.id) || (filters.key !== undefined && entry.key === normalizeStoryKey(filters.key)) || (filters.query !== undefined && entry.key === normalizeStoryKey(filters.query)));
				if (story === undefined) return { view, story: null };
				return { view, story, project: state.projects.find((project) => project.id === story.projectId) ?? null, board: state.boards.find((board) => board.id === story.boardId) ?? null };
			}
			case 'board': {
				const board = state.boards.find((entry) => entry.id === (filters.boardId ?? ''));
				if (board === undefined) return { view, board: null, stories: [] };
				return {
					view,
					board,
					project: state.projects.find((project) => project.id === board.projectId) ?? null,
					stories: state.stories.filter((story) => story.boardId === board.id).sort((left, right) => left.rank - right.rank),
					wip: boardWip(state, board.id)
				};
			}
			default:
				throw new BadInput(`未知 view：${String(view)}`);
		}
	}
}
