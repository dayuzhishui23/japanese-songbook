import assert from 'node:assert/strict';
import test from 'node:test';

import { katakanaToHiragana, readingToChinese } from './phonetic';

void test('converts katakana before phonetic mapping', () => {
  assert.equal(katakanaToHiragana('レモン'), 'れもん');
  assert.equal(readingToChinese('レモン'), '雷萌');
});

void test('handles contracted sounds, sokuon, long vowels, and moraic n', () => {
  assert.equal(readingToChinese('きょう'), '克哟—');
  assert.equal(readingToChinese('がっこう'), '嘎·扣—');
  assert.equal(readingToChinese('スーパー'), '苏—趴—');
  assert.equal(readingToChinese('ほん'), '轰');
});

void test('keeps punctuation readable', () => {
  assert.equal(readingToChinese('こんにちは、せかい！'), '空尼奇哇、塞卡伊！');
});

void test('uses word spacing and common particle pronunciations', () => {
  assert.equal(readingToChinese('わたし は せかい へ'), '哇塔西 哇 塞卡伊 诶');
  assert.equal(readingToChinese('こんにちは'), '空尼奇哇');
});
