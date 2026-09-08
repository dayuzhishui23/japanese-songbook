import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeLyricIndexAtTime,
  adjacentLyricIndex,
  getLinePlaybackRange,
  lyricLinesToRawText,
  lyricTrackToText,
  lyricTracksToText,
  MAX_LYRICS_LENGTH,
  setLyricStartTime,
  validateLyricsInput,
  type LyricLine,
} from './lyrics';

void test('rejects empty and whitespace-only lyrics', () => {
  assert.throws(() => validateLyricsInput(''), /请先粘贴歌词/u);
  assert.throws(() => validateLyricsInput('   \n'), /请先粘贴歌词/u);
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
  assert.equal(lyricTrackToText(lines, 'japanese'), '一行目\n\n二行目');
  assert.equal(lyricTrackToText(lines, 'romaji'), 'ichigyoume\n\nnigyoume');
  assert.equal(
    lyricTrackToText(lines, 'chinesePhonetic'),
    '一七 giou 咩\n\n尼 giou 咩',
  );
  assert.equal(
    lyricTracksToText(lines, ['japanese', 'romaji', 'chinesePhonetic']),
    '一行目\nichigyoume\n一七 giou 咩\n\n\n二行目\nnigyoume\n尼 giou 咩',
  );
  assert.equal(lyricTracksToText(lines, []), '');
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

void test('moves between lyric lines while skipping stanza breaks', () => {
  const lines: LyricLine[] = [
    {
      japanese: '一',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
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
      japanese: '二',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: false,
    },
  ];
  assert.equal(adjacentLyricIndex(lines, null, 1), 0);
  assert.equal(adjacentLyricIndex(lines, 0, 1), 2);
  assert.equal(adjacentLyricIndex(lines, 2, -1), 0);
  assert.equal(adjacentLyricIndex(lines, 2, 1), null);
});

void test('finds the active timed lyric during playback', () => {
  const lines: LyricLine[] = [
    {
      japanese: '一',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: false,
      startTime: 2,
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
      startTime: 5,
    },
  ];
  assert.equal(activeLyricIndexAtTime(lines, 1.9), null);
  assert.equal(activeLyricIndexAtTime(lines, 2), 0);
  assert.equal(activeLyricIndexAtTime(lines, 6), 2);
});

void test('sets a rounded lyric start without changing other lines', () => {
  const lines: LyricLine[] = [
    {
      japanese: '一',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: false,
    },
    {
      japanese: '二',
      reading: '',
      romaji: '',
      chinesePhonetic: '',
      isBreak: false,
    },
  ];
  const updated = setLyricStartTime(lines, 0, 2.56);
  assert.equal(updated[0]?.startTime, 2.6);
  assert.equal(updated[1], lines[1]);
  assert.equal(setLyricStartTime(lines, 5, 1), lines);
});
