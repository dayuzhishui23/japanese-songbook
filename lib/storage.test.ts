import assert from 'node:assert/strict';
import test from 'node:test';

import { clearLyricsStorage, LYRICS_STORAGE_KEY } from './storage';

void test('clears only the versioned lyrics entry', () => {
  const removedKeys: string[] = [];
  clearLyricsStorage({ removeItem: (key) => removedKeys.push(key) });
  assert.deepEqual(removedKeys, [LYRICS_STORAGE_KEY]);
});
