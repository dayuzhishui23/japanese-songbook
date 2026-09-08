import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../app/api/search/route';

void test('uses the fallback provider when primary results are unrelated', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith('https://music.163.com/')) {
      return Response.json({
        result: {
          songs: [
            {
              id: 1,
              name: '30',
              duration: 135_000,
              artists: [{ name: '无关歌手' }],
            },
          ],
        },
      });
    }
    if (url.startsWith('https://music-api.gdstudio.xyz/')) {
      return Response.json([
        {
          id: '29758196',
          name: 'ヤキモチの答え',
          artist: ['梶裕貴'],
        },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const response = await GET(
      new Request(
        'https://uta.dayuzhishui23.cn/api/search?q=%E3%83%A4%E3%82%AD%E3%83%A2%E3%83%81%E3%81%AE%E7%AD%94%E3%81%88',
      ),
    );
    const payload = (await response.json()) as {
      songs: Array<{ title: string; artist: string }>;
    };
    assert.equal(payload.songs.length, 1);
    assert.equal(payload.songs[0]?.title, 'ヤキモチの答え');
    assert.equal(payload.songs[0]?.artist, '梶裕貴');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
