import assert from 'node:assert/strict';
import test from 'node:test';

import { nativePickerOf } from '../index.js';

test('nativePickerOf resolves only the native capability', async () => {
	const pick = async () => '/Users/tester/code';
	const native = nativePickerOf({
		get: (name) => name === 'directoryPicker' ? { capability: () => ({ kind: 'native', pick }) } : undefined
	});
	assert.equal(typeof native?.pick, 'function');
	assert.equal(await native.pick(), '/Users/tester/code');

	const browse = nativePickerOf({
		get: () => ({ capability: () => ({ kind: 'browse' }) })
	});
	assert.equal(browse, undefined);
	assert.equal(nativePickerOf({ get: () => undefined }), undefined);
});

test('nativePickerOf tolerates a missing or throwing seam', () => {
	assert.equal(nativePickerOf({ get: () => { throw new Error('not composed'); } }), undefined);
});
