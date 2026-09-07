import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTimedLrc, timedLyricsToText } from './online-music';

void test('parses timestamps, milliseconds, and multiple time tags', () => {
  assert.deepEqual(
    parseTimedLrc('[00:01.20][00:03.250]夢ならば\r\n[01:02]今でも'),
    [
      { text: '夢ならば', startTime: 1.2 },
      { text: '夢ならば', startTime: 3.25 },
      { text: '今でも', startTime: 62 },
    ],
  );
});

void test('drops metadata and production credits', () => {
  assert.deepEqual(
    parseTimedLrc('[ar:米津玄師]\n[00:00.10]作词：米津玄師\n[00:05.00]歌う'),
    [{ text: '歌う', startTime: 5 }],
  );
});

void test('builds converter input without embedding timestamps', () => {
  assert.equal(
    timedLyricsToText([
      { text: '一行目', startTime: 1 },
      { text: '二行目', startTime: 3 },
    ]),
    '一行目\n二行目',
  );
});
