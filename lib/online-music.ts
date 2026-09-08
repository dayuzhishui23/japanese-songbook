export const ONLINE_LYRICS_MAX_LENGTH = 30_000;

export type OnlineSongResult = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  version: 'original' | 'cover';
};

export type TimedLyricLine = {
  text: string;
  startTime: number;
};

const CREDIT_PREFIX =
  /^(?:(作词|作曲|编曲|制作人|监制|混音|母带|录音|吉他|贝斯|鼓|弦乐|和声|发行|词|曲)\s*[:：]|(?:produced|production|keyboards?|programming|drums?|bass|guitars?|percussion|strings?|recorded|engineered|vocals?|mixed|mastered|arranged|conducted)\b|(?:op|sp)\s*[:：])/iu;

export function parseTimedLrc(value: string): TimedLyricLine[] {
  if (!value || value.length > ONLINE_LYRICS_MAX_LENGTH) return [];
  const timed: TimedLyricLine[] = [];

  for (const sourceLine of value.replace(/\r\n?/gu, '\n').split('\n')) {
    const matches = [
      ...sourceLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/gu),
    ];
    if (!matches.length) continue;
    const text = sourceLine
      .replace(/\[[^\]]+\]/gu, '')
      .replace(/<\d+,\d+(?:,\d+)?>/gu, '')
      .trim();
    if (!text || CREDIT_PREFIX.test(text)) continue;

    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = (match[3] ?? '').padEnd(3, '0').slice(0, 3);
      const startTime = minutes * 60 + seconds + Number(fraction) / 1000;
      if (Number.isFinite(startTime)) timed.push({ text, startTime });
    }
  }

  return timed.sort((a, b) => a.startTime - b.startTime);
}

export function timedLyricsToText(lines: TimedLyricLine[]): string {
  return lines.map((line) => line.text).join('\n');
}
