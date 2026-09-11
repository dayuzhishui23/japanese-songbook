import assert from 'node:assert/strict';
import test from 'node:test';

import {
  katakanaToHiragana,
  normalizeReadingKey,
  readingToChinese,
} from './phonetic';

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

void test('normalizes correction keys and applies saved word corrections', () => {
  assert.equal(normalizeReadingKey(' キョウ は '), 'きょうは');
  assert.equal(
    readingToChinese('きょう は せかい', { きょう: 'Q哟—' }),
    'Q哟— 哇 塞卡伊',
  );
});

void test('applies romaji corrections to matching sounds inside words', () => {
  assert.equal(normalizeReadingKey(' Te '), 'te');
  assert.equal(readingToChinese('たべて', { te: '爹' }), '塔贝爹');
  assert.equal(readingToChinese('きょう', { KYOU: 'Q哟—' }), 'Q哟—');
});

void test('prefers an exact saved line correction', () => {
  assert.equal(
    readingToChinese('きょう は せかい', {
      きょうはせかい: 'Q哟—哇塞卡伊',
    }),
    'Q哟—哇塞卡伊',
  );
});
