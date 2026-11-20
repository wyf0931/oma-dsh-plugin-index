/**
 * Browser-half smoke test: mounts the real panel in jsdom with the workspace's
 * React 18, feeds it a fully populated store snapshot through the same fetch
 * route the plugin uses, and checks the five tabs and the story drawer render.
 *
 * This catches the class of defect a syntax check cannot: undefined helpers,
 * wrong hook order, a crashing tab. It is not a visual verification.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import { STATUSES, PRIORITIES, emptyState, mutate } from '../store.js';

// The smoke test borrows React/jsdom from the sibling dsh-superagent checkout
// so the plugin itself stays dependency-free. Skip cleanly when that checkout
// is absent (or its dependencies are not installed).
const sibling = new URL('../../dsh-superagent/package.json', import.meta.url);
const hasSibling = existsSync(sibling);
const requireFromSuperagent = hasSibling ? createRequire(sibling) : undefined;
let JSDOM;
let React;
let ReactDOMClient;
let skipReason;
if (hasSibling) {
	try {
		JSDOM = requireFromSuperagent('jsdom').JSDOM;
		React = requireFromSuperagent('react');
		ReactDOMClient = requireFromSuperagent('react-dom/client');
	} catch (error) {
		skipReason = `sibling React/jsdom unavailable: ${String(error)}`;
	}
} else {
	skipReason = 'workspace has no dsh-superagent checkout with React/jsdom';
}

/** Build the snapshot the Host route would return, with the demo board. */
function demoSnapshot() {
	const clock = () => '2026-11-13T08:00:00.000Z';
	const state = emptyState();
	mutate(state, 'seed_demo', {}, { clock });
	// A project with no board: its row must still navigate to the board tab.
	mutate(state, 'create_project', { productId: state.products[0].id, name: '无板项目' }, { clock });
	mutate(state, 'update_product', {
		id: state.products[0].id,
		repoUrl: 'https://github.com/wyf0931/dsh-story-board',
		localPath: '/Users/scott/Documents/dsh-workspace/dsh-story-board'
	}, { clock });
	return {
		...structuredClone(state),
		meta: {
			schemaVersion: 1,
			statuses: STATUSES.map((status) => ({ ...status })),
			priorities: [...PRIORITIES],
			colors: ['blue', 'green', 'amber', 'red', 'slate']
		}
	};
}

test('client panel mounts, switches tabs, and opens a story', { skip: skipReason }, async () => {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:56150/' });
	const { window } = dom;
	global.window = window;
	global.document = window.document;
	global.Node = window.Node;
	global.Element = window.Element;
	global.HTMLElement = window.HTMLElement;
	global.Event = window.Event;
	global.MouseEvent = window.MouseEvent;
	global.getComputedStyle = window.getComputedStyle.bind(window);
	// React 18's legacy input-event polyfill probes these on the active element;
	// jsdom has neither, and the probe throws for every focused field.
	for (const name of ['attachEvent', 'detachEvent']) {
		if (typeof window.HTMLElement.prototype[name] !== 'function') window.HTMLElement.prototype[name] = () => {};
	}

	let plugin;
	let mainComponent;
	const dictionaries = {};
	const registered = [];

	window.__ModuleLoader__ = {
		load({ id, factory }) {
			assert.equal(id, 'dsh-story-board');
			plugin = factory((name) => {
				if (name === 'react') return requireFromSuperagent('react');
				if (name === 'react-dom') return requireFromSuperagent('react-dom');
				throw new Error(`unexpected module: ${name}`);
			});
		}
	};


	let lastCommand = null;
	let pickCalls = 0;
	let startedConversation = null;
	// The panel fills the composer through the `uiWorkspace` client service; stub
	// it so the smoke test can assert the composed prompt actually lands there.
	const uiWorkspaceStub = {
		startSession(workspaceId, options) {
			startedConversation = { workspaceId, prompt: options?.prompt ?? '' };
		}
	};
	window.fetch = async (url, options) => {
		const path = String(url);
		if (path.includes('api/story-board/state')) {
			assert.equal(JSON.parse(options.body ?? '{}')?.action, undefined);
			return new Response(JSON.stringify({ ok: true, value: demoSnapshot() }), { headers: { 'content-type': 'application/json' } });
		}
		if (path.includes('api/story-board/command')) {
			lastCommand = JSON.parse(options.body ?? '{}');
			return new Response(JSON.stringify({ ok: true, value: { product: {} }, warnings: [] }), { headers: { 'content-type': 'application/json' } });
		}
		if (path.includes('api/story-board/pick-directory')) {
			pickCalls += 1;
			// 1st: product editor picks a path; 3rd: the import dialog picks its own.
			const picked = pickCalls === 1 ? '/Users/tester/code' : pickCalls === 3 ? '/Users/tester/code/demo' : null;
			return new Response(JSON.stringify({ ok: true, value: { path: picked } }), { headers: { 'content-type': 'application/json' } });
		}
		if (path.includes('api/story-board/compose-import')) {
			const body = JSON.parse(options.body ?? '{}');
			assert.equal(body.path, '/Users/tester/code/demo');
			return new Response(JSON.stringify({
				ok: true,
				value: { prompt: '探查 ' + body.path + ' 并把用户故事落到看板', productName: 'dsh-story-board', productKey: 'DSHSTORYBOARD', path: body.path }
			}), { headers: { 'content-type': 'application/json' } });
		}
		throw new Error(`unexpected fetch: ${path}`);
	};
	global.fetch = window.fetch;

	await import('../client.js');
	assert.ok(plugin, 'client module registered a factory');

	plugin.apply({
		get(name) {
			return name === 'uiWorkspace' ? uiWorkspaceStub : undefined;
		},
		effect(fn) {
			const dispose = fn();
			registered.push(dispose);
			return dispose;
		},
		locale: {
			register(namespace, dict) {
				dictionaries[namespace] = dict;
			},
			bind(namespace) {
				const dict = dictionaries[namespace]?.zh ?? {};
				return (key, vars) => {
					const raw = dict[key] ?? key;
					return vars === undefined ? raw : raw.replace(/\{(\w+)\}/g, (whole, name) => vars[name] === undefined ? whole : String(vars[name]));
				};
			}
		},
		slots: {
			inject(_name, callback) {
				callback();
			},
			register(options, component) {
				if (options.name === 'main') mainComponent = component;
				return () => undefined;
			}
		}
	});

	assert.equal(typeof mainComponent, 'function');
	const root = ReactDOMClient.createRoot(document.getElementById('root'));
	root.render(React.createElement(mainComponent, {}));
	await new Promise((resolve) => setTimeout(resolve, 80));

	const text = () => document.body.textContent;

	assert.match(text(), /用户故事看板/);
	assert.match(text(), /概览/);
	assert.match(text(), /US-06/);
	assert.match(text(), /故事9/);

	// Products tab: the card exposes the new code links, and the editor
	// round-trips them through the folder picker and the command route.
	const productsTab = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('产品'));
	assert.ok(productsTab, 'products tab button exists');
	productsTab.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.match(text(), /wyf0931\/dsh-story-board/);
	assert.match(text(), /dsh-workspace\/dsh-story-board/);

	const editButton = document.querySelector('.sb-prod button[title="编辑"]');
	assert.ok(editButton, 'product edit button exists');
	editButton.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.match(text(), /代码关联/);
	assert.match(text(), /代码仓库/);
	assert.match(text(), /本地项目路径/);

	const repoInput = document.querySelector('.sb-modal input[value="https://github.com/wyf0931/dsh-story-board"]');
	const pathInput = document.querySelector('.sb-modal input[placeholder="/Users/you/code/project"]');
	assert.ok(repoInput, 'repository input is prefilled');
	assert.ok(pathInput, 'local path input exists');

	const chooseButton = [...document.querySelectorAll('.sb-modal button')].find((button) => button.textContent.trim() === '选择…');
	assert.ok(chooseButton, 'system folder picker trigger exists');
	chooseButton.click();
	await new Promise((resolve) => setTimeout(resolve, 80));
	assert.equal(pathInput.value, '/Users/tester/code');

	// Cancelling the native chooser leaves the path untouched.
	chooseButton.click();
	await new Promise((resolve) => setTimeout(resolve, 80));
	assert.equal(pathInput.value, '/Users/tester/code');

	const saveButton = [...document.querySelectorAll('.sb-modal button')].find((button) => button.textContent.trim() === '保存');
	assert.ok(saveButton, 'product save button exists');
	saveButton.click();
	await new Promise((resolve) => setTimeout(resolve, 80));
	assert.equal(lastCommand?.action, 'update_product');
	assert.equal(lastCommand?.repoUrl, 'https://github.com/wyf0931/dsh-story-board');
	assert.equal(lastCommand?.localPath, '/Users/tester/code');

	// Import-product dialog: compose a reverse-engineering prompt for a path.
	const importButton = [...document.querySelectorAll('.sb-toolbar button')].find((button) => button.textContent.trim() === '导入产品');
	assert.ok(importButton, 'import product button exists in the products toolbar');
	importButton.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.match(text(), /从已有项目导入产品/);
	assert.match(text(), /本地项目路径/);
	assert.match(text(), /生成提示词/);

	const runButton = () => [...document.querySelectorAll('.sb-modal button')].find((button) => button.textContent.trim() === '在 DSH 中运行');
	assert.ok(runButton(), 'run-in-DSH button exists');
	assert.equal(runButton().disabled, true, 'run button is disabled before a prompt is composed');

	const pickImportPath = [...document.querySelectorAll('.sb-modal button')].find((button) => button.textContent.trim() === '选择…');
	assert.ok(pickImportPath, 'import dialog folder picker exists');
	pickImportPath.click();
	await new Promise((resolve) => setTimeout(resolve, 80));
	const importPathInput = document.querySelector('.sb-modal input[placeholder="/Users/you/code/project"]');
	assert.equal(importPathInput?.value, '/Users/tester/code/demo');
	await new Promise((resolve) => setTimeout(resolve, 30));

	const composeButton = [...document.querySelectorAll('.sb-modal button')].find((button) => button.textContent.trim() === '生成提示词');
	assert.ok(composeButton, 'compose button exists');
	composeButton.click();
	await new Promise((resolve) => setTimeout(resolve, 80));

	const promptArea = document.querySelector('.sb-modal textarea.sb-import-prompt');
	assert.ok(promptArea, 'prompt textarea exists');
	assert.match(promptArea.value, /探查 \/Users\/tester\/code\/demo/);
	assert.equal(runButton().disabled, false, 'run button is enabled after composing');
	assert.match(text(), /复制提示词/);

	// Running hands the prompt to a DSH conversation through uiWorkspace.startSession.
	runButton().click();
	await new Promise((resolve) => setTimeout(resolve, 80));
	assert.match(startedConversation?.prompt ?? '', /探查 \/Users\/tester\/code\/demo/);
	assert.equal(startedConversation?.workspaceId, undefined, 'opens in the current workspace');
	assert.equal(document.querySelector('.sb-modal'), null, 'import dialog closed after run');

	// Board tab: five status columns and the demo cards.
	const boardTab = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('看板'));
	assert.ok(boardTab, 'board tab button exists');
	boardTab.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.match(text(), /待开发/);
	assert.match(text(), /开发中/);
	assert.match(text(), /US-01/);
	assert.match(text(), /预估到达时间/);
	assert.match(text(), /1\/3/);

	// Click the first card: the story drawer should open with the Connextra fields.
	const card = document.querySelector('.sb-card');
	assert.ok(card, 'a story card exists');
	card.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.match(text(), /编辑故事/);
	assert.match(text(), /验收标准/);
	assert.match(text(), /作为一个/);

	// Close the drawer, then confirm a board-less project row navigates to the
	// board tab's empty state instead of silently staying on the projects tab.
	const closeDrawer = document.querySelector('.sb-drawer button[aria-label="Close"]');
	assert.ok(closeDrawer, 'story drawer close button exists');
	closeDrawer.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	const projectsTab = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('项目'));
	assert.ok(projectsTab, 'projects tab exists');
	projectsTab.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	const boardlessRow = [...document.querySelectorAll('.sb-row')].find((row) => row.textContent.includes('无板项目'));
	assert.ok(boardlessRow, 'board-less project row is listed');
	boardlessRow.click();
	await new Promise((resolve) => setTimeout(resolve, 60));
	assert.match(text(), /这个项目还没有看板/);

	root.unmount();
	dom.window.close();
});
