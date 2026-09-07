import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLinePlaybackRange,
  lyricLinesToRawText,
  MAX_LYRICS_LENGTH,
  validateLyricsInput,
  type LyricLine,
} from './lyrics';

void test('rejects empty and whitespace-only lyrics', () => {
  assert.throws(() => validateLyricsInput(''), /请先粘贴日语歌词/u);
  assert.throws(() => validateLyricsInput('   \n'), /请先粘贴日语歌词/u);
});

void test('rejects overlong lyrics', () => {
  assert.throws(
    () => validateLyricsInput('あ'.repeat(MAX_LYRICS_LENGTH + 1)),
    /20,000/u,
  );
});

void test('normalizes line endings while retaining blank stanzas', () => {
  assert.equal(validateLyricsInput('一行目\r\n\r\n二行目'), '一行目\n\n二行目');
});

void test('rebuilds editable source text while retaining stanza breaks', () => {
  const lines: LyricLine[] = [
    {
      japanese: '一行目',
      reading: 'いちぎょうめ',
      romaji: 'ichigyoume',
      chinesePhonetic: '一七 giou 咩',
      isBreak: false,
    },
    {
      japanese: '',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: true,
    },
    {
      japanese: '二行目',
      reading: 'にぎょうめ',
      romaji: 'nigyoume',
      chinesePhonetic: '尼 giou 咩',
      isBreak: false,
    },
  ];
  assert.equal(lyricLinesToRawText(lines), '一行目\n\n二行目');
});

void test('uses the next marked lyric as the current line end', () => {
  const lines: LyricLine[] = [
    {
      japanese: '一',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: false,
      startTime: 2.5,
    },
    {
      japanese: '',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: true,
    },
    {
      japanese: '二',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: false,
      startTime: 6.2,
    },
  ];
  assert.deepEqual(getLinePlaybackRange(lines, 0, 20), {
    start: 2.5,
    end: 6.2,
  });
  assert.deepEqual(getLinePlaybackRange(lines, 2, 20), { start: 6.2, end: 20 });
  assert.equal(getLinePlaybackRange(lines, 1, 20), null);
});
