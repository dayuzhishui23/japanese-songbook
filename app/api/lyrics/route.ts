import { parseTimedLrc, timedLyricsToText } from '@/lib/online-music';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://music.163.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return origin === 'https://dayuzhishui23.github.io' ||
    origin === 'https://uta.dayuzhishui23.cn'
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^\d{1,20}$/u.test(id)) {
    return Response.json(
      { error: '歌曲编号无效。' },
      { status: 400, headers: cors(request) },
    );
  }

  try {
    const upstream = await fetch(
      `https://music.163.com/api/song/lyric?id=${id}&lv=1&kv=1&tv=-1`,
      { headers: HEADERS, signal: AbortSignal.timeout(8_000) },
    );
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const data = (await upstream.json()) as { lrc?: { lyric?: string } };
    const timedLines = parseTimedLrc(data.lrc?.lyric ?? '');
    if (!timedLines.length) {
      return Response.json(
        { error: '这首歌暂时没有可用的时间轴歌词。' },
        { status: 404, headers: cors(request) },
      );
    }
    return Response.json(
      { lyrics: timedLyricsToText(timedLines), timedLines },
      { headers: cors(request) },
    );
  } catch {
    return Response.json(
      { error: '歌词暂时无法取得，请稍后重试。' },
      { status: 502, headers: cors(request) },
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    headers: {
      ...cors(request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
