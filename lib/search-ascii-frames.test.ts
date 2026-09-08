import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SEARCH_ASCII_FRAME_DELAY_MS,
  SEARCH_ASCII_FRAMES,
} from './search-ascii-frames';

void test('keeps the animated search loader within its fixed text canvas', () => {
  assert.equal(SEARCH_ASCII_FRAMES.length, 30);
  assert.equal(new Set(SEARCH_ASCII_FRAMES).size, 30);
  assert.equal(SEARCH_ASCII_FRAME_DELAY_MS, 140);

  for (const frame of SEARCH_ASCII_FRAMES) {
    const rows = frame.split('\n');
    assert.equal(rows.length, 53);
    assert.ok(rows.every((row) => row.length <= 60));
  }
});
