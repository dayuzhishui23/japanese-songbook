const CACHE_TTL = 8 * 60 * 1000;
const cache = new Map<string, { urls: string[]; savedAt: number }>();

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  return origin === 'https://dayuzhishui23.github.io'
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Expose-Headers':
          'Accept-Ranges, Content-Length, Content-Range',
        Vary: 'Origin',
      }
    : {};
}

function trustedAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.replace(/^http:\/\//u, 'https://'));
    return url.protocol === 'https:' &&
      (url.hostname === 'music.163.com' ||
        url.hostname.endsWith('.music.126.net'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function resolveJsonUrl(id: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${id}&br=320`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { url?: unknown };
    return trustedAudioUrl(data.url);
  } catch {
    return null;
  }
}

async function resolveRedirectUrl(endpoint: string): Promise<string | null> {
  try {
    const response = await fetch(endpoint, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    return trustedAudioUrl(response.headers.get('location'));
  } catch {
    return null;
  }
}

async function resolveAudioUrls(id: string, fresh = false): Promise<string[]> {
  const cached = cache.get(id);
  if (!fresh && cached && Date.now() - cached.savedAt < CACHE_TTL) {
    return cached.urls;
  }

  const urls = (
    await Promise.all([
      resolveJsonUrl(id),
      resolveRedirectUrl(
        `https://api.baka.plus/meting/?type=url&id=${id}&br=320`,
      ),
      resolveRedirectUrl(`https://api.qijieya.cn/meting/?type=url&id=${id}`),
      resolveRedirectUrl(
        `https://music.163.com/song/media/outer/url?id=${id}.mp3`,
      ),
    ])
  ).filter((url): url is string => Boolean(url));
  const unique = [...new Set(urls)];
  if (unique.length) cache.set(id, { urls: unique, savedAt: Date.now() });
  return unique;
}

async function streamAudio(
  url: string,
  request: Request,
): Promise<Response | null> {
  const headers: Record<string, string> = {
    Referer: 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0',
  };
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!upstream.ok || !upstream.body) return null;
    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType && !/audio|mpeg|mp4|octet-stream/iu.test(contentType)) {
      return null;
    }

    const responseHeaders = new Headers(cors(request));
    responseHeaders.set('Content-Type', contentType || 'audio/mpeg');
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
    clearTimeout(timeout);
    return null;
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^\d{1,20}$/u.test(id)) return new Response(null, { status: 400 });

  for (const fresh of [false, true]) {
    const urls = await resolveAudioUrls(id, fresh);
    for (const url of urls) {
      const response = await streamAudio(url, request);
      if (response) return response;
    }
    cache.delete(id);
  }
  return new Response(null, { status: 404, headers: cors(request) });
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
