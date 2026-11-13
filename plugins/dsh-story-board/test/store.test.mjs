import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	StoryBoardStore,
	emptyState,
	mutate,
	normalizeLocalPath,
	normalizeRepoUrl,
	normalizeState,
	parseStoriesMarkdown,
	priorityOf,
	statusOf,
	summarize,
	wipWarnings
} from '../store.js';

const clockOf = (() => {
	let tick = 0;
	return () => new Date(Date.UTC(2026, 10, 13, 8, 0, tick++)).toISOString();
})();

const fresh = () => emptyState();
const product = (state, overrides = {}) => mutate(state, 'create_product', { name: '滴滴出行', key: 'DIDI', ...overrides }, { clock: clockOf });
const project = (state, productId, overrides = {}) => mutate(state, 'create_project', { productId, name: '郊区赶车', ...overrides }, { clock: clockOf });
const board = (state, projectId, overrides = {}) => mutate(state, 'create_board', { projectId, name: '迭代 1', ...overrides }, { clock: clockOf });
const story = (state, projectId, boardId, overrides = {}) => mutate(state, 'create_story', { projectId, boardId, title: '预估到达时间', ...overrides }, { clock: clockOf });

const SAMPLE_MARKDOWN = `# 用户故事文档：郊区打车赶高铁

## 2. Epic

**郊区用户打车前往交通枢纽的完整出行闭环**

## 3. User Story 列表

#### 阶段 A：出发前 — 决策与叫车

**US-01：预估到达时间，判断是否来得及**

作为一个住在郊区的乘客，
我想要输入目的地后看到「预计到达火车站的时间」，
以便于判断是否能赶上高铁。

AC
- Given 用户输入起点和终点
- When 系统返回预估结果
- Then 显示预计行程时长
- And 若晚于发车时间则给出警示

**US-02：选择适合长途/赶时间的车型**

作为一个赶高铁的乘客，
我想要在车型列表中看到「适合长途」标签，
以便于选择更可靠、更快的车型。

AC
- Given 行程距离 > 30 km
- When 展示车型列表
- Then 对拼车标注「耗时较长」

优先级：P1
估算：3 Story Point
负责人：@张三
标签：地图, 路线

## 4. INVEST 质量自查

| 原则 | 是否满足 |
|------|----------|
| Independent 独立 | ✅ |
`;

test('status and priority accept canonical and Chinese aliases', () => {
	assert.equal(statusOf('开发中'), 'in_progress');
	assert.equal(statusOf('In Progress'), 'in_progress');
	assert.equal(statusOf('done'), 'done');
	assert.equal(statusOf('nope'), undefined);
	assert.equal(priorityOf('高'), 'P0');
	assert.equal(priorityOf(1), 'P1');
	assert.equal(priorityOf('p3'), 'P3');
});

test('product → project → board → story keeps keys and relationships', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	assert.equal(createdProduct.key, 'DIDI');
	assert.equal(createdProject.key, 'PRJ');

	const createdBoard = board(state, createdProject.id).value.board;
	const first = story(state, createdProject.id, createdBoard.id, { title: '预估到达时间' }).value.story;
	const second = story(state, createdProject.id, createdBoard.id, { title: '车型选择' }).value.story;
	assert.equal(first.key, 'US-01');
	assert.equal(second.key, 'US-02');
	assert.equal(first.status, 'todo');
	assert.equal(second.boardId, createdBoard.id);

	const summary = summarize(state);
	assert.equal(summary.counts.stories, 2);
	assert.equal(summary.byStatus.todo, 2);
});

test('product code links normalize aliases and persist through updates', () => {
	assert.equal(normalizeRepoUrl('owner/repo'), 'https://github.com/owner/repo');
	assert.equal(normalizeRepoUrl('git@github.com:owner/repo.git'), 'https://github.com/owner/repo');
	assert.equal(normalizeRepoUrl('https://github.com/owner/repo.git/'), 'https://github.com/owner/repo');
	assert.equal(normalizeRepoUrl('ssh://git@github.com/owner/repo.git'), 'https://github.com/owner/repo');
	assert.equal(normalizeRepoUrl(''), '');
	assert.equal(normalizeRepoUrl('javascript:alert(1)'), '');
	assert.equal(normalizeLocalPath('  "~/code/app/"  '), '~/code/app');

	const state = fresh();
	const created = mutate(state, 'create_product', {
		name: '代码关联',
		repository: 'git@github.com:wyf0931/dsh-story-board.git',
		projectHome: '~/Documents/dsh-workspace/dsh-story-board/'
	}, { clock: clockOf }).value.product;
	assert.equal(created.repoUrl, 'https://github.com/wyf0931/dsh-story-board');
	assert.equal(created.localPath, '~/Documents/dsh-workspace/dsh-story-board');

	mutate(state, 'update_product', { id: created.id, description: '只改描述' }, { clock: clockOf });
	assert.equal(state.products[0].repoUrl, 'https://github.com/wyf0931/dsh-story-board');
	assert.equal(state.products[0].localPath, '~/Documents/dsh-workspace/dsh-story-board');

	mutate(state, 'update_product', { id: created.id, repoUrl: 'wyf0931/other', localPath: '' }, { clock: clockOf });
	const updated = state.products[0];
	assert.equal(updated.repoUrl, 'https://github.com/wyf0931/other');
	assert.equal(updated.localPath, '');

	const normalized = normalizeState({ products: [{ name: '旧文档', repo: { url: 'github.com/a/b' }, homePath: '/code/b/' }] });
	assert.equal(normalized.products[0].repoUrl, 'https://github.com/a/b');
	assert.equal(normalized.products[0].localPath, '/code/b');
});

test('story without a board lands in the project backlog', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	const created = story(state, createdProject.id, undefined, { title: '误车补偿' }).value.story;
	assert.equal(created.boardId, null);
	assert.equal(created.status, 'backlog');
});

test('moving a story updates status, rank, and reports a WIP breach', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	const createdBoard = board(state, createdProject.id).value.board;
	const ids = [];
	for (let index = 0; index < 4; index += 1) {
		const created = story(state, createdProject.id, createdBoard.id, { title: `故事 ${String(index + 1)}` }).value.story;
		ids.push(created.id);
		mutate(state, 'move_story', { id: created.id, status: 'in_progress' }, { clock: clockOf });
	}
	const fourth = state.stories.find((entry) => entry.id === ids[3]);
	assert.equal(fourth.status, 'in_progress');
	const warnings = wipWarnings(state, createdBoard.id);
	assert.equal(warnings.length, 1);
	assert.equal(warnings[0].code, 'wip_exceeded');
	assert.equal(warnings[0].count, 4);
	assert.equal(warnings[0].limit, 3);
});

test('move_story orders before a sibling with a midpoint rank', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	const createdBoard = board(state, createdProject.id).value.board;
	const one = story(state, createdProject.id, createdBoard.id, { title: 'A' }).value.story;
	const two = story(state, createdProject.id, createdBoard.id, { title: 'B' }).value.story;
	const three = story(state, createdProject.id, createdBoard.id, { title: 'C' }).value.story;
	mutate(state, 'move_story', { id: three.id, status: 'todo', beforeStoryId: one.id }, { clock: clockOf });
	const moved = state.stories.find((entry) => entry.id === three.id);
	assert.ok(moved.rank < one.rank);
	const ordered = state.stories.filter((entry) => entry.status === 'todo').sort((left, right) => left.rank - right.rank);
	assert.deepEqual(ordered.map((entry) => entry.title), ['C', 'A', 'B']);
	void two;
});

test('markdown import reads the user-story-crafter template shape', () => {
	const parsed = parseStoriesMarkdown(SAMPLE_MARKDOWN);
	assert.equal(parsed.length, 2);
	assert.equal(parsed[0].key, 'US-01');
	assert.equal(parsed[0].title, '预估到达时间，判断是否来得及');
	assert.match(parsed[0].asA, /住在郊区/);
	assert.match(parsed[0].iWant, /预计到达火车站的时间/);
	assert.match(parsed[0].soThat, /赶上高铁/);
	assert.equal(parsed[0].acceptanceCriteria.length, 4);
	assert.match(parsed[0].acceptanceCriteria[0].text, /^Given 用户输入起点和终点/);
	assert.equal(parsed[1].priority, 'P1');
	assert.equal(parsed[1].estimate, 3);
	assert.equal(parsed[1].assignee, '张三');
	assert.deepEqual(parsed[1].tags, ['地图', '路线']);
});

test('import is idempotent by story key and can create the whole hierarchy', () => {
	const state = fresh();
	const first = mutate(state, 'import_stories', {
		productName: '滴滴出行',
		projectName: '郊区赶车',
		boardName: '迭代 1',
		markdown: SAMPLE_MARKDOWN
	}, { clock: clockOf });
	assert.equal(first.ok, true);
	assert.equal(first.value.created, 2);
	assert.equal(state.products.length, 1);
	assert.equal(state.projects.length, 1);
	assert.equal(state.boards.length, 1);

	const second = mutate(state, 'import_stories', {
		projectId: first.value.project.id,
		boardId: first.value.board.id,
		markdown: SAMPLE_MARKDOWN
	}, { clock: clockOf });
	assert.equal(second.value.created, 0);
	assert.equal(second.value.updated, 2);
	assert.equal(state.stories.length, 2);
});

test('structured import accepts an array and maps alternate field names', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	const result = mutate(state, 'import_stories', {
		projectId: createdProject.id,
		stories: [
			{ key: 'US-07', name: '行程分享', role: '乘客', want: '分享行程', benefit: '家人放心', ac: ['支持微信', '链接可撤销'], points: 2, priority: 'P1' }
		]
	}, { clock: clockOf });
	assert.equal(result.value.created, 1);
	const imported = state.stories[0];
	assert.equal(imported.key, 'US-07');
	assert.equal(imported.asA, '乘客');
	assert.equal(imported.iWant, '分享行程');
	assert.equal(imported.estimate, 2);
	assert.equal(imported.acceptanceCriteria.length, 2);
});

test('deleting a product cascades to projects, boards, and stories', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	const createdBoard = board(state, createdProject.id).value.board;
	story(state, createdProject.id, createdBoard.id, { title: 'A' });
	const result = mutate(state, 'delete_product', { id: createdProduct.id }, { clock: clockOf });
	assert.equal(result.value.deleted.projects, 1);
	assert.equal(result.value.deleted.boards, 1);
	assert.equal(result.value.deleted.stories, 1);
	assert.equal(state.products.length, 0);
	assert.equal(state.stories.length, 0);
});

test('a board WIP override of null removes the default limit', () => {
	const state = fresh();
	const createdProduct = product(state).value.product;
	const createdProject = project(state, createdProduct.id).value.project;
	const createdBoard = board(state, createdProject.id, { wip: { in_progress: null } }).value.board;
	for (let index = 0; index < 4; index += 1) {
		const created = story(state, createdProject.id, createdBoard.id, { title: `W${String(index)}`, status: 'in_progress' }).value.story;
		assert.equal(created.status, 'in_progress');
	}
	assert.deepEqual(wipWarnings(state, createdBoard.id), []);
});

test('import refuses to create an orphan product without a project target', () => {
	const state = fresh();
	const result = (() => {
		try {
			return mutate(state, 'import_stories', { productName: '只有产品', markdown: SAMPLE_MARKDOWN }, { clock: clockOf });
		} catch (error) {
			return { error };
		}
	})();
	assert.ok(result.error, 'import throws');
	assert.equal(state.products.length, 0);
});

test('seed_demo builds the nine reference stories and is idempotent', () => {
	const state = fresh();
	const result = mutate(state, 'seed_demo', {}, { clock: clockOf });
	assert.equal(result.value.created, true);
	assert.equal(state.stories.length, 9);
	assert.equal(state.boards.length, 1);
	assert.equal(state.stories.filter((entry) => entry.blocked === true).length, 2);
	const again = mutate(state, 'seed_demo', {}, { clock: clockOf });
	assert.equal(again.value.created, false);
	assert.equal(state.stories.length, 9);
});

test('reset_store clears everything and can reseed only the demo', () => {
	const state = fresh();
	mutate(state, 'seed_demo', {}, { clock: clockOf });
	mutate(state, 'create_product', { name: '临时产品' }, { clock: clockOf });
	const result = mutate(state, 'reset_store', { seedDemo: true }, { clock: clockOf });
	assert.equal(result.value.reset, true);
	assert.equal(state.products.length, 1);
	assert.equal(state.products[0].key, 'DIDI');
	assert.equal(state.stories.length, 9);
	assert.equal(state.activity.every((entry) => entry.kind === 'demo.seeded'), true);

	const empty = mutate(state, 'reset_store', { seedDemo: false }, { clock: clockOf });
	assert.equal(empty.value.seeded, false);
	assert.equal(state.products.length, 0);
	assert.equal(state.activity.length, 0);
});

test('normalizeState tolerates partial and damaged documents', () => {
	const state = normalizeState({ products: [{ name: 'X' }], stories: [{ title: 'S', status: '开发中', priority: 1 }] });
	assert.equal(state.products.length, 1);
	assert.equal(state.stories.length, 1);
	assert.equal(state.stories[0].status, 'in_progress');
	assert.equal(state.stories[0].priority, 'P1');
	assert.equal(normalizeState(null).products.length, 0);
});

test('store persists commands atomically and reloads them', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-story-board-'));
	const file = join(dir, 'store.json');
	try {
		const store = new StoryBoardStore({ file, clock: clockOf });
		const created = await store.command('create_product', {
			name: '文档系统',
			repoUrl: 'https://github.com/wyf0931/dsh-story-board',
			localPath: '/Users/tester/code/dsh-story-board'
		});
		assert.equal(created.ok, true);
		const snapshot = await store.snapshot();
		assert.equal(snapshot.products.length, 1);
		assert.equal(snapshot.meta.statuses.length, 5);

		const reloaded = new StoryBoardStore({ file, clock: clockOf });
		const second = await reloaded.snapshot();
		assert.equal(second.products[0].name, '文档系统');
		assert.equal(second.products[0].repoUrl, 'https://github.com/wyf0931/dsh-story-board');
		assert.equal(second.products[0].localPath, '/Users/tester/code/dsh-story-board');

		const bad = await store.command('create_story', { title: '没有项目' });
		assert.equal(bad.ok, false);
		assert.equal(bad.error.code, 'bad_input');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('a failed write rolls the in-memory document back', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-story-board-'));
	const file = join(dir, 'store.json');
	try {
		const store = new StoryBoardStore({ file, clock: clockOf });
		await store.command('create_product', { name: '先有一个', key: 'ONE' });
		store.save = async () => {
			throw new Error('disk full');
		};
		const failed = await store.command('create_product', { name: '不该留下', key: 'TWO' });
		assert.equal(failed.ok, false);
		const snapshot = await store.snapshot();
		assert.equal(snapshot.products.length, 1);
		assert.equal(snapshot.products[0].key, 'ONE');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('two store instances sharing a file see each other\'s writes', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-story-board-'));
	const file = join(dir, 'store.json');
	try {
		const first = new StoryBoardStore({ file, clock: clockOf });
		const created = await first.command('create_product', { name: '跨进程', key: 'SHARED' });
		assert.equal(created.ok, true);

		const second = new StoryBoardStore({ file, clock: clockOf });
		const seen = await second.snapshot();
		assert.equal(seen.products.length, 1);

		const project = await second.command('create_project', { productId: seen.products[0].id, name: '第二个进程建的项目' });
		assert.equal(project.ok, true);

		const refreshed = await first.snapshot();
		assert.equal(refreshed.projects.length, 1);
		assert.equal(refreshed.projects[0].name, '第二个进程建的项目');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('concurrent commands serialize without losing writes', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'dsh-story-board-'));
	const file = join(dir, 'store.json');
	try {
		const store = new StoryBoardStore({ file, clock: clockOf });
		const created = await store.command('create_product', { name: '并发' });
		await Promise.all(Array.from({ length: 8 }, (_, index) => store.command('create_project', {
			productId: created.value.product.id,
			name: `项目 ${String(index)}`
		})));
		const snapshot = await store.snapshot();
		assert.equal(snapshot.projects.length, 8);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
