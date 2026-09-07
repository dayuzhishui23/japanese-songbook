import type { LyricLine } from './lyrics';

export const LEGACY_LYRICS_STORAGE_KEY = 'lemon-lyrics-practice:v1';
export const SONG_LIBRARY_STORAGE_KEY = 'japanese-songbook:v2';

export type SongRecord = {
  id: string;
  title: string;
  artist: string;
  officialUrl: string;
  mvUrl: string;
  rawLyrics: string;
  lines: LyricLine[];
  updatedAt: string;
};

export type SongLibrary = {
  version: 2;
  activeSongId: string;
  songs: SongRecord[];
};

type StorageReader = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

const LEMON_ID = 'lemon-kenshi-yonezu';

export function createDefaultLibrary(): SongLibrary {
  return {
    version: 2,
    activeSongId: LEMON_ID,
    songs: [
      {
        id: LEMON_ID,
        title: 'Lemon',
        artist: '米津玄師',
        officialUrl: 'https://reissuerecords.net/discography/lemon/',
        mvUrl: 'https://www.youtube.com/watch?v=SX_ViT4Ra7k',
        rawLyrics: '',
        lines: [],
        updatedAt: '',
      },
    ],
  };
}

function isSong(value: unknown): value is SongRecord {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<SongRecord>;
  return (
    typeof song.id === 'string' &&
    typeof song.title === 'string' &&
    typeof song.artist === 'string' &&
    typeof song.officialUrl === 'string' &&
    typeof song.mvUrl === 'string' &&
    typeof song.rawLyrics === 'string' &&
    Array.isArray(song.lines) &&
    typeof song.updatedAt === 'string'
  );
}

export function isSongLibrary(value: unknown): value is SongLibrary {
  if (!value || typeof value !== 'object') return false;
  const library = value as Partial<SongLibrary>;
  return (
    library.version === 2 &&
    typeof library.activeSongId === 'string' &&
    Array.isArray(library.songs) &&
    library.songs.every(isSong)
  );
}

function migrateLegacy(value: unknown): SongLibrary | null {
  if (!value || typeof value !== 'object') return null;
  const legacy = value as Record<string, unknown>;
  if (
    legacy.version !== 1 ||
    legacy.song !== 'Lemon' ||
    legacy.artist !== '米津玄師' ||
    typeof legacy.rawLyrics !== 'string' ||
    !Array.isArray(legacy.lines)
  ) {
    return null;
  }

  const library = createDefaultLibrary();
  library.songs[0] = {
    ...library.songs[0],
    rawLyrics: legacy.rawLyrics,
    lines: legacy.lines as LyricLine[],
    updatedAt: typeof legacy.savedAt === 'string' ? legacy.savedAt : '',
  };
  return library;
}

export function loadSongLibrary(storage: StorageReader): SongLibrary {
  try {
    const current = storage.getItem(SONG_LIBRARY_STORAGE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      if (isSongLibrary(parsed)) return parsed;
    }

    const legacy = storage.getItem(LEGACY_LYRICS_STORAGE_KEY);
    if (legacy) {
      const migrated = migrateLegacy(JSON.parse(legacy));
      if (migrated) {
        saveSongLibrary(storage, migrated);
        storage.removeItem(LEGACY_LYRICS_STORAGE_KEY);
        return migrated;
      }
    }
  } catch {
    // Corrupt local data should not prevent the practice book from opening.
  }

  return createDefaultLibrary();
}

export function saveSongLibrary(
  storage: Pick<Storage, 'setItem'>,
  library: SongLibrary,
): void {
  storage.setItem(SONG_LIBRARY_STORAGE_KEY, JSON.stringify(library));
}
