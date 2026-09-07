const KANA_TO_CHINESE: Record<string, string> = {
  あ: '阿', い: '衣', う: '呜', え: '诶', お: '哦',
  か: '卡', き: '七', く: '哭', け: '开', こ: '扩',
  さ: '撒', し: '西', す: '斯', せ: '塞', そ: '嗖',
  た: '塔', ち: '七', つ: '次', て: '忒', と: '偷',
  な: '那', に: '你', ぬ: '奴', ね: '内', の: '诺',
  は: '哈', ひ: '西', ふ: '夫', へ: '嘿', ほ: '吼',
  ま: '吗', み: '米', む: '木', め: '梅', も: '摸',
  や: '呀', ゆ: '优', よ: '哟',
  ら: '拉', り: '里', る: '噜', れ: '雷', ろ: '咯',
  わ: '哇', を: '哦', ん: '嗯',
  が: '嘎', ぎ: '吉', ぐ: '古', げ: '该', ご: '够',
  ざ: '杂', じ: '几', ず: '兹', ぜ: '贼', ぞ: '奏',
  だ: '达', ぢ: '几', づ: '兹', で: '呆', ど: '多',
  ば: '巴', び: '比', ぶ: '不', べ: '贝', ぼ: '波',
  ぱ: '趴', ぴ: '批', ぷ: '扑', ぺ: '佩', ぽ: '坡',
  ぁ: '阿', ぃ: '衣', ぅ: '呜', ぇ: '诶', ぉ: '哦',
  ゔ: '乌',
  きゃ: '克呀', きゅ: '克优', きょ: '克哟',
  しゃ: '夏', しゅ: '咻', しょ: '修',
  ちゃ: '恰', ちゅ: '丘', ちょ: '秋',
  にゃ: '尼呀', にゅ: '尼优', にょ: '尼哟',
  ひゃ: '西呀', ひゅ: '西优', ひょ: '西哟',
  みゃ: '米呀', みゅ: '米优', みょ: '米哟',
  りゃ: '里呀', りゅ: '里优', りょ: '里哟',
  ぎゃ: '吉呀', ぎゅ: '吉优', ぎょ: '吉哟',
  じゃ: '加', じゅ: '久', じょ: '就',
  びゃ: '比呀', びゅ: '比优', びょ: '比哟',
  ぴゃ: '批呀', ぴゅ: '批优', ぴょ: '批哟',
  ふぁ: '法', ふぃ: '菲', ふぇ: '费', ふぉ: '佛',
  てぃ: '提', でぃ: '迪', とぅ: '图', どぅ: '杜',
  うぃ: '威', うぇ: '维', うぉ: '沃',
};

export function katakanaToHiragana(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6
        ? String.fromCharCode(code - 0x60)
        : character;
    })
    .join('');
}

export function readingToChinese(reading: string): string {
  const normalized = katakanaToHiragana(reading);
  const output: string[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (/\s/u.test(character)) {
      continue;
    }

    if (character === 'っ') {
      output.push('·');
      continue;
    }

    if (character === 'ー') {
      output.push('—');
      continue;
    }

    const pair = normalized.slice(index, index + 2);
    if (KANA_TO_CHINESE[pair]) {
      output.push(KANA_TO_CHINESE[pair]);
      index += 1;
      continue;
    }

    if (KANA_TO_CHINESE[character]) {
      output.push(KANA_TO_CHINESE[character]);
      continue;
    }

    output.push(character);
  }

  return output
    .join(' ')
    .replace(/\s+([、。！？,.!?：:；;…—―」』）)\]】])/gu, '$1')
    .replace(/([「『（(【])\s+/gu, '$1')
    .replace(/([、。！？,.!?：:；;…「」『』（）【】])\s+/gu, '$1')
    .replace(/\s+·\s+/gu, '·')
    .replace(/\s+—/gu, '—')
    .trim();
}
