import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultLibrary,
  LEGACY_LYRICS_STORAGE_KEY,
  loadSongLibrary,
  saveSongLibrary,
  SONG_LIBRARY_STORAGE_KEY,
} from './storage';

function fakeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

void test('creates Lemon as the initial empty song', () => {
  const library = createDefaultLibrary();
  assert.equal(library.version, 2);
  assert.equal(library.songs[0]?.title, 'Lemon');
  assert.equal(library.songs[0]?.rawLyrics, '');
});

void test('saves and restores a multi-song library', () => {
  const storage = fakeStorage();
  const library = createDefaultLibrary();
  library.songs.push({
    id: 'song-2',
    title: '二曲目',
    artist: '歌手',
    officialUrl: '',
    mvUrl: '',
    rawLyrics: 'かな',
    lines: [],
    updatedAt: '2026-09-07T00:00:00.000Z',
  });
  saveSongLibrary(storage, library);
  assert.deepEqual(loadSongLibrary(storage), library);
});

void test('migrates saved Lemon lyrics from version 1', () => {
  const storage = fakeStorage({
    [LEGACY_LYRICS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      song: 'Lemon',
      artist: '米津玄師',
      rawLyrics: '夢ならば',
      lines: [],
      savedAt: '2026-09-07T00:00:00.000Z',
    }),
  });
  const library = loadSongLibrary(storage);
  assert.equal(library.songs[0]?.rawLyrics, '夢ならば');
  assert.ok(storage.values.has(SONG_LIBRARY_STORAGE_KEY));
  assert.equal(storage.values.has(LEGACY_LYRICS_STORAGE_KEY), false);
});

void test('falls back safely when saved data is invalid', () => {
  const storage = fakeStorage({ [SONG_LIBRARY_STORAGE_KEY]: '{broken' });
  assert.equal(loadSongLibrary(storage).songs[0]?.title, 'Lemon');
});
