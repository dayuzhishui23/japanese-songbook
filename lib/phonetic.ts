import Kuroshiro from 'kuroshiro';

const KuroshiroRuntime = Kuroshiro.Util
  ? Kuroshiro
  : (Kuroshiro as unknown as { default: typeof Kuroshiro }).default;

const KANA_ROWS = [
  ['あいうえお', '阿伊乌诶哦'],
  ['かきくけこ', '卡其库凯扣'],
  ['さしすせそ', '撒西苏塞搜'],
  ['たちつてと', '塔奇次忒偷'],
  ['なにぬねの', '那尼努内诺'],
  ['はひふへほ', '哈希夫嘿吼'],
  ['まみむめも', '马米木咩摸'],
  ['やゆよ', '呀优哟'],
  ['らりるれろ', '拉里路雷罗'],
  ['わをん', '哇哦嗯'],
  ['がぎぐげご', '嘎给古给够'],
  ['ざじずぜぞ', '扎吉兹贼奏'],
  ['だぢづでど', '达吉兹得多'],
  ['ばびぶべぼ', '巴比布贝波'],
  ['ぱぴぷぺぽ', '趴批普佩坡'],
  ['ぁぃぅぇぉ', '阿伊乌诶哦'],
  ['ゔ', '乌'],
] as const;

const CONTRACTED_ROWS = [
  'きゃ:克呀 きゅ:克优 きょ:克哟 しゃ:夏 しゅ:咻 しょ:修',
  'ちゃ:恰 ちゅ:秋 ちょ:巧 にゃ:尼呀 にゅ:尼优 にょ:尼哟',
  'ひゃ:希呀 ひゅ:希优 ひょ:希哟 みゃ:米呀 みゅ:米优 みょ:米哟',
  'りゃ:俩 りゅ:留 りょ:料 ぎゃ:给呀 ぎゅ:给优 ぎょ:给哟',
  'じゃ:加 じゅ:朱 じょ:就 びゃ:比呀 びゅ:比优 びょ:比哟',
  'ぴゃ:批呀 ぴゅ:批优 ぴょ:批哟 ふぁ:发 ふぃ:飞 ふぇ:费 ふぉ:佛',
  'てぃ:提 でぃ:迪 とぅ:图 どぅ:杜 うぃ:威 うぇ:喂 うぉ:窝',
] as const;

const NASAL_ROWS = [
  ['あいうえお', '安音嗯恩翁'],
  ['かきくけこ', '康金坤肯空'],
  ['がぎぐげご', '刚银滚根共'],
  ['さしすせそ', '桑心孙森松'],
  ['ざじずぜぞ', '脏进尊曾宗'],
  ['たちつてと', '汤亲村天通'],
  ['だぢづでど', '当进尊电咚'],
  ['なにぬねの', '囊宁嫩年农'],
  ['はひふへほ', '航欣婚亨轰'],
  ['ばびぶべぼ', '邦宾文边崩'],
  ['ぱぴぷぺぽ', '胖拼喷片彭'],
  ['まみむめも', '芒明蒙绵萌'],
  ['やゆよ', '杨云永'],
  ['らりるれろ', '朗林轮连隆'],
  ['わ', '汪'],
] as const;

function buildCharacterMap(rows: ReadonlyArray<readonly [string, string]>) {
  return new Map(
    rows.flatMap(([kana, chinese]) =>
      Array.from(
        kana,
        (character, index) => [character, Array.from(chinese)[index]] as const,
      ),
    ),
  );
}

const KANA_TO_CHINESE = buildCharacterMap(KANA_ROWS);
const KANA_WITH_N = new Map<string, string>(
  NASAL_ROWS.flatMap(([kana, chinese]) =>
    Array.from(
      kana,
      (character, index) =>
        [`${character}ん`, Array.from(chinese)[index]] as const,
    ),
  ),
);
const CONTRACTED_TO_CHINESE = new Map(
  CONTRACTED_ROWS.flatMap((row) =>
    row.split(' ').map((entry) => entry.split(':') as [string, string]),
  ),
);

const VOWEL_GROUPS = [
  'あかがさざただなはばぱまやらわゃぁ',
  'いきぎしじちぢにひびぴみりぃ',
  'うくぐすずつづぬふぶぷむゆるゅぅ',
  'えけげせぜてでねへべぺめれぇ',
  'おこごそぞとどのほぼぽもよろをょぉ',
] as const;

export type PhoneticCorrections = Record<string, string>;

export function normalizeReadingKey(reading: string): string {
  return katakanaToHiragana(reading)
    .toLowerCase()
    .replace(/\s+/gu, '')
    .trim();
}

function isRomajiKey(value: string): boolean {
  return /^[a-z]+(?:['-][a-z]+)*$/u.test(value);
}

function kanaToRomajiKey(value: string): string {
  return normalizeReadingKey(
    KuroshiroRuntime.Util.kanaToRomaji(
      katakanaToHiragana(value),
      'hepburn',
    ),
  );
}

function moraVowel(mora: string): string | undefined {
  const last = mora.at(-1) ?? '';
  const index = VOWEL_GROUPS.findIndex((group) => group.includes(last));
  return ['a', 'i', 'u', 'e', 'o'][index];
}

function convertWord(
  word: string,
  romajiCorrections: PhoneticCorrections,
): string {
  if (word.startsWith('こんにちは')) {
    return `空尼奇哇${convertWord(
      word.slice('こんにちは'.length),
      romajiCorrections,
    )}`;
  }

  const output: string[] = [];
  let previousMora = '';

  for (let index = 0; index < word.length; index += 1) {
    const character = word[index];

    let correctedEnd = -1;
    let correctedPhonetic = '';
    for (let end = index + 1; end <= word.length; end += 1) {
      const candidate = word.slice(index, end);
      if (!/^[\u3040-\u30ffー]+$/u.test(candidate)) break;
      const correction = romajiCorrections[kanaToRomajiKey(candidate)];
      if (correction) {
        correctedEnd = end;
        correctedPhonetic = correction;
      }
    }
    if (correctedEnd > index) {
      output.push(correctedPhonetic);
      previousMora = '';
      index = correctedEnd - 1;
      continue;
    }

    if (character === 'っ') {
      output.push('·');
      previousMora = '';
      continue;
    }
    if (character === 'ー') {
      output.push('—');
      continue;
    }

    const pair = word.slice(index, index + 2);
    const nasal = KANA_WITH_N.get(pair);
    if (nasal) {
      output.push(nasal);
      previousMora = '';
      index += 1;
      continue;
    }
    if (
      (character === 'う' && moraVowel(previousMora) === 'o') ||
      (character === 'い' && moraVowel(previousMora) === 'e')
    ) {
      output.push('—');
      previousMora = character;
      continue;
    }

    const contracted = CONTRACTED_TO_CHINESE.get(pair);
    if (contracted) {
      output.push(contracted);
      previousMora = pair;
      index += 1;
      continue;
    }

    const phonetic = KANA_TO_CHINESE.get(character);
    output.push(phonetic ?? character);
    previousMora = phonetic ? character : '';
  }

  return output.join('');
}

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

export function readingToChinese(
  reading: string,
  corrections: PhoneticCorrections = {},
): string {
  const normalized = katakanaToHiragana(reading);
  const normalizedCorrections = Object.fromEntries(
    Object.entries(corrections).map(([key, value]) => [
      normalizeReadingKey(key),
      value,
    ]),
  );
  const romajiCorrections = Object.fromEntries(
    Object.entries(normalizedCorrections).filter(([key]) => isRomajiKey(key)),
  );
  const exactCorrection =
    normalizedCorrections[normalizeReadingKey(normalized)] ??
    romajiCorrections[kanaToRomajiKey(normalized)];
  if (exactCorrection) return exactCorrection;

  const output = normalized.split(/(\s+)/u).map((part) => {
    if (/^\s+$/u.test(part)) return ' ';
    const correction =
      normalizedCorrections[normalizeReadingKey(part)] ??
      romajiCorrections[kanaToRomajiKey(part)];
    if (correction) return correction;
    if (part === 'は') return '哇';
    if (part === 'へ') return '诶';
    if (part === 'を') return '哦';
    return convertWord(part, romajiCorrections);
  });

  return output
    .join('')
    .replace(/\s+([、。！？,.!?：:；;…—―」』）)\]】])/gu, '$1')
    .replace(/([「『（(【])\s+/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}
