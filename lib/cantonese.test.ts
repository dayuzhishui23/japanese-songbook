import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cantoneseToJyutping,
  getCantoneseCandidates,
  jyutpingToChinese,
} from './cantonese';
import { convertLyrics, regenerateLyricLine } from './lyrics';

void test('converts Cantonese lyrics to standard Jyutping with tone numbers', async () => {
  assert.equal(
    await cantoneseToJyutping('我鍾意唱歌'),
    'ngo5 zung1 ji3 coeng3 go1',
  );
  assert.equal(
    await cantoneseToJyutping('你好，世界！'),
    'nei5 hou2， sai3 gaai3！',
  );
});

void test('creates readable Chinese hints and keeps checked-tone codas', () => {
  assert.equal(
    jyutpingToChinese('ngo5 zung1 ji3 coeng3 go1'),
    'ng哦 宗 衣 昌 哥',
  );
  assert.match(jyutpingToChinese('sik6 jat1'), /k收音/u);
  assert.match(jyutpingToChinese('sik6 jat1'), /t收音/u);
});

void test('offers ranked alternatives and applies a saved word reading', async () => {
  const candidates = await getCantoneseCandidates('你好');
  assert.ok(candidates.some((candidate) => candidate.text === '你'));
  assert.equal(await cantoneseToJyutping('你好', { 你: 'lei5' }), 'lei5 hou2');
});

void test('keeps mixed English words readable', async () => {
  assert.equal(
    await cantoneseToJyutping('Love 你 tonight'),
    'Love nei5 tonight',
  );
});

void test('builds Cantonese lyric lines without loading the Japanese dictionary', async () => {
  const lines = await convertLyrics('我鍾意唱歌\n\n食一粒糖', {}, 'yue');
  assert.equal(lines[0]?.romaji, 'ngo5 zung1 ji3 coeng3 go1');
  assert.equal(lines[1]?.isBreak, true);
  assert.match(lines[2]?.chinesePhonetic ?? '', /收音/u);
});

void test('regenerates a Cantonese line with pronunciation corrections', async () => {
  const [line] = await convertLyrics('你好', {}, 'yue');
  const regenerated = await regenerateLyricLine(line!, {}, true, 'yue', {
    你: 'lei5',
  });
  assert.equal(regenerated.romaji, 'lei5 hou2');
});
