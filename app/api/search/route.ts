import type { OnlineSongResult } from '@/lib/online-music';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://music.163.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
};

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return origin === 'https://dayuzhishui23.github.io'
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 100) {
    return Response.json(
      { error: '请输入 1—100 个字符的歌名或歌手。', songs: [] },
      { status: 400, headers: cors(request) },
    );
  }

  try {
    const upstream = await fetch(
      `https://music.163.com/api/search/get?s=${encodeURIComponent(query)}&type=1&limit=12`,
      { headers: HEADERS, signal: AbortSignal.timeout(8_000) },
    );
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const data = (await upstream.json()) as {
      result?: {
        songs?: Array<{
          id?: number;
          name?: string;
          duration?: number;
          artists?: Array<{ name?: string }>;
        }>;
      };
    };
    const songs: OnlineSongResult[] = (data.result?.songs ?? [])
      .filter((song) => Number.isInteger(song.id) && Boolean(song.name))
      .map((song) => ({
        id: String(song.id),
        title: song.name!.trim(),
        artist:
          song.artists
            ?.map((artist) => artist.name?.trim())
            .filter(Boolean)
            .join(' / ') || '未知歌手',
        duration:
          typeof song.duration === 'number' ? song.duration / 1000 : 0,
      }));
    return Response.json({ songs }, { headers: cors(request) });
  } catch {
    return Response.json(
      { error: '歌曲搜索暂时不可用，请稍后重试。', songs: [] },
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
