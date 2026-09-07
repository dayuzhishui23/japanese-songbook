import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_LYRICS_LENGTH, validateLyricsInput } from './lyrics';

void test('rejects empty and whitespace-only lyrics', () => {
  assert.throws(() => validateLyricsInput(''), /请先粘贴日语歌词/u);
  assert.throws(() => validateLyricsInput('   \n'), /请先粘贴日语歌词/u);
});

void test('rejects overlong lyrics', () => {
  assert.throws(() => validateLyricsInput('あ'.repeat(MAX_LYRICS_LENGTH + 1)), /20,000/u);
});

void test('normalizes line endings while retaining blank stanzas', () => {
  assert.equal(validateLyricsInput('一行目\r\n\r\n二行目'), '一行目\n\n二行目');
});
