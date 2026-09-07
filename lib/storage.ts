import type { LyricLine } from './lyrics';
import { readingToChinese, type PhoneticCorrections } from './phonetic';

export const LEGACY_LYRICS_STORAGE_KEY = 'lemon-lyrics-practice:v1';
export const PREVIOUS_SONG_LIBRARY_STORAGE_KEY = 'japanese-songbook:v2';
export const SONG_LIBRARY_STORAGE_KEY = 'japanese-songbook:v3';

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
  version: 3;
  activeSongId: string;
  songs: SongRecord[];
  phoneticCorrections: PhoneticCorrections;
};

type StorageReader = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

const LEMON_ID = 'lemon-kenshi-yonezu';

export function createDefaultLibrary(): SongLibrary {
  return {
    version: 3,
    activeSongId: LEMON_ID,
    phoneticCorrections: {},
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
    library.version === 3 &&
    typeof library.activeSongId === 'string' &&
    Array.isArray(library.songs) &&
    library.songs.every(isSong) &&
    Boolean(library.phoneticCorrections) &&
    typeof library.phoneticCorrections === 'object' &&
    !Array.isArray(library.phoneticCorrections)
  );
}

function migrateLine(line: LyricLine): LyricLine {
  if (line.isBreak) return line;
  const chinesePhoneticEdited =
    line.chinesePhonetic !== readingToChinese(line.reading);
  return {
    ...line,
    readingEdited: true,
    romajiEdited: true,
    chinesePhoneticEdited,
    phoneticVersion: chinesePhoneticEdited ? 2 : undefined,
  };
}

function migrateSong(song: SongRecord): SongRecord {
  return { ...song, lines: song.lines.map(migrateLine) };
}

function migratePreviousLibrary(value: unknown): SongLibrary | null {
  if (!value || typeof value !== 'object') return null;
  const previous = value as {
    version?: unknown;
    activeSongId?: unknown;
    songs?: unknown;
  };
  if (
    previous.version !== 2 ||
    typeof previous.activeSongId !== 'string' ||
    !Array.isArray(previous.songs) ||
    !previous.songs.every(isSong)
  ) {
    return null;
  }
  return {
    version: 3,
    activeSongId: previous.activeSongId,
    songs: previous.songs.map(migrateSong),
    phoneticCorrections: {},
  };
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
    lines: (legacy.lines as LyricLine[]).map(migrateLine),
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

    const previous = storage.getItem(PREVIOUS_SONG_LIBRARY_STORAGE_KEY);
    if (previous) {
      const migrated = migratePreviousLibrary(JSON.parse(previous));
      if (migrated) {
        saveSongLibrary(storage, migrated);
        storage.removeItem(PREVIOUS_SONG_LIBRARY_STORAGE_KEY);
        return migrated;
      }
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
