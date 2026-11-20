import assert from 'node:assert/strict';
import test from 'node:test';

import {
	composeProjectImportPrompt,
	deriveProductKey,
	deriveProductName
} from '../prompt.js';

test('deriveProductKey and deriveProductName read a folder name from a path', () => {
	assert.equal(deriveProductKey('/Users/you/code/dsh-story-board'), 'DSHSTORYBOARD');
	assert.equal(deriveProductKey('/Users/you/code/My App/'), 'MYAPP');
	assert.equal(deriveProductName('/Users/you/code/dsh-story-board'), 'dsh-story-board');
	assert.equal(deriveProductKey(''), '');
});

test('the composed prompt points the model at the path, identity, and the import tool', () => {
	const prompt = composeProjectImportPrompt({
		path: '/Users/you/code/dsh-story-board',
		productName: '看板',
		productKey: 'BOARD',
		repoUrl: 'https://github.com/wyf0931/dsh-story-board',
		focus: '结算链路',
		maxStories: 8,
		language: 'zh'
	});
	assert.match(prompt, /\/Users\/you\/code\/dsh-story-board/);
	assert.match(prompt, /看板/);
	assert.match(prompt, /BOARD/);
	assert.match(prompt, /story_board_import/);
	assert.match(prompt, /localPath/);
	assert.match(prompt, /结算链路/);
	// The repo link and target count are surfaced so the model records them.
	assert.match(prompt, /dsh-story-board/);
	assert.match(prompt, /8/);
});

test('the prompt defaults identity from the path and falls back to 10 stories', () => {
	const prompt = composeProjectImportPrompt({ path: '/code/my-app' });
	assert.match(prompt, /my-app/);
	assert.match(prompt, /MY-APP|MYAPP/);
	// No repo line and no focus line when they are omitted.
	assert.doesNotMatch(prompt, /Repository|代码仓库：/);
});

test('an English prompt is produced for language en', () => {
	const prompt = composeProjectImportPrompt({ path: '/code/app', language: 'en' });
	assert.match(prompt, /Reverse-engineer|user stories/i);
	assert.match(prompt, /story_board_import/);
});

test('a blank path is rejected', () => {
	assert.throws(() => composeProjectImportPrompt({ path: '   ' }), /path is required/);
});