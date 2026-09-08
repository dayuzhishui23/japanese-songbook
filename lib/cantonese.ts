import type { PhoneticCorrections } from './phonetic';

export type CantonesePronunciationCorrections = Record<string, string>;

export type CantoneseCandidate = {
  text: string;
  readings: string[];
};

const EXACT_SYLLABLES: Record<string, string> = {
  aa: '阿',
  ai: '诶',
  baa: '巴',
  bat: '八〔t收音〕',
  bei: '贝',
  bit: '必〔t收音〕',
  bin: '边',
  bong: '邦',
  can: '陈',
  cang: '曾',
  ce: '车',
  ceoi: '吹',
  ci: '痴',
  cin: '千',
  cing: '青',
  cit: '切〔t收音〕',
  coi: '才',
  coeng: '昌',
  cung: '从',
  cyun: '村',
  daai: '大',
  dak: '得〔k收音〕',
  dai: '低',
  dang: '等',
  dei: '地',
  dim: '点',
  diu: '丢',
  dik: '的〔k收音〕',
  doi: '代',
  dou: '都',
  dung: '冬',
  dyun: '端',
  faa: '花',
  faan: '番',
  fan: '分',
  faat: '发〔t收音〕',
  fei: '飞',
  fo: '火',
  fu: '夫',
  fung: '风',
  gaa: '嘎',
  gaai: '街',
  gan: '跟',
  gang: '更',
  gau: '够',
  gei: '给',
  gin: '今',
  ging: '京',
  git: '结〔t收音〕',
  goi: '该',
  gok: '国〔k收音〕',
  gam: '甘',
  ge: '给',
  go: '哥',
  gong: '刚',
  gun: '官',
  gwaa: '瓜',
  gwai: '归',
  gwo: '过',
  gwong: '光',
  haa: '哈',
  hai: '嗨',
  haang: '杭',
  hang: '恒',
  hau: '口',
  hei: '嘿',
  hyun: '圈',
  hin: '牵',
  heoi: '嘿许',
  ho: '呵',
  hon: '看',
  hong: '康',
  hoi: '开',
  hou: '厚',
  jam: '音',
  jap: '叶〔p收音〕',
  jan: '因',
  jaa: '呀',
  jau: '优',
  jat: '亚〔t收音〕',
  je: '爷',
  ji: '衣',
  jik: '亦〔k收音〕',
  jim: '严',
  jing: '英',
  jiu: '要',
  joek: '约〔k收音〕',
  joeng: '杨',
  jung: '拥',
  jyu: '于',
  jyun: '云',
  jyut: '月〔t收音〕',
  kaa: '卡',
  kaau: '靠',
  kam: '琴',
  kap: '咳〔p收音〕',
  kau: '扣',
  keoi: '葵',
  kwai: '规',
  laa: '啦',
  laan: '兰',
  lau: '流',
  lei: '里',
  leoi: '雷',
  lin: '连',
  ling: '零',
  liu: '料',
  lok: '洛〔k收音〕',
  loi: '来',
  long: '浪',
  loeng: '梁',
  lou: '老',
  lyun: '恋',
  maan: '慢',
  m: '唔',
  maa: '妈',
  mau: '眸',
  mei: '眉',
  ming: '明',
  mo: '摩',
  mong: '忙',
  mou: '某',
  mun: '门',
  naa: '拿',
  naam: '南',
  naan: '难',
  nang: '能',
  nap: '纳〔p收音〕',
  nei: '内',
  nyun: '暖',
  ng: '嗯',
  ngaan: '眼',
  ngaang: '硬',
  ngo: 'ng哦',
  oi: '爱',
  paa: '趴',
  paak: '拍〔k收音〕',
  paau: '抛',
  pang: '朋',
  pin: '偏',
  pou: '抱',
  saam: '三',
  saan: '山',
  sai: '西',
  sam: '心',
  sang: '生',
  sat: '失〔t收音〕',
  sau: '手',
  sek: '石〔k收音〕',
  sei: '四',
  seoi: '水',
  si: '诗',
  sik: '色〔k收音〕',
  sin: '先',
  sing: '星',
  soeng: '想',
  sung: '送',
  syu: '书',
  syun: '宣',
  syut: '雪〔t收音〕',
  taa: '他',
  taai: '太',
  tau: '头',
  tin: '天',
  tong: '糖',
  tou: '逃',
  tung: '痛',
  waa: '哇',
  wai: '威',
  waan: '还',
  wan: '温',
  wing: '荣',
  wong: '王',
  wu: '乌',
  wut: '活〔t收音〕',
  wui: '乌诶',
  zaau: '找',
  zaai: '斋',
  zan: '真',
  zang: '赠',
  zam: '怎',
  zau: '周',
  ze: '遮',
  zeon: '俊',
  zi: '知',
  zik: '直〔k收音〕',
  zip: '接〔p收音〕',
  zit: '节〔t收音〕',
  zing: '正',
  zo: '左',
  zoek: '着〔k收音〕',
  zoeng: '将',
  zou: '早',
  zoi: '再',
  zung: '宗',
  zyun: '转',
  zyut: '绝〔t收音〕',
};

const ONSET_HINTS: Record<string, string> = {
  '': '',
  b: 'b',
  p: 'p',
  m: 'm',
  f: 'f',
  d: 'd',
  t: 't',
  n: 'n',
  l: 'l',
  g: 'g',
  k: 'k',
  ng: 'ng',
  h: 'h',
  gw: 'gu',
  kw: 'ku',
  w: 'w',
  z: 'j',
  c: 'q',
  s: 's',
  j: 'y',
};

const FINAL_HINTS: Record<string, string> = {
  aa: '啊',
  aai: '爱',
  aau: '奥',
  aam: '啊m',
  aan: '安',
  aang: '昂',
  aap: '啊〔p收音〕',
  aat: '啊〔t收音〕',
  aak: '啊〔k收音〕',
  a: '呃',
  ai: '诶',
  au: '欧',
  am: '嗯',
  an: '恩',
  ang: '昂',
  ap: '呃〔p收音〕',
  at: '呃〔t收音〕',
  ak: '呃〔k收音〕',
  e: '诶',
  ei: '诶',
  eu: '诶欧',
  em: '诶m',
  en: '恩',
  eng: '诶ng',
  ep: '诶〔p收音〕',
  et: '诶〔t收音〕',
  ek: '诶〔k收音〕',
  i: '衣',
  iu: '优',
  im: '音',
  in: '因',
  ing: '英',
  ip: '衣〔p收音〕',
  it: '衣〔t收音〕',
  ik: '衣〔k收音〕',
  o: '哦',
  oi: '爱',
  ou: '欧',
  on: '安',
  ong: '翁',
  ot: '哦〔t收音〕',
  ok: '哦〔k收音〕',
  oe: '诶',
  oeng: '央',
  oek: '约〔k收音〕',
  oet: '约〔t收音〕',
  eo: '呃',
  eoi: '锐',
  eon: '伦',
  eot: '率〔t收音〕',
  u: '乌',
  ui: '微',
  un: '温',
  ung: '翁',
  ut: '乌〔t收音〕',
  uk: '乌〔k收音〕',
  yu: '于',
  yun: '云',
  yut: '月〔t收音〕',
  m: '唔',
  ng: '嗯',
};

const ONSETS = [
  'gw',
  'kw',
  'ng',
  'b',
  'p',
  'm',
  'f',
  'd',
  't',
  'n',
  'l',
  'g',
  'k',
  'h',
  'w',
  'z',
  'c',
  's',
  'j',
] as const;

function stripTone(value: string): string {
  return value.toLowerCase().replace(/[1-6]$/u, '');
}

function syllableToChinese(value: string): string {
  const syllable = stripTone(value);
  const exact = EXACT_SYLLABLES[syllable];
  if (exact) return exact;
  const onset =
    ONSETS.find((candidate) => syllable.startsWith(candidate)) ?? '';
  const final = syllable.slice(onset.length);
  const finalHint = FINAL_HINTS[final];
  if (!finalHint) return value;
  return `${ONSET_HINTS[onset] ?? onset}${finalHint}`;
}

export function jyutpingToChinese(
  reading: string,
  corrections: PhoneticCorrections = {},
): string {
  const normalized = reading.toLowerCase().replace(/\s+/gu, ' ').trim();
  const exactCorrection = corrections[normalized.replace(/\s+/gu, '')];
  if (exactCorrection) return exactCorrection;

  return normalized
    .replace(/[a-z]+[1-6]/gu, (syllable) => {
      const correction = corrections[syllable];
      return correction ?? syllableToChinese(syllable);
    })
    .replace(/\s+([\p{P}\p{S}])/gu, '$1')
    .replace(/([\p{Ps}])\s+/gu, '$1')
    .trim();
}

async function converterFor(
  corrections: CantonesePronunciationCorrections = {},
) {
  const { default: ToJyutping } = await import('to-jyutping');
  return Object.keys(corrections).length
    ? ToJyutping.customize(corrections)
    : ToJyutping;
}

function listToText(list: Array<[string, string | null]>): string {
  let output = '';
  let previousWasReading = false;
  for (const [text, reading] of list) {
    if (reading) {
      if (output && !/\s$/u.test(output)) output += ' ';
      output += reading;
      previousWasReading = true;
      continue;
    }
    if (/^\s+$/u.test(text)) {
      if (output && !/\s$/u.test(output)) output += ' ';
      previousWasReading = false;
      continue;
    }
    if (/^[\p{P}\p{S}]$/u.test(text)) {
      output = `${output.trimEnd()}${text}`;
      previousWasReading = false;
      continue;
    }
    if (previousWasReading && output && !/\s$/u.test(output)) output += ' ';
    output += text;
    previousWasReading = false;
  }
  return output.trim();
}

export async function prepareCantoneseConverter(): Promise<void> {
  await converterFor();
}

export async function cantoneseToJyutping(
  text: string,
  corrections: CantonesePronunciationCorrections = {},
): Promise<string> {
  const converter = await converterFor(corrections);
  return listToText(converter.getJyutpingList(text));
}

export async function getCantoneseCandidates(
  text: string,
  corrections: CantonesePronunciationCorrections = {},
): Promise<CantoneseCandidate[]> {
  const converter = await converterFor(corrections);
  return converter
    .getJyutpingCandidates(text)
    .filter(([, readings]) => readings.length > 1)
    .map(([candidateText, readings]) => ({
      text: candidateText,
      readings: [...new Set(readings)],
    }));
}
