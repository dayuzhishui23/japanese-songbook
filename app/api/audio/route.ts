const RESOLVER = 'https://music-api.gdstudio.xyz/api.php';
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { url: string; savedAt: number }>();

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return origin === 'https://dayuzhishui23.github.io'
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

function isTrustedAudioUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'music.163.com' ||
        url.hostname.endsWith('.music.126.net'))
    );
  } catch {
    return false;
  }
}

async function resolveAudio(id: string): Promise<string | null> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return cached.url;

  const response = await fetch(
    `${RESOLVER}?types=url&source=netease&id=${id}&br=320`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { url?: unknown };
  if (typeof data.url !== 'string' || !isTrustedAudioUrl(data.url)) return null;
  cache.set(id, { url: data.url, savedAt: Date.now() });
  return data.url;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^\d{1,20}$/u.test(id)) return new Response(null, { status: 400 });

  try {
    const url = await resolveAudio(id);
    if (!url) return new Response(null, { status: 404, headers: cors(request) });
    const headers: Record<string, string> = {
      Referer: 'https://music.163.com/',
      'User-Agent': 'Mozilla/5.0',
    };
    const range = request.headers.get('range');
    if (range) headers.Range = range;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!upstream.ok || !upstream.body)
      return new Response(null, { status: 404, headers: cors(request) });

    const responseHeaders = new Headers(cors(request));
    responseHeaders.set(
      'Content-Type',
      upstream.headers.get('content-type') || 'audio/mpeg',
    );
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=600');
    for (const name of ['content-length', 'content-range']) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response(null, { status: 502, headers: cors(request) });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    headers: {
      ...cors(request),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
    },
  });
}
