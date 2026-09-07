import {
  katakanaToHiragana,
  readingToChinese,
  type PhoneticCorrections,
} from './phonetic';

export const MAX_LYRICS_LENGTH = 20_000;
export const PHONETIC_RULES_VERSION = 2;

export type LyricLine = {
  japanese: string;
  reading: string;
  romaji: string;
  chinesePhonetic: string;
  isBreak: boolean;
  startTime?: number;
  readingEdited?: boolean;
  romajiEdited?: boolean;
  chinesePhoneticEdited?: boolean;
  phoneticVersion?: number;
};

type KuroshiroInstance = {
  init(analyzer: unknown): Promise<void>;
  convert(
    text: string,
    options: {
      to: 'hiragana' | 'romaji';
      mode?: 'normal' | 'spaced';
      romajiSystem?: 'hepburn';
    },
  ): Promise<string>;
};

let kuroshiroPromise: Promise<KuroshiroInstance> | null = null;

type KuroshiroBrowserWindow = Window & {
  kuromoji?: {
    builder(options: { dicPath: string }): {
      build(
        callback: (error: Error | null, tokenizer: KuromojiTokenizer) => void,
      ): void;
    };
  };
};

type KuromojiTokenizer = {
  tokenize(text: string): Array<Record<string, unknown>>;
};

function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path}`;
}

function loadKuromojiScript(): Promise<void> {
  const browserWindow = window as KuroshiroBrowserWindow;
  if (browserWindow.kuromoji) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-lyrics-library="kuromoji"]',
    );
    const script = existing ?? document.createElement('script');

    const handleLoad = () => {
      if (browserWindow.kuromoji) resolve();
      else reject(new Error('无法初始化 Kuromoji。'));
    };
    const handleError = () => {
      script.remove();
      reject(new Error('无法载入 Kuromoji。'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.src = publicAsset('vendor/kuromoji.js');
      script.async = true;
      script.dataset.lyricsLibrary = 'kuromoji';
      document.getElementsByTagName('head')[0]?.appendChild(script);
    }
  });
}

async function createKuromojiAnalyzer(): Promise<{
  init(): Promise<void>;
  parse(text: string): Promise<Array<Record<string, unknown>>>;
}> {
  await loadKuromojiScript();
  const browserWindow = window as KuroshiroBrowserWindow;
  const builder = browserWindow.kuromoji?.builder({
    dicPath: publicAsset('kuromoji/'),
  });
  if (!builder) throw new Error('日语词典初始化失败。');
  let tokenizer: KuromojiTokenizer | null = null;

  return {
    init() {
      return new Promise((resolve, reject) => {
        builder.build((error, builtTokenizer) => {
          if (error) reject(error);
          else {
            tokenizer = builtTokenizer;
            resolve();
          }
        });
      });
    },
    async parse(text: string) {
      if (!tokenizer) throw new Error('日语词典尚未准备好。');
      if (!text.trim()) return [];
      return tokenizer.tokenize(text);
    },
  };
}

async function getKuroshiro(): Promise<KuroshiroInstance> {
  if (!kuroshiroPromise) {
    kuroshiroPromise = Promise.all([
      import('kuroshiro'),
      createKuromojiAnalyzer(),
    ])
      .then(async ([kuroshiroModule, analyzer]) => {
        const moduleDefault = kuroshiroModule.default as unknown;
        const Kuroshiro = (
          typeof moduleDefault === 'function'
            ? moduleDefault
            : (moduleDefault as { default?: unknown })?.default
        ) as new () => KuroshiroInstance;
        if (typeof Kuroshiro !== 'function')
          throw new Error('日语读音组件初始化失败。');
        const converter = new Kuroshiro();
        await converter.init(analyzer);
        return converter;
      })
      .catch((error) => {
        kuroshiroPromise = null;
        throw error;
      });
  }

  return kuroshiroPromise;
}

export function validateLyricsInput(rawLyrics: string): string {
  if (!rawLyrics.trim()) {
    throw new Error('请先粘贴日语歌词。');
  }

  if (rawLyrics.length > MAX_LYRICS_LENGTH) {
    throw new Error('歌词内容过长，请控制在 20,000 个字符以内。');
  }

  return rawLyrics.replace(/\r\n?/gu, '\n');
}

async function convertJapaneseLine(
  japanese: string,
  corrections: PhoneticCorrections,
): Promise<LyricLine> {
  const converter = await getKuroshiro();
  const [reading, phoneticReading, romaji] = await Promise.all([
    converter.convert(japanese, { to: 'hiragana', mode: 'normal' }),
    converter.convert(japanese, { to: 'hiragana', mode: 'spaced' }),
    converter.convert(japanese, {
      to: 'romaji',
      mode: 'spaced',
      romajiSystem: 'hepburn',
    }),
  ]);

  return {
    japanese,
    reading,
    romaji: romaji.replace(/\s+([、。！？,.!?])/gu, '$1').trim(),
    chinesePhonetic: readingToChinese(phoneticReading, corrections),
    isBreak: false,
    readingEdited: false,
    romajiEdited: false,
    chinesePhoneticEdited: false,
    phoneticVersion: PHONETIC_RULES_VERSION,
  };
}

export async function convertLyrics(
  rawLyrics: string,
  corrections: PhoneticCorrections = {},
): Promise<LyricLine[]> {
  const normalized = validateLyricsInput(rawLyrics);
  await getKuroshiro();
  const result: LyricLine[] = [];

  for (const sourceLine of normalized.split('\n')) {
    if (!sourceLine.trim()) {
      result.push({
        japanese: '',
        reading: '',
        romaji: '',
        chinesePhonetic: '',
        isBreak: true,
      });
      continue;
    }

    result.push(await convertJapaneseLine(sourceLine.trim(), corrections));
  }

  return result;
}

export async function regenerateLyricLine(
  line: LyricLine,
  corrections: PhoneticCorrections = {},
  resetManualEdits = false,
): Promise<LyricLine> {
  if (line.isBreak) return line;

  if (resetManualEdits || !line.readingEdited) {
    const generated = await convertJapaneseLine(line.japanese, corrections);
    return {
      ...generated,
      startTime: line.startTime,
      romaji:
        !resetManualEdits && line.romajiEdited ? line.romaji : generated.romaji,
      chinesePhonetic:
        !resetManualEdits && line.chinesePhoneticEdited
          ? line.chinesePhonetic
          : generated.chinesePhonetic,
      romajiEdited: !resetManualEdits && Boolean(line.romajiEdited),
      chinesePhoneticEdited:
        !resetManualEdits && Boolean(line.chinesePhoneticEdited),
    };
  }

  const reading = katakanaToHiragana(line.reading.trim());
  const converter = await getKuroshiro();
  const romaji = await converter.convert(reading, {
    to: 'romaji',
    mode: 'spaced',
    romajiSystem: 'hepburn',
  });

  return {
    ...line,
    reading,
    romaji: line.romajiEdited ? line.romaji : romaji.trim(),
    chinesePhonetic: line.chinesePhoneticEdited
      ? line.chinesePhonetic
      : readingToChinese(reading, corrections),
    phoneticVersion: PHONETIC_RULES_VERSION,
  };
}

export function lyricLinesToRawText(lines: LyricLine[]): string {
  return lines.map((line) => (line.isBreak ? '' : line.japanese)).join('\n');
}

export function getLinePlaybackRange(
  lines: LyricLine[],
  index: number,
  duration: number,
): { start: number; end: number } | null {
  const start = lines[index]?.startTime;
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0)
    return null;

  const nextStart = lines
    .slice(index + 1)
    .find(
      (line) => !line.isBreak && typeof line.startTime === 'number',
    )?.startTime;
  const end =
    typeof nextStart === 'number' && nextStart > start
      ? nextStart
      : Number.isFinite(duration) && duration > start
        ? duration
        : start + 10;
  return { start, end };
}
