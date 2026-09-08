import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultLibrary,
  LEGACY_LYRICS_STORAGE_KEY,
  loadSongLibrary,
  parseSongLibraryBackup,
  PREVIOUS_SONG_LIBRARY_STORAGE_KEY,
  saveSongLibrary,
  serializeSongLibraryBackup,
  SONG_LIBRARY_STORAGE_KEY,
  VERSION_3_SONG_LIBRARY_STORAGE_KEY,
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

void test('starts with an empty songbook', () => {
  const library = createDefaultLibrary();
  assert.equal(library.version, 4);
  assert.equal(library.activeSongId, '');
  assert.deepEqual(library.songs, []);
});

void test('migrates a version 2 song library and starts an empty correction dictionary', () => {
  const previous = {
    version: 2,
    activeSongId: 'song-2',
    songs: [
      {
        id: 'song-2',
        title: '二曲目',
        artist: '歌手',
        officialUrl: '',
        mvUrl: '',
        rawLyrics: 'かな',
        lines: [
          {
            japanese: 'かな',
            reading: 'かな',
            romaji: 'kana',
            chinesePhonetic: '我改过的音',
            isBreak: false,
          },
          {
            japanese: 'かな',
            reading: 'かな',
            romaji: 'kana',
            chinesePhonetic: '卡那',
            isBreak: false,
          },
        ],
        updatedAt: '2026-09-07T00:00:00.000Z',
      },
    ],
  };
  const storage = fakeStorage({
    [PREVIOUS_SONG_LIBRARY_STORAGE_KEY]: JSON.stringify(previous),
  });

  const library = loadSongLibrary(storage);
  assert.equal(library.version, 4);
  assert.deepEqual(library.phoneticCorrections, {});
  assert.deepEqual(library.cantonesePronunciationCorrections, {});
  assert.equal(library.songs[0]?.language, 'ja');
  assert.equal(library.songs[0]?.title, '二曲目');
  assert.equal(library.songs[0]?.lines[0]?.chinesePhoneticEdited, true);
  assert.equal(library.songs[0]?.lines[0]?.readingEdited, true);
  assert.equal(library.songs[0]?.lines[1]?.chinesePhoneticEdited, false);
  assert.equal(library.songs[0]?.lines[1]?.phoneticVersion, undefined);
  assert.equal(storage.values.has(PREVIOUS_SONG_LIBRARY_STORAGE_KEY), false);
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
    language: 'ja',
  });
  saveSongLibrary(storage, library);
  assert.deepEqual(loadSongLibrary(storage), library);
});

void test('saves and restores online song metadata', () => {
  const storage = fakeStorage();
  const library = createDefaultLibrary();
  library.activeSongId = 'online-song';
  library.songs.push({
    id: 'online-song',
    title: '在线歌曲',
    artist: '歌手',
    officialUrl: '',
    mvUrl: '',
    rawLyrics: 'かな',
    lines: [],
    updatedAt: '2026-09-07T00:00:00.000Z',
    source: 'netease',
    sourceId: '536622304',
    duration: 256,
    language: 'ja',
  });
  saveSongLibrary(storage, library);
  assert.deepEqual(loadSongLibrary(storage), library);
});

void test('migrates version 3 songs without losing local records', () => {
  const previous = {
    version: 3,
    activeSongId: 'saved-song',
    phoneticCorrections: { きょう: 'Q哟—' },
    songs: [
      {
        id: 'saved-song',
        title: '旧歌本歌曲',
        artist: '歌手',
        officialUrl: '',
        mvUrl: '',
        rawLyrics: '今日',
        lines: [],
        updatedAt: '2026-09-07T00:00:00.000Z',
      },
    ],
  };
  const storage = fakeStorage({
    [VERSION_3_SONG_LIBRARY_STORAGE_KEY]: JSON.stringify(previous),
  });

  const library = loadSongLibrary(storage);
  assert.equal(library.version, 4);
  assert.equal(library.activeSongId, 'saved-song');
  assert.equal(library.songs[0]?.title, '旧歌本歌曲');
  assert.equal(library.songs[0]?.language, 'ja');
  assert.equal(library.phoneticCorrections.きょう, 'Q哟—');
  assert.deepEqual(library.cantonesePronunciationCorrections, {});
  assert.equal(storage.values.has(VERSION_3_SONG_LIBRARY_STORAGE_KEY), false);
});

void test('removes only the unused starter Lemon song', () => {
  const emptyLemon = {
    version: 3,
    activeSongId: 'lemon-kenshi-yonezu',
    phoneticCorrections: {},
    songs: [
      {
        id: 'lemon-kenshi-yonezu',
        title: 'Lemon',
        artist: '米津玄師',
        officialUrl: '',
        mvUrl: '',
        rawLyrics: '',
        lines: [],
        updatedAt: '',
      },
    ],
  };
  const storage = fakeStorage({
    [VERSION_3_SONG_LIBRARY_STORAGE_KEY]: JSON.stringify(emptyLemon),
  });
  assert.deepEqual(loadSongLibrary(storage).songs, []);
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
  assert.deepEqual(loadSongLibrary(storage).songs, []);
});

void test('exports and restores the complete local songbook', () => {
  const library = createDefaultLibrary();
  library.phoneticCorrections.きょう = 'Q哟—';
  library.activeSongId = 'song-1';
  library.songs.push({
    id: 'song-1',
    title: '测试歌曲',
    artist: '歌手',
    officialUrl: '',
    mvUrl: '',
    rawLyrics: '今日',
    updatedAt: '2026-09-07T00:00:00.000Z',
    language: 'ja',
    lines: [
      {
        japanese: '今日',
        reading: 'きょう',
        romaji: 'kyou',
        chinesePhonetic: 'Q哟—',
        isBreak: false,
        startTime: 1.2,
      },
    ],
  });
  const serialized = serializeSongLibraryBackup(
    library,
    '2026-09-07T00:00:00.000Z',
  );
  assert.deepEqual(parseSongLibraryBackup(serialized), library);
});

void test('rejects malformed or unsupported backups', () => {
  assert.throws(() => parseSongLibraryBackup('{broken'), /有效/u);
  assert.throws(
    () =>
      parseSongLibraryBackup(
        JSON.stringify({
          format: 'japanese-songbook-backup',
          version: 1,
          exportedAt: '2026-09-07T00:00:00.000Z',
          library: { version: 3, activeSongId: '', songs: [{}] },
        }),
      ),
    /不受支持/u,
  );
});
