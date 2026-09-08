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
  source?: 'netease';
  sourceId?: string;
  duration?: number;
};

export type SongLibrary = {
  version: 3;
  activeSongId: string;
  songs: SongRecord[];
  phoneticCorrections: PhoneticCorrections;
};

type SongLibraryBackup = {
  format: 'japanese-songbook-backup';
  version: 1;
  exportedAt: string;
  library: SongLibrary;
};

type StorageReader = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

const LEMON_ID = 'lemon-kenshi-yonezu';

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isLyricLine(value: unknown): value is LyricLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<LyricLine>;
  return (
    typeof line.japanese === 'string' &&
    typeof line.reading === 'string' &&
    typeof line.romaji === 'string' &&
    typeof line.chinesePhonetic === 'string' &&
    typeof line.isBreak === 'boolean' &&
    (line.startTime === undefined ||
      (typeof line.startTime === 'number' &&
        Number.isFinite(line.startTime) &&
        line.startTime >= 0)) &&
    isOptionalBoolean(line.readingEdited) &&
    isOptionalBoolean(line.romajiEdited) &&
    isOptionalBoolean(line.chinesePhoneticEdited) &&
    (line.phoneticVersion === undefined ||
      (typeof line.phoneticVersion === 'number' &&
        Number.isInteger(line.phoneticVersion)))
  );
}

export function createDefaultLibrary(): SongLibrary {
  return {
    version: 3,
    activeSongId: '',
    phoneticCorrections: {},
    songs: [],
  };
}

function removeEmptyStarterLemon(library: SongLibrary): SongLibrary {
  const songs = library.songs.filter(
    (song) =>
      !(
        song.id === LEMON_ID &&
        !song.rawLyrics.trim() &&
        !song.lines.length &&
        !song.sourceId
      ),
  );
  if (songs.length === library.songs.length) return library;
  return {
    ...library,
    activeSongId:
      library.activeSongId === LEMON_ID
        ? (songs[0]?.id ?? '')
        : library.activeSongId,
    songs,
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
    song.lines.every(isLyricLine) &&
    typeof song.updatedAt === 'string' &&
    (song.source === undefined || song.source === 'netease') &&
    (song.sourceId === undefined || typeof song.sourceId === 'string') &&
    (song.duration === undefined ||
      (typeof song.duration === 'number' && Number.isFinite(song.duration)))
  );
}

function isCorrectionDictionary(value: unknown): value is PhoneticCorrections {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([reading, phonetic]) =>
        Boolean(reading) && typeof phonetic === 'string' && Boolean(phonetic),
    )
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
    isCorrectionDictionary(library.phoneticCorrections)
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

  const song: SongRecord = {
    id: LEMON_ID,
    title: 'Lemon',
    artist: '米津玄師',
    officialUrl: 'https://reissuerecords.net/discography/lemon/',
    mvUrl: 'https://www.youtube.com/watch?v=SX_ViT4Ra7k',
    rawLyrics: legacy.rawLyrics,
    lines: (legacy.lines as LyricLine[]).map(migrateLine),
    updatedAt: typeof legacy.savedAt === 'string' ? legacy.savedAt : '',
  };
  return {
    ...createDefaultLibrary(),
    activeSongId: LEMON_ID,
    songs: [song],
  };
}

export function loadSongLibrary(storage: StorageReader): SongLibrary {
  try {
    const current = storage.getItem(SONG_LIBRARY_STORAGE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      if (isSongLibrary(parsed)) {
        const library = removeEmptyStarterLemon(parsed);
        if (library !== parsed) saveSongLibrary(storage, library);
        return library;
      }
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

export function serializeSongLibraryBackup(
  library: SongLibrary,
  exportedAt = new Date().toISOString(),
): string {
  const backup: SongLibraryBackup = {
    format: 'japanese-songbook-backup',
    version: 1,
    exportedAt,
    library,
  };
  return JSON.stringify(backup, null, 2);
}

export function parseSongLibraryBackup(value: string): SongLibrary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('这不是有效的歌本备份文件。');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('这不是有效的歌本备份文件。');
  }
  const backup = parsed as Partial<SongLibraryBackup>;
  if (
    backup.format !== 'japanese-songbook-backup' ||
    backup.version !== 1 ||
    typeof backup.exportedAt !== 'string' ||
    !isSongLibrary(backup.library)
  ) {
    throw new Error('备份格式不受支持或内容不完整。');
  }
  return backup.library;
}
