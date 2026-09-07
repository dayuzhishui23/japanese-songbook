import assert from 'node:assert/strict';
import test from 'node:test';

import { katakanaToHiragana, readingToChinese } from './phonetic';

void test('converts katakana before phonetic mapping', () => {
  assert.equal(katakanaToHiragana('レモン'), 'れもん');
  assert.equal(readingToChinese('レモン'), '雷 摸 嗯');
});

void test('handles contracted sounds, sokuon, long vowels, and moraic n', () => {
  assert.equal(readingToChinese('きょう'), '克哟 呜');
  assert.equal(readingToChinese('がっこう'), '嘎·扩 呜');
  assert.equal(readingToChinese('スーパー'), '斯— 趴—');
  assert.equal(readingToChinese('ほん'), '吼 嗯');
});

void test('keeps punctuation readable', () => {
  assert.equal(readingToChinese('こんにちは、せかい！'), '扩 嗯 你 七 哈、塞 卡 衣！');
});
