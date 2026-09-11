'use client';

import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Pencil,
  Play,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  activeLyricIndexAtTime,
  adjacentLyricIndex,
  convertLyrics,
  getLinePlaybackRange,
  lyricLinesToRawText,
  lyricTracksToText,
  MAX_LYRICS_LENGTH,
  PHONETIC_RULES_VERSION,
  prepareLyricsConverter,
  regenerateLyricLine,
  setLyricStartTime,
  type LyricLine,
  type LyricCopyTrack,
  type SongLanguage,
} from '@/lib/lyrics';
import {
  getCantoneseCandidates,
  jyutpingToChinese,
  type CantoneseCandidate,
} from '@/lib/cantonese';
import { normalizeReadingKey, readingToChinese } from '@/lib/phonetic';
import type { OnlineSongResult, TimedLyricLine } from '@/lib/online-music';
import {
  createDefaultLibrary,
  loadSongLibrary,
  parseSongLibraryBackup,
  saveSongLibrary,
  serializeSongLibraryBackup,
  type SongLibrary,
  type SongRecord,
} from '@/lib/storage';

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

type SongDraft = Pick<SongRecord, 'title' | 'artist' | 'officialUrl' | 'mvUrl'>;
type GenerationStage = 'lyrics' | 'dictionary' | 'phonetic';
type ViewMode = 'home' | 'practice';
type LyricsDisplayMode = 'all' | 'annotation' | 'original';
type SongChoiceHandler = (
  song: OnlineSongResult,
  language: SongLanguage,
  onProgress: (stage: GenerationStage) => void,
) => Promise<void>;

const DISPLAY_MODES: Array<{
  id: LyricsDisplayMode;
  label: string;
  description: string;
}> = [
  { id: 'all', label: '三层', description: '原文、注音和音译' },
  { id: 'annotation', label: '两层', description: '原文和注音' },
  { id: 'original', label: '原文', description: '只看原文' },
];

function nextDisplayMode(mode: LyricsDisplayMode): LyricsDisplayMode {
  if (mode === 'all') return 'annotation';
  if (mode === 'annotation') return 'original';
  return 'all';
}

function formatLyricTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remainder}`;
}

const MAX_BACKUP_SIZE = 5 * 1024 * 1024;
const API_ORIGIN = 'https://uta.dayuzhishui23.cn';
const HOME_ASCII_ART =
  '  _  _              _       _           \n | || |    ___     | |     | |     ___  \n | __ |   / -_)    | |     | |    / _ \\ \n |_||_|   \\___|   _|_|_   _|_|_   \\___/ \n_|"""""|_|"""""|_|"""""|_|"""""|_|"""""|\n"`-0-0-\'"`-0-0-\'"`-0-0-\'"`-0-0-\'"`-0-0-\'';

function apiUrl(path: string): string {
  if (
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('.github.io')
  ) {
    return `${API_ORIGIN}${path}`;
  }
  return path;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '暂时无法生成读音，请稍后重试。你的原歌词仍然保留着。';
}

function detectLyricsLanguage(
  lyrics: string,
  selected: SongLanguage,
): SongLanguage {
  if (/[\u3040-\u30ff]/u.test(lyrics)) return 'ja';
  if (/[嘅咗佢唔喺冇哋啲噉嚟俾喎㗎]/u.test(lyrics)) return 'yue';
  return selected;
}

function createSongId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `song-${Date.now()}`;
}

export default function Home() {
  const [library, setLibrary] = useState<SongLibrary>(createDefaultLibrary);
  const [rawLyrics, setRawLyrics] = useState('');
  const [isEditing, setIsEditing] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('home');

  const activeSong = useMemo(
    () =>
      library.songs.find((song) => song.id === library.activeSongId) ?? null,
    [library],
  );

  useEffect(() => {
    const saved = loadSongLibrary(localStorage);
    const active =
      saved.songs.find((song) => song.id === saved.activeSongId) ??
      saved.songs[0] ??
      null;
    if (active && active.id !== saved.activeSongId)
      saved.activeSongId = active.id;
    queueMicrotask(() => {
      setLibrary(saved);
      setRawLyrics(active?.rawLyrics ?? '');
      setIsEditing(!active?.lines.length);
    });
  }, []);

  const persist = useCallback((next: SongLibrary) => {
    saveSongLibrary(localStorage, next);
    setLibrary(next);
  }, []);

  const generateFromText = useCallback(
    async (lyrics: string) => {
      if (!activeSong) throw new Error('请先添加一首歌曲。');
      const converted = await convertLyrics(
        lyrics,
        library.phoneticCorrections,
        activeSong.language,
        library.cantonesePronunciationCorrections,
      );
      const normalized = lyrics.replace(/\r\n?/gu, '\n');
      const next: SongLibrary = {
        ...library,
        songs: library.songs.map((song) =>
          song.id === activeSong.id
            ? {
                ...song,
                rawLyrics: normalized,
                lines: converted,
                updatedAt: new Date().toISOString(),
              }
            : song,
        ),
      };
      persist(next);
      setRawLyrics(normalized);
      setIsEditing(false);
      setError('');
      return {
        lineCount: converted.filter((line) => !line.isBreak).length,
        song: activeSong.title,
      };
    },
    [activeSong, library, persist],
  );

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool(
      {
        name: 'generate_lyrics_view',
        title: '为当前歌曲生成对照歌词',
        description:
          '把用户提供的日语或粤语歌词转换为罗马音或粤拼及中文跟唱近似音，并保存到当前歌曲。',
        inputSchema: {
          type: 'object',
          properties: {
            lyrics: {
              type: 'string',
              minLength: 1,
              maxLength: MAX_LYRICS_LENGTH,
              description: '用户合法取得并提供的歌词，每行一句。',
            },
          },
          required: ['lyrics'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          if (
            !input ||
            typeof input !== 'object' ||
            typeof (input as { lyrics?: unknown }).lyrics !== 'string'
          ) {
            throw new Error('lyrics 必须是字符串。');
          }
          try {
            const result = await generateFromText(
              (input as { lyrics: string }).lyrics,
            );
            return { ...result, savedLocally: true };
          } catch (generationError) {
            setError(errorMessage(generationError));
            throw generationError;
          }
        },
      },
      { signal: lifecycle.signal },
    );
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  }, [generateFromText]);

  function selectSong(song: SongRecord) {
    persist({ ...library, activeSongId: song.id });
    setRawLyrics(song.rawLyrics);
    setIsEditing(!song.lines.length);
    setError('');
    setViewMode('practice');
  }

  async function addOnlineSong(
    result: OnlineSongResult,
    language: SongLanguage,
    onProgress: (stage: GenerationStage) => void,
  ) {
    setIsGenerating(true);
    setError('');
    try {
      onProgress('lyrics');
      const response = await fetch(apiUrl(`/api/lyrics?id=${result.id}`));
      const payload = (await response.json()) as {
        error?: string;
        lyrics?: string;
        timedLines?: TimedLyricLine[];
      };
      if (!response.ok || !payload.lyrics || !payload.timedLines?.length) {
        throw new Error(payload.error || '这首歌暂时没有可用歌词。');
      }
      const resolvedLanguage = detectLyricsLanguage(payload.lyrics, language);
      onProgress('dictionary');
      await prepareLyricsConverter(resolvedLanguage);
      onProgress('phonetic');
      const converted = await convertLyrics(
        payload.lyrics,
        library.phoneticCorrections,
        resolvedLanguage,
        library.cantonesePronunciationCorrections,
      );
      const lines = converted.map((line, index) => ({
        ...line,
        startTime: line.isBreak
          ? undefined
          : payload.timedLines?.[index]?.startTime,
      }));
      const existing = library.songs.find(
        (song) =>
          song.sourceId === result.id ||
          (!song.rawLyrics &&
            song.title.toLocaleLowerCase() ===
              result.title.toLocaleLowerCase() &&
            song.artist.includes(result.artist)),
      );
      const song: SongRecord = {
        id: existing?.id ?? createSongId(),
        title: result.title,
        artist: result.artist,
        officialUrl: existing?.officialUrl ?? '',
        mvUrl: existing?.mvUrl ?? '',
        rawLyrics: payload.lyrics,
        lines,
        updatedAt: new Date().toISOString(),
        source: 'netease',
        sourceId: result.id,
        duration: result.duration,
        language: resolvedLanguage,
      };
      const songs = existing
        ? library.songs.map((current) =>
            current.id === existing.id ? song : current,
          )
        : [...library.songs, song];
      persist({ ...library, activeSongId: song.id, songs });
      setRawLyrics(payload.lyrics);
      setIsEditing(false);
      setViewMode('practice');
    } catch (onlineError) {
      const message = errorMessage(onlineError);
      setError(message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  function addManualSong(
    suggestedTitle: string,
    suggestedArtist = '未知歌手',
    lyrics = '',
    language: SongLanguage = 'ja',
  ) {
    const song: SongRecord = {
      id: createSongId(),
      title: suggestedTitle.trim() || '未命名歌曲',
      artist: suggestedArtist.trim() || '未知歌手',
      officialUrl: '',
      mvUrl: '',
      rawLyrics: lyrics,
      lines: [],
      updatedAt: '',
      language,
    };
    persist({
      ...library,
      activeSongId: song.id,
      songs: [...library.songs, song],
    });
    setRawLyrics(lyrics);
    setIsEditing(true);
    setError('');
    setViewMode('practice');
  }

  function updateSong(draft: SongDraft) {
    if (!activeSong) return;
    persist({
      ...library,
      songs: library.songs.map((song) =>
        song.id === activeSong.id
          ? {
              ...song,
              title: draft.title.trim(),
              artist: draft.artist.trim(),
              officialUrl: draft.officialUrl.trim(),
              mvUrl: draft.mvUrl.trim(),
            }
          : song,
      ),
    });
  }

  function deleteSong() {
    if (!activeSong) return;
    const songs = library.songs.filter((song) => song.id !== activeSong.id);
    const nextActive = songs[0] ?? null;
    persist({
      version: 4,
      activeSongId: nextActive?.id ?? '',
      songs,
      phoneticCorrections: library.phoneticCorrections,
      cantonesePronunciationCorrections:
        library.cantonesePronunciationCorrections,
    });
    setRawLyrics(nextActive?.rawLyrics ?? '');
    setIsEditing(!nextActive?.lines.length);
    setError('');
    if (!nextActive) setViewMode('home');
  }

  function clearCurrentLyrics() {
    if (!activeSong) return;
    persist({
      ...library,
      songs: library.songs.map((song) =>
        song.id === activeSong.id
          ? { ...song, rawLyrics: '', lines: [], updatedAt: '' }
          : song,
      ),
    });
    setRawLyrics('');
    setError('');
    setIsEditing(true);
  }

  function saveEditedLines(editedLines: LyricLine[]) {
    if (!activeSong) return;
    const updatedRawLyrics = lyricLinesToRawText(editedLines);
    persist({
      ...library,
      songs: library.songs.map((song) =>
        song.id === activeSong.id
          ? {
              ...song,
              rawLyrics: updatedRawLyrics,
              lines: editedLines,
              updatedAt: new Date().toISOString(),
            }
          : song,
      ),
    });
    setRawLyrics(updatedRawLyrics);
  }

  function saveLinesAndCorrections(
    editedLines: LyricLine[],
    phoneticCorrections: Record<string, string>,
  ) {
    if (!activeSong) return;
    const updatedRawLyrics = lyricLinesToRawText(editedLines);
    persist({
      ...library,
      phoneticCorrections,
      songs: library.songs.map((song) =>
        song.id === activeSong.id
          ? {
              ...song,
              rawLyrics: updatedRawLyrics,
              lines: editedLines,
              updatedAt: new Date().toISOString(),
            }
          : song,
      ),
    });
    setRawLyrics(updatedRawLyrics);
  }

  function savePhoneticCorrection(reading: string, chinesePhonetic: string) {
    const key = normalizeReadingKey(reading);
    const value = chinesePhonetic.trim();
    if (!key || !value) return;
    persist({
      ...library,
      phoneticCorrections: {
        ...library.phoneticCorrections,
        [key]: value,
      },
    });
  }

  function deletePhoneticCorrection(reading: string) {
    const nextCorrections = { ...library.phoneticCorrections };
    delete nextCorrections[reading];
    persist({ ...library, phoneticCorrections: nextCorrections });
  }

  function saveCantonesePronunciationCorrection(text: string, reading: string) {
    const normalizedText = text.trim();
    const normalizedReading = reading.toLowerCase().trim();
    if (!normalizedText || !normalizedReading) return;
    persist({
      ...library,
      cantonesePronunciationCorrections: {
        ...library.cantonesePronunciationCorrections,
        [normalizedText]: normalizedReading,
      },
    });
  }

  function importLibrary(imported: SongLibrary) {
    const active =
      imported.songs.find((song) => song.id === imported.activeSongId) ??
      imported.songs[0] ??
      null;
    const next = {
      ...imported,
      activeSongId: active?.id ?? '',
    };
    persist(next);
    setRawLyrics(active?.rawLyrics ?? '');
    setIsEditing(!active?.lines.length);
    setError('');
  }

  async function handleSubmit(event: { preventDefault(): void }) {
    event.preventDefault();
    setIsGenerating(true);
    setError('');
    try {
      await generateFromText(rawLyrics);
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-foreground/10 pb-5">
          <button
            className="flex items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            onClick={() => setViewMode('home')}
            type="button"
          >
            <span
              aria-hidden="true"
              className="size-11 rounded-xl bg-cover bg-center sm:size-14"
              style={{ backgroundImage: "url('./songbook-icon.png')" }}
            />
            <h1 className="font-heading text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              日本語歌集
            </h1>
          </button>
          {viewMode === 'practice' ? (
            <div className="flex flex-wrap justify-end gap-2">
              <MoreActionsDialog
                library={library}
                onClear={clearCurrentLyrics}
                onDelete={deleteSong}
                onImport={importLibrary}
                onUpdate={updateSong}
                song={activeSong}
              />
              <OnlineSongSearchDialog
                onChoose={addOnlineSong}
                onManual={addManualSong}
              />
            </div>
          ) : null}
        </header>

        {viewMode === 'home' ? (
          <StartScreen
            activeSongId={library.activeSongId}
            onChoose={addOnlineSong}
            onManual={addManualSong}
            onSelect={selectSong}
            songs={library.songs}
          />
        ) : activeSong ? (
          <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <PracticeSongNav
              activeSongId={activeSong.id}
              onSelect={selectSong}
              songs={library.songs}
            />
            <div className="song-view-enter min-w-0" key={activeSong.id}>
              {isEditing ? (
                <>
                  <SongTitle song={activeSong} />
                  <LyricsEditor
                    error={error}
                    isGenerating={isGenerating}
                    language={activeSong.language}
                    onLyricsChange={setRawLyrics}
                    onSubmit={handleSubmit}
                    rawLyrics={rawLyrics}
                    songTitle={activeSong.title}
                  />
                </>
              ) : (
                <LyricsReader
                  cantoneseCorrections={
                    library.cantonesePronunciationCorrections
                  }
                  corrections={library.phoneticCorrections}
                  lines={activeSong.lines}
                  onDeleteCorrection={deletePhoneticCorrection}
                  onEdit={() => setIsEditing(true)}
                  onSave={saveEditedLines}
                  onSaveCorrection={savePhoneticCorrection}
                  onSaveCantoneseCorrection={
                    saveCantonesePronunciationCorrection
                  }
                  onSaveWithCorrections={saveLinesAndCorrections}
                  song={activeSong}
                />
              )}
            </div>
          </div>
        ) : (
          <StartScreen
            activeSongId=""
            onChoose={addOnlineSong}
            onManual={addManualSong}
            onSelect={selectSong}
            songs={library.songs}
          />
        )}
      </div>
    </main>
  );
}

function StartScreen({
  activeSongId,
  onChoose,
  onManual,
  onSelect,
  songs,
}: {
  activeSongId: string;
  onChoose: SongChoiceHandler;
  onManual: (
    title: string,
    artist?: string,
    lyrics?: string,
    language?: SongLanguage,
  ) => void;
  onSelect: (song: SongRecord) => void;
  songs: SongRecord[];
}) {
  const recentSongs = [...songs]
    .filter((song) => song.lines.length)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  return (
    <section className="mx-auto flex min-h-[65vh] w-full max-w-2xl flex-col items-center pt-8 sm:pt-16">
      <div className="text-center">
        <h2 className="sr-only">Hello</h2>
        <div className="w-full overflow-hidden py-2">
          <pre
            aria-hidden="true"
            className="home-ascii-train mx-auto w-max max-w-none font-mono text-xs font-semibold leading-[1.15] text-foreground sm:text-base"
          >
            {HOME_ASCII_ART}
          </pre>
        </div>
      </div>
      <div className="mt-8 w-full">
        <OnlineSongSearchDialog
          onChoose={onChoose}
          onManual={onManual}
          prominent
        />
      </div>
      {recentSongs.length ? (
        <div className="mt-10 w-full">
          <p className="mb-3 text-sm font-medium text-foreground/48">
            最近练习
          </p>
          <SongShelf
            activeSongId={activeSongId}
            onSelect={onSelect}
            songs={recentSongs}
          />
        </div>
      ) : null}
    </section>
  );
}

function PasteSongStarter({
  language,
  onLanguageChange,
  onManual,
}: {
  language: SongLanguage;
  onLanguageChange: (language: SongLanguage) => void;
  onManual: (
    title: string,
    artist?: string,
    lyrics?: string,
    language?: SongLanguage,
  ) => void;
}) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyrics, setLyrics] = useState('');

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onManual(title, artist, lyrics, language);
  }

  return (
    <form onSubmit={submit}>
      <LanguagePicker language={language} onChange={onLanguageChange} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          className="h-11 bg-background text-base"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="歌名"
          value={title}
        />
        <Input
          className="h-11 bg-background text-base"
          onChange={(event) => setArtist(event.target.value)}
          placeholder="歌手（可不填）"
          value={artist}
        />
      </div>
      <Textarea
        className="mt-3 min-h-40 resize-y bg-background p-4 text-base leading-7"
        maxLength={MAX_LYRICS_LENGTH}
        onChange={(event) => setLyrics(event.target.value)}
        placeholder={`粘贴${language === 'yue' ? '粤语' : '日语'}歌词，每行一句…`}
        required
        value={lyrics}
      />
      <div className="mt-4 flex justify-end">
        <Button className="h-11 rounded-full px-5" type="submit">
          继续生成
        </Button>
      </div>
    </form>
  );
}

function LanguagePicker({
  language,
  onChange,
}: {
  language: SongLanguage;
  onChange: (language: SongLanguage) => void;
}) {
  return (
    <fieldset className="mb-4 flex w-fit rounded-full bg-foreground/[0.06] p-1">
      <legend className="sr-only">歌词语言</legend>
      {(
        [
          ['ja', '日语'],
          ['yue', '粤语'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          aria-pressed={language === value}
          className={`min-h-10 rounded-full px-5 text-sm font-medium transition-colors ${
            language === value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-foreground/60 hover:text-foreground'
          }`}
          onClick={() => onChange(value)}
          type="button"
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function PracticeSongNav({
  activeSongId,
  onSelect,
  songs,
}: {
  activeSongId: string;
  onSelect: (song: SongRecord) => void;
  songs: SongRecord[];
}) {
  const recentSongs = [...songs].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  return (
    <>
      <label className="mb-4 block lg:hidden">
        <span className="sr-only">切换歌曲</span>
        <select
          className="h-12 w-full rounded-xl border border-foreground/12 bg-popover px-4 text-base text-foreground outline-none focus:border-primary"
          onChange={(event) => {
            const song = songs.find((item) => item.id === event.target.value);
            if (song) onSelect(song);
          }}
          value={activeSongId}
        >
          {recentSongs.map((song) => (
            <option key={song.id} value={song.id}>
              {song.title} · {song.artist}
            </option>
          ))}
        </select>
      </label>
      <aside className="sticky top-5 hidden max-h-[calc(100vh-2.5rem)] overflow-y-auto rounded-2xl border border-foreground/10 bg-card/55 p-3 lg:block">
        <p className="px-2 pb-2 text-sm font-medium text-foreground/48">
          我的歌本
        </p>
        <div className="space-y-1">
          {recentSongs.map((song) => (
            <button
              key={song.id}
              aria-current={song.id === activeSongId ? 'true' : undefined}
              className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${
                song.id === activeSongId
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-popover/70'
              }`}
              onClick={() => onSelect(song)}
              type="button"
            >
              <strong className="block truncate text-sm">{song.title}</strong>
              <span
                className={`mt-1 block truncate text-xs ${song.id === activeSongId ? 'text-primary-foreground/65' : 'text-foreground/42'}`}
              >
                {song.artist}
              </span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

function SongTitle({ song }: { song: SongRecord }) {
  return (
    <section
      className="mb-4 rounded-2xl border border-foreground/10 bg-popover px-5 py-4"
      aria-label="当前歌曲"
    >
      <h2 className="truncate text-2xl font-semibold tracking-[-0.025em] text-foreground sm:text-3xl">
        {song.title}
      </h2>
      <div className="mt-1 flex items-center gap-2">
        <p className="truncate text-sm text-foreground/52 sm:text-base">
          {song.artist}
        </p>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {song.language === 'yue' ? '粤语' : '日语'}
        </span>
      </div>
    </section>
  );
}

function SongShelf({
  activeSongId,
  onSelect,
  songs,
}: {
  activeSongId: string;
  onSelect: (song: SongRecord) => void;
  songs: SongRecord[];
}) {
  if (!songs.length) return null;
  return (
    <section aria-label="歌曲列表" className="mb-5">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {songs.map((song) => {
          const active = song.id === activeSongId;
          return (
            <button
              key={song.id}
              aria-current={active ? 'true' : undefined}
              className={`min-w-40 rounded-xl border px-4 py-3 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active
                  ? 'border-primary/55 bg-primary/12 shadow-sm'
                  : 'border-foreground/10 bg-card hover:-translate-y-0.5 hover:border-foreground/24'
              }`}
              onClick={() => onSelect(song)}
              type="button"
            >
              <strong className="block truncate text-base text-foreground">
                {song.title}
              </strong>
              <span className="mt-1 block truncate text-sm text-foreground/48">
                {song.artist}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SongFormDialog({
  initial,
  onSave,
}: {
  initial: SongDraft;
  onSave: (draft: SongDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SongDraft>(initial);

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.artist.trim()) return;
    onSave(draft);
    setOpen(false);
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(initial);
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger
        render={<Button className="h-11 rounded-full px-5" variant="outline" />}
      >
        <Pencil aria-hidden="true" /> 编辑歌名
      </DialogTrigger>
      <DialogContent className="max-w-lg border-foreground/12 bg-card p-6 sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">
              编辑歌名与歌手
            </DialogTitle>
            <DialogDescription>歌名和歌手为必填。</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="歌名" required>
              <Input
                className="h-11 bg-background text-base"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                required
                value={draft.title}
              />
            </FormField>
            <FormField label="歌手" required>
              <Input
                className="h-11 bg-background text-base"
                onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
                required
                value={draft.artist}
              />
            </FormField>
          </div>
          <DialogFooter className="mt-6 border-foreground/10 bg-foreground/[0.025]">
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit">保存资料</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  children,
  label,
  required = false,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium text-foreground/72">
      <span>
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function MoreActionsDialog({
  library,
  onClear,
  onDelete,
  onImport,
  onUpdate,
  song,
}: {
  library: SongLibrary;
  onClear: () => void;
  onDelete: () => void;
  onImport: (library: SongLibrary) => void;
  onUpdate: (draft: SongDraft) => void;
  song: SongRecord | null;
}) {
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<SongLibrary | null>(null);
  const [fileName, setFileName] = useState('');
  const [backupError, setBackupError] = useState('');

  function exportBackup() {
    const content = serializeSongLibraryBackup(library);
    const url = URL.createObjectURL(
      new Blob([content], { type: 'application/json;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `日本語歌集-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function chooseBackup(file: File | undefined) {
    setCandidate(null);
    setFileName('');
    setBackupError('');
    if (!file) return;
    if (file.size > MAX_BACKUP_SIZE) {
      setBackupError('备份文件不能超过 5 MB。');
      return;
    }
    try {
      const imported = parseSongLibraryBackup(await file.text());
      setCandidate(imported);
      setFileName(file.name);
    } catch (backupParseError) {
      setBackupError(errorMessage(backupParseError));
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setCandidate(null);
          setFileName('');
          setBackupError('');
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger
        render={<Button className="h-11 rounded-full px-4" variant="ghost" />}
      >
        更多
      </DialogTrigger>
      <DialogContent className="max-w-lg border-foreground/12 bg-card p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">更多</DialogTitle>
          <DialogDescription>管理当前歌曲和本机歌本。</DialogDescription>
        </DialogHeader>
        {song ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <SongFormDialog initial={song} onSave={onUpdate} />
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button className="h-11 rounded-full" variant="outline" />
                }
              >
                清除歌词
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    清除《{song.title}》的歌词？
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    歌名会保留，但歌词和生成结果将被删除。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onClear();
                      setOpen(false);
                    }}
                    variant="destructive"
                  >
                    确认清除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button className="h-11 rounded-full" variant="ghost" />
                }
              >
                <Trash2 aria-hidden="true" /> 删除歌曲
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除《{song.title}》？</AlertDialogTitle>
                  <AlertDialogDescription>
                    本机歌词也会删除，无法撤销。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onDelete();
                      setOpen(false);
                    }}
                    variant="destructive"
                  >
                    确认删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
        <div className="mt-5 border-t border-foreground/10 pt-5">
          <p className="mb-3 text-sm font-medium text-foreground/72">
            本机歌本备份
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button
              className="h-12 rounded-full"
              onClick={exportBackup}
              type="button"
              variant="outline"
            >
              <Download aria-hidden="true" /> 导出备份
            </Button>
            <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-foreground/8 px-5 text-sm font-medium text-foreground transition hover:bg-foreground/12 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
              <FileUp aria-hidden="true" className="size-4" /> 选择备份文件
              <input
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => {
                  void chooseBackup(event.target.files?.[0]);
                  event.target.value = '';
                }}
                type="file"
              />
            </label>
          </div>
          {backupError ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {backupError}
            </p>
          ) : null}
          {candidate ? (
            <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
              <p className="truncate text-sm text-foreground/72">{fileName}</p>
              <p className="mt-1 text-sm text-foreground/48">
                {candidate.songs.length} 首歌曲 ·{' '}
                {Object.keys(candidate.phoneticCorrections).length} 条校音
              </p>
              <Button
                className="mt-4 h-11 w-full rounded-full"
                onClick={() => {
                  onImport(candidate);
                  setOpen(false);
                }}
                type="button"
                variant="destructive"
              >
                覆盖本机歌本
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OnlineSongSearchDialog({
  onChoose,
  onManual,
  prominent = false,
}: {
  onChoose: SongChoiceHandler;
  onManual: (
    suggestedTitle: string,
    artist?: string,
    lyrics?: string,
    language?: SongLanguage,
  ) => void;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OnlineSongResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState('');
  const [generationStage, setGenerationStage] =
    useState<GenerationStage | null>(null);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [language, setLanguage] = useState<SongLanguage>('ja');

  async function searchSongs(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    setIsSearching(true);
    setSearchError('');
    setResults([]);
    setHasSearched(false);
    try {
      const response = await fetch(
        apiUrl(`/api/search?q=${encodeURIComponent(normalized)}`),
      );
      const payload = (await response.json()) as {
        error?: string;
        songs?: OnlineSongResult[];
      };
      if (!response.ok) throw new Error(payload.error || '搜索失败。');
      setResults(payload.songs ?? []);
      setHasSearched(true);
      if (!payload.songs?.length) {
        setSearchError('没有找到歌曲。可以试试“歌名＋歌手”，或直接粘贴歌词。');
      }
    } catch (searchFailure) {
      setSearchError(errorMessage(searchFailure));
    } finally {
      setIsSearching(false);
    }
  }

  async function chooseSong(song: OnlineSongResult) {
    setLoadingSongId(song.id);
    setGenerationStage('lyrics');
    setSearchError('');
    try {
      await onChoose(song, language, setGenerationStage);
      setOpen(false);
      setQuery('');
      setResults([]);
    } catch (selectionFailure) {
      setSearchError(errorMessage(selectionFailure));
    } finally {
      setLoadingSongId('');
      setGenerationStage(null);
    }
  }

  if (prominent) {
    return (
      <section
        aria-label={manualMode ? '粘贴歌词' : '搜索歌曲'}
        className="panel-enter rounded-2xl border border-foreground/10 bg-popover p-4 shadow-[0_20px_60px_rgb(52_69_54/10%)] sm:p-5"
      >
        {manualMode ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">
                粘贴歌词
              </h3>
              <Button
                onClick={() => setManualMode(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                返回搜索
              </Button>
            </div>
            <PasteSongStarter
              language={language}
              onLanguageChange={setLanguage}
              onManual={onManual}
            />
          </>
        ) : (
          <>
            <LanguagePicker language={language} onChange={setLanguage} />
            <form className="flex gap-2" onSubmit={searchSongs}>
              <Input
                aria-label="输入歌名或歌手"
                className="h-14 min-w-0 bg-background px-5 text-base"
                maxLength={100}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHasSearched(false);
                }}
                placeholder="输入歌名或歌手…"
                value={query}
              />
              <Button
                aria-label="搜索"
                className="h-14 shrink-0 rounded-full px-5"
                disabled={isSearching || Boolean(loadingSongId)}
                type="submit"
              >
                {isSearching ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Search />
                )}
                <span className="hidden sm:inline">搜索</span>
              </Button>
            </form>
            {searchError ? (
              <p className="mt-3 text-sm text-rose-700" role="alert">
                {searchError}
              </p>
            ) : null}
            {generationStage ? (
              <GenerationProgress language={language} stage={generationStage} />
            ) : null}
            {results.length ? (
              <div className="mt-4 space-y-2">
                {results.map((song) => (
                  <button
                    key={song.id}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-foreground/10 bg-background px-4 py-3 text-left transition-colors hover:border-primary/45 focus-visible:outline-2 focus-visible:outline-primary"
                    disabled={Boolean(loadingSongId)}
                    onClick={() => void chooseSong(song)}
                    type="button"
                  >
                    <Music2
                      aria-hidden="true"
                      className="size-5 shrink-0 text-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base text-foreground">
                        {song.title}
                      </strong>
                      <span className="mt-0.5 block truncate text-sm text-foreground/48">
                        {song.artist}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-foreground/48">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                          {song.version === 'cover' ? '翻唱' : '原版'}
                        </span>
                        <span>{formatDuration(song.duration)}</span>
                      </span>
                    </span>
                    {loadingSongId === song.id ? (
                      <LoaderCircle className="size-5 animate-spin text-primary" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {hasSearched && !results.length && !isSearching ? (
              <Button
                className="mt-2"
                onClick={() => setManualMode(true)}
                type="button"
                variant="ghost"
              >
                没搜到？粘贴歌词
              </Button>
            ) : null}
          </>
        )}
      </section>
    );
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearchError('');
          setGenerationStage(null);
          setManualMode(false);
        }
      }}
      open={open}
    >
      <DialogTrigger render={<Button className="h-11 rounded-full px-5" />}>
        <Search aria-hidden="true" />
        搜歌
      </DialogTrigger>
      <DialogContent className="max-w-xl border-foreground/12 bg-card p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">
            {manualMode ? '粘贴歌词' : '搜索歌曲'}
          </DialogTitle>
          <DialogDescription>
            {manualMode
              ? `输入歌曲资料并粘贴${language === 'yue' ? '粤语' : '日语'}歌词。`
              : '输入歌名或歌手，选择后自动生成学唱歌词。'}
          </DialogDescription>
        </DialogHeader>
        {manualMode ? (
          <>
            <PasteSongStarter
              language={language}
              onLanguageChange={setLanguage}
              onManual={(title, artist, lyrics, selectedLanguage) => {
                onManual(title, artist, lyrics, selectedLanguage);
                setOpen(false);
              }}
            />
            <Button
              className="justify-self-start"
              onClick={() => setManualMode(false)}
              type="button"
              variant="ghost"
            >
              返回搜索
            </Button>
          </>
        ) : (
          <>
            <LanguagePicker language={language} onChange={setLanguage} />
            <form className="mt-5 flex gap-2" onSubmit={searchSongs}>
              <Input
                className="h-12 min-w-0 bg-background text-base"
                maxLength={100}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHasSearched(false);
                }}
                placeholder={
                  language === 'yue'
                    ? '例如：富士山下 陈奕迅'
                    : '例如：歌名＋歌手'
                }
                value={query}
              />
              <Button
                aria-label="搜索"
                className="h-12 shrink-0 rounded-full px-5"
                disabled={isSearching || Boolean(loadingSongId)}
                type="submit"
              >
                {isSearching ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Search />
                )}
                搜索
              </Button>
            </form>
            {searchError ? (
              <p className="mt-3 text-sm text-rose-700" role="alert">
                {searchError}
              </p>
            ) : null}
            {generationStage ? (
              <GenerationProgress language={language} stage={generationStage} />
            ) : null}
            {results.length ? (
              <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
                {results.map((song) => (
                  <button
                    key={song.id}
                    className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-foreground/10 bg-background px-4 py-3 text-left transition hover:border-primary/45 focus-visible:outline-2 focus-visible:outline-primary"
                    disabled={Boolean(loadingSongId)}
                    onClick={() => void chooseSong(song)}
                    type="button"
                  >
                    <Music2
                      aria-hidden="true"
                      className="size-5 shrink-0 text-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base text-foreground">
                        {song.title}
                      </strong>
                      <span className="mt-0.5 block truncate text-sm text-foreground/48">
                        {song.artist}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-foreground/48">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                          {song.version === 'cover' ? '翻唱' : '原版'}
                        </span>
                        <span>{formatDuration(song.duration)}</span>
                      </span>
                    </span>
                    {loadingSongId === song.id ? (
                      <LoaderCircle className="size-5 animate-spin text-primary" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            {hasSearched && !results.length && !isSearching ? (
              <Button
                className="mt-2 justify-self-start"
                onClick={() => setManualMode(true)}
                type="button"
                variant="ghost"
              >
                没搜到？粘贴歌词
              </Button>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GenerationProgress({
  language,
  stage,
}: {
  language: SongLanguage;
  stage: GenerationStage;
}) {
  const stages: Array<{ id: GenerationStage; label: string }> = [
    { id: 'lyrics', label: '获取歌词' },
    {
      id: 'dictionary',
      label: language === 'yue' ? '加载粤拼词典' : '加载日语词典',
    },
    { id: 'phonetic', label: '生成音译' },
  ];
  const activeIndex = stages.findIndex((item) => item.id === stage);
  return (
    <div
      className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-primary/[0.07] p-3"
      aria-live="polite"
    >
      {stages.map((item, index) => (
        <span
          key={item.id}
          className={`text-center text-xs sm:text-sm ${
            index <= activeIndex
              ? 'font-medium text-primary'
              : 'text-foreground/38'
          }`}
        >
          {index < activeIndex ? '✓ ' : index === activeIndex ? '● ' : ''}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function PhoneticDictionaryDialog({
  corrections,
  language,
  onDelete,
  onSave,
}: {
  corrections: Record<string, string>;
  language: SongLanguage;
  onDelete: (reading: string) => void;
  onSave: (reading: string, chinesePhonetic: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState('');
  const [chinesePhonetic, setChinesePhonetic] = useState('');
  const entries = Object.entries(corrections)
    .filter(([savedReading]) =>
      language === 'yue'
        ? /[a-z]+[1-6]/iu.test(savedReading)
        : /[\u3040-\u30ff]/u.test(savedReading) ||
          /^[a-z]+(?:['-][a-z]+)*$/iu.test(savedReading),
    )
    .sort(([a], [b]) => a.localeCompare(b, language === 'yue' ? 'en' : 'ja'));

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reading.trim() || !chinesePhonetic.trim()) return;
    onSave(reading, chinesePhonetic);
    setReading('');
    setChinesePhonetic('');
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button className="h-11 rounded-full px-4" variant="ghost" />}
      >
        校音词典{entries.length ? ` ${entries.length}` : ''}
      </DialogTrigger>
      <DialogContent className="max-w-lg overflow-hidden border-foreground/12 bg-card p-6 sm:max-w-lg">
        <form className="min-w-0" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">
              本机校音词典
            </DialogTitle>
            <DialogDescription>
              相同读音再次出现时，优先使用你保存的写法。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
            <FormField label={language === 'yue' ? '粤拼读音' : '罗马音读音'}>
              <Input
                className="h-11 min-w-0 bg-background text-base"
                lang={language === 'yue' ? 'yue-Latn' : 'en'}
                onChange={(event) => setReading(event.target.value)}
                placeholder={
                  language === 'yue' ? '例如：zung1' : '例如：te'
                }
                value={reading}
              />
            </FormField>
            <FormField label="中文跟唱音">
              <Input
                className="h-11 min-w-0 bg-background text-base"
                onChange={(event) => setChinesePhonetic(event.target.value)}
                placeholder="例如：Q哟—"
                value={chinesePhonetic}
              />
            </FormField>
          </div>
          <div className="mt-4 flex justify-end">
            <Button className="h-10 rounded-full" type="submit">
              添加
            </Button>
          </div>
          {entries.length ? (
            <div className="mt-5 min-w-0 max-w-full space-y-2 overflow-x-hidden overflow-y-auto border-t border-foreground/10 pt-4">
              {entries.map(([savedReading, savedPhonetic]) => (
                <div
                  key={savedReading}
                  className="flex min-w-0 max-w-full items-start gap-3 rounded-xl bg-background px-3 py-2"
                >
                  <span className="min-w-0 flex-1 break-words text-sm leading-relaxed text-foreground/72 [overflow-wrap:anywhere]">
                    <span lang={language === 'yue' ? 'yue-Latn' : 'ja'}>
                      {savedReading}
                    </span>{' '}
                    → {savedPhonetic}
                  </span>
                  <Button
                    className="h-8 rounded-full"
                    onClick={() => onDelete(savedReading)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LyricsEditor({
  error,
  isGenerating,
  language,
  onLyricsChange,
  onSubmit,
  rawLyrics,
  songTitle,
}: {
  error: string;
  isGenerating: boolean;
  language: SongLanguage;
  onLyricsChange: (value: string) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  rawLyrics: string;
  songTitle: string;
}) {
  return (
    <section aria-labelledby="lyrics-input-title">
      <form
        className="rounded-2xl border border-foreground/10 bg-card p-5 shadow-[0_24px_80px_rgb(52_69_54/12%)] sm:p-7"
        onSubmit={onSubmit}
      >
        <h2
          id="lyrics-input-title"
          className="mb-4 text-xl font-semibold text-foreground"
        >
          {language === 'yue' ? '粤语歌词' : '日语歌词'}
        </h2>
        <label className="sr-only" htmlFor="lyrics-input">
          《{songTitle}》{language === 'yue' ? '粤语' : '日语'}歌词
        </label>
        <Textarea
          id="lyrics-input"
          aria-describedby={
            error ? 'lyrics-error lyrics-privacy' : 'lyrics-privacy'
          }
          aria-invalid={Boolean(error)}
          className="min-h-64 resize-y rounded-2xl border-foreground/12 bg-background p-5 text-base leading-8 text-foreground placeholder:text-foreground/34 focus-visible:border-primary focus-visible:ring-primary/20"
          maxLength={MAX_LYRICS_LENGTH}
          onChange={(event) => onLyricsChange(event.target.value)}
          placeholder="粘贴歌词，每行一句…"
          value={rawLyrics}
        />
        {error ? (
          <p
            id="lyrics-error"
            aria-live="polite"
            className="mt-3 text-base text-rose-700"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            id="lyrics-privacy"
            className="flex items-center gap-2 text-sm text-foreground/48"
          >
            <LockKeyhole aria-hidden="true" className="size-4 text-primary" />{' '}
            仅存本机
          </p>
          <Button
            className="h-12 rounded-full px-6 text-base font-semibold shadow-[0_10px_30px_rgb(82_107_79/18%)]"
            disabled={isGenerating}
            type="submit"
          >
            {isGenerating ? '正在生成读音…' : '生成对照歌词'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function CopyLyricsDialog({
  language,
  lines,
}: {
  language: SongLanguage;
  lines: LyricLine[];
}) {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [selected, setSelected] = useState<Record<LyricCopyTrack, boolean>>({
    japanese: true,
    romaji: true,
    chinesePhonetic: true,
  });
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const options: Array<{ track: LyricCopyTrack; label: string }> = [
    { track: 'japanese', label: language === 'yue' ? '粤语歌词' : '日语' },
    { track: 'romaji', label: language === 'yue' ? '粤拼' : '罗马音' },
    { track: 'chinesePhonetic', label: '中文音译' },
  ];
  const selectedTracks = options
    .filter(({ track }) => selected[track])
    .map(({ track }) => track);

  useEffect(
    () => () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  async function copySelected() {
    try {
      await navigator.clipboard.writeText(
        lyricTracksToText(lines, selectedTracks),
      );
      setCopyStatus(`已复制 ${selectedTracks.length} 项`);
      setOpen(false);
    } catch {
      setCopyStatus('复制失败');
    }
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setCopyStatus(''), 1_800);
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button className="h-11 rounded-full px-4" variant="outline" />}
      >
        <Copy aria-hidden="true" /> {copyStatus || '复制歌词'}
      </DialogTrigger>
      <DialogContent className="max-w-sm bg-popover p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">复制歌词</DialogTitle>
          <DialogDescription>
            选择一项或多项，按当前顺序复制。
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only">选择复制内容</legend>
          {options.map(({ track, label }) => (
            <label
              key={track}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-foreground/10 bg-background px-4 text-base transition-colors hover:border-primary/35"
              htmlFor={`copy-track-${track}`}
            >
              <Checkbox
                checked={selected[track]}
                id={`copy-track-${track}`}
                onCheckedChange={(checked) =>
                  setSelected((current) => ({
                    ...current,
                    [track]: Boolean(checked),
                  }))
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            取消
          </DialogClose>
          <Button
            disabled={!selectedTracks.length}
            onClick={() => void copySelected()}
            type="button"
          >
            复制所选
            {selectedTracks.length ? `（${selectedTracks.length}）` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LyricsReader({
  cantoneseCorrections,
  corrections,
  lines,
  onDeleteCorrection,
  onEdit,
  onSave,
  onSaveCorrection,
  onSaveCantoneseCorrection,
  onSaveWithCorrections,
  song,
}: {
  cantoneseCorrections: Record<string, string>;
  corrections: Record<string, string>;
  lines: LyricLine[];
  onDeleteCorrection: (reading: string) => void;
  onEdit: () => void;
  onSave: (lines: LyricLine[]) => void;
  onSaveCorrection: (reading: string, chinesePhonetic: string) => void;
  onSaveCantoneseCorrection: (text: string, reading: string) => void;
  onSaveWithCorrections: (
    lines: LyricLine[],
    corrections: Record<string, string>,
  ) => void;
  song: SongRecord;
}) {
  const [isEditingLines, setIsEditingLines] = useState(false);
  const [draftLines, setDraftLines] = useState<LyricLine[]>([]);
  const [isLinePractice, setIsLinePractice] = useState(false);
  const [practiceLineIndex, setPracticeLineIndex] = useState<number | null>(
    null,
  );
  const [displayMode, setDisplayMode] = useState<LyricsDisplayMode>('all');
  const [lineDisplayModes, setLineDisplayModes] = useState<
    Record<number, LyricsDisplayMode>
  >({});
  const [regeneratingLine, setRegeneratingLine] = useState<number | null>(null);
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [isUpdatingPhonetics, setIsUpdatingPhonetics] = useState(false);
  const [lineError, setLineError] = useState('');
  const [showAudioSync, setShowAudioSync] = useState(Boolean(song.sourceId));
  const [isTimingCalibration, setIsTimingCalibration] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioRetryStopped, setAudioRetryStopped] = useState(false);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [editingPhoneticIndex, setEditingPhoneticIndex] = useState<
    number | null
  >(null);
  const [phoneticDraft, setPhoneticDraft] = useState('');
  const [candidateLineIndex, setCandidateLineIndex] = useState<number | null>(
    null,
  );
  const [cantoneseCandidates, setCantoneseCandidates] = useState<
    CantoneseCandidate[]
  >([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioRetryCountRef = useRef(0);
  const audioRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioUrl = song.sourceId
    ? apiUrl(`/api/audio?id=${song.sourceId}&attempt=${audioAttempt}`)
    : '';
  const linesRef = useRef(lines);
  const captionTrack = useMemo(
    () => buildCaptionTrack(lines, audioDuration),
    [audioDuration, lines],
  );

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    if (!isLinePractice || practiceLineIndex === null) return;
    const element = document.getElementById(`lyric-line-${practiceLineIndex}`);
    if (!element) return;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    element.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [isLinePractice, practiceLineIndex]);

  useEffect(
    () => () => {
      if (audioRetryTimerRef.current) clearTimeout(audioRetryTimerRef.current);
    },
    [],
  );

  function retryAudio() {
    if (audioRetryTimerRef.current) clearTimeout(audioRetryTimerRef.current);
    audioRetryTimerRef.current = null;
    audioRetryCountRef.current = 0;
    setAudioError(false);
    setAudioRetryStopped(false);
    setAudioAttempt((current) => current + 1);
  }

  function handleAudioError() {
    setAudioError(true);
    if (audioRetryCountRef.current >= 1) {
      setAudioRetryStopped(true);
      return;
    }
    if (audioRetryTimerRef.current) return;
    audioRetryCountRef.current += 1;
    audioRetryTimerRef.current = setTimeout(() => {
      audioRetryTimerRef.current = null;
      setAudioAttempt((current) => current + 1);
    }, 1_200);
  }

  function handleAudioLoaded() {
    audioRetryCountRef.current = 0;
    setAudioError(false);
    setAudioRetryStopped(false);
  }

  function startPhoneticEdit(index: number) {
    setEditingPhoneticIndex(index);
    setPhoneticDraft(lines[index]?.chinesePhonetic ?? '');
  }

  function savePhoneticEdit(index: number) {
    const line = lines[index];
    const value = phoneticDraft.trim();
    if (!line || line.isBreak || !value) return;
    const key = normalizeReadingKey(line.reading);
    const updated = lines.map((current, lineIndex) =>
      lineIndex === index
        ? {
            ...current,
            chinesePhonetic: value,
            chinesePhoneticEdited: true,
          }
        : current,
    );
    onSaveWithCorrections(
      updated,
      key ? { ...corrections, [key]: value } : corrections,
    );
    setEditingPhoneticIndex(null);
  }

  function restorePhonetic(index: number) {
    const line = lines[index];
    if (!line || line.isBreak) return;
    const key = normalizeReadingKey(line.reading);
    const nextCorrections = { ...corrections };
    if (key) delete nextCorrections[key];
    const updated = lines.map((current, lineIndex) =>
      lineIndex === index
        ? {
            ...current,
            chinesePhonetic:
              song.language === 'yue'
                ? jyutpingToChinese(current.reading, nextCorrections)
                : readingToChinese(current.reading, nextCorrections),
            chinesePhoneticEdited: false,
            phoneticVersion: PHONETIC_RULES_VERSION,
          }
        : current,
    );
    onSaveWithCorrections(updated, nextCorrections);
    setEditingPhoneticIndex(null);
  }

  function startEditing() {
    setDraftLines(lines.map((line) => ({ ...line })));
    setIsLinePractice(false);
    setPracticeLineIndex(null);
    setIsTimingCalibration(false);
    setIsEditingLines(true);
  }

  function updateLine(
    index: number,
    field: 'japanese' | 'reading' | 'romaji' | 'chinesePhonetic',
    value: string,
  ) {
    setDraftLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
              ...(field === 'japanese'
                ? {
                    readingEdited: false,
                    romajiEdited: false,
                    chinesePhoneticEdited: false,
                    phoneticVersion: undefined,
                  }
                : {}),
              ...(field === 'reading'
                ? {
                    readingEdited: true,
                    romajiEdited: false,
                    chinesePhoneticEdited: false,
                    phoneticVersion: undefined,
                  }
                : {}),
              ...(field === 'romaji'
                ? song.language === 'yue'
                  ? { reading: value, readingEdited: true, romajiEdited: true }
                  : { romajiEdited: true }
                : {}),
              ...(field === 'chinesePhonetic'
                ? {
                    chinesePhoneticEdited: true,
                    phoneticVersion: line.phoneticVersion,
                  }
                : {}),
            }
          : line,
      ),
    );
  }

  async function regenerateDraftLine(index: number, resetManualEdits = false) {
    const line = draftLines[index];
    if (!line || line.isBreak || regeneratingLine !== null) return;
    setRegeneratingLine(index);
    setLineError('');
    try {
      const regenerated = await regenerateLyricLine(
        line,
        corrections,
        resetManualEdits,
        song.language,
        cantoneseCorrections,
      );
      setDraftLines((current) =>
        current.map((currentLine, lineIndex) =>
          lineIndex === index ? regenerated : currentLine,
        ),
      );
    } catch (generationError) {
      setLineError(errorMessage(generationError));
    } finally {
      setRegeneratingLine(null);
    }
  }

  async function saveDrafts() {
    if (regeneratingLine !== null || isSavingDrafts) return;
    setIsSavingDrafts(true);
    setLineError('');
    try {
      const updated = await Promise.all(
        draftLines.map((line) =>
          !line.isBreak && line.phoneticVersion === undefined
            ? regenerateLyricLine(
                line,
                corrections,
                false,
                song.language,
                cantoneseCorrections,
              )
            : Promise.resolve(line),
        ),
      );
      onSave(updated);
      setIsEditingLines(false);
    } catch (generationError) {
      setLineError(errorMessage(generationError));
    } finally {
      setIsSavingDrafts(false);
    }
  }

  const outdatedCount = lines.filter(
    (line) =>
      !line.isBreak &&
      line.phoneticVersion !== PHONETIC_RULES_VERSION &&
      !line.chinesePhoneticEdited,
  ).length;

  async function updateOutdatedPhonetics() {
    if (!outdatedCount || isUpdatingPhonetics) return;
    setIsUpdatingPhonetics(true);
    setLineError('');
    try {
      const updated = await Promise.all(
        lines.map((line) =>
          !line.isBreak &&
          line.phoneticVersion !== PHONETIC_RULES_VERSION &&
          !line.chinesePhoneticEdited
            ? regenerateLyricLine(
                line,
                corrections,
                false,
                song.language,
                cantoneseCorrections,
              )
            : Promise.resolve(line),
        ),
      );
      onSave(updated);
    } catch (generationError) {
      setLineError(errorMessage(generationError));
    } finally {
      setIsUpdatingPhonetics(false);
    }
  }

  async function openCantoneseCandidates(index: number) {
    const line = draftLines[index];
    if (!line || line.isBreak) return;
    setCandidateLineIndex(index);
    setCantoneseCandidates([]);
    setIsLoadingCandidates(true);
    try {
      setCantoneseCandidates(
        await getCantoneseCandidates(line.japanese, cantoneseCorrections),
      );
    } finally {
      setIsLoadingCandidates(false);
    }
  }

  async function chooseCantoneseCandidate(text: string, reading: string) {
    if (candidateLineIndex === null) return;
    const line = draftLines[candidateLineIndex];
    if (!line || line.isBreak) return;
    const nextCorrections = {
      ...cantoneseCorrections,
      [text]: reading,
    };
    setRegeneratingLine(candidateLineIndex);
    try {
      const regenerated = await regenerateLyricLine(
        line,
        corrections,
        true,
        'yue',
        nextCorrections,
      );
      setDraftLines((current) =>
        current.map((currentLine, index) =>
          index === candidateLineIndex ? regenerated : currentLine,
        ),
      );
      onSaveCantoneseCorrection(text, reading);
      setCandidateLineIndex(null);
    } finally {
      setRegeneratingLine(null);
    }
  }

  const visibleLines = isEditingLines ? draftLines : lines;
  const editingPhoneticLine =
    editingPhoneticIndex === null
      ? null
      : (lines[editingPhoneticIndex] ?? null);

  function playLine(index: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const range = getLinePlaybackRange(lines, index, audio.duration);
    if (!range) return;
    audio.currentTime = range.start;
    setStopAt(range.end);
    void audio.play();
  }

  function updateLineStartTime(index: number, seconds: number) {
    const updated = setLyricStartTime(lines, index, Math.max(0, seconds));
    if (updated === lines) return;
    onSave(updated);
    setActiveLineIndex(index);
    if (isLinePractice) setPracticeLineIndex(index);
  }

  const readableLineCount = lines.filter((line) => !line.isBreak).length;
  const hasTimedLines = lines.some(
    (line) => !line.isBreak && typeof line.startTime === 'number',
  );
  const practiceLinePosition =
    practiceLineIndex === null
      ? 0
      : lines.slice(0, practiceLineIndex + 1).filter((line) => !line.isBreak)
          .length;
  const previousPracticeLineIndex = adjacentLyricIndex(
    lines,
    practiceLineIndex,
    -1,
  );
  const nextPracticeLineIndex = adjacentLyricIndex(lines, practiceLineIndex, 1);

  function toggleLinePractice() {
    setIsLinePractice((current) => {
      const next = !current;
      setPracticeLineIndex(
        next ? (activeLineIndex ?? adjacentLyricIndex(lines, null, 1)) : null,
      );
      return next;
    });
  }

  function movePracticeLine(direction: -1 | 1) {
    const next = adjacentLyricIndex(lines, practiceLineIndex, direction);
    if (next !== null) setPracticeLineIndex(next);
  }

  function setWholeDisplayMode(mode: LyricsDisplayMode) {
    setDisplayMode(mode);
    setLineDisplayModes({});
  }

  function cycleLineDisplayMode(index: number) {
    setLineDisplayModes((current) => ({
      ...current,
      [index]: nextDisplayMode(current[index] ?? displayMode),
    }));
  }

  return (
    <section
      aria-label="对照歌词"
      className={
        isLinePractice
          ? showAudioSync && audioUrl
            ? 'pb-80 sm:pb-0'
            : 'pb-28 sm:pb-0'
          : showAudioSync && audioUrl
            ? 'pb-52 sm:pb-0'
            : undefined
      }
    >
      <SongTitle song={song} />
      {outdatedCount ? (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground/72">
            有 {outdatedCount} 句可更新为新版跟唱音，人工修改会保留。
          </p>
          <Button
            className="h-10 rounded-full"
            disabled={isUpdatingPhonetics}
            onClick={() => void updateOutdatedPhonetics()}
            size="sm"
            type="button"
          >
            {isUpdatingPhonetics ? '正在更新…' : `更新 ${outdatedCount} 句`}
          </Button>
        </div>
      ) : null}
      {lineError ? (
        <p className="mb-4 text-sm text-red-700" role="alert">
          {lineError}
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <PhoneticDictionaryDialog
          corrections={corrections}
          language={song.language}
          onDelete={onDeleteCorrection}
          onSave={onSaveCorrection}
        />
        {isEditingLines ? (
          <>
            <Button
              className="h-11 rounded-full px-4"
              onClick={onEdit}
              type="button"
              variant="ghost"
            >
              重新生成
            </Button>
            <Button
              className="h-11 rounded-full px-4"
              onClick={() => setIsEditingLines(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              className="h-11 rounded-full px-4"
              disabled={regeneratingLine !== null || isSavingDrafts}
              onClick={() => void saveDrafts()}
              type="button"
            >
              {isSavingDrafts ? '正在保存…' : '保存'}
            </Button>
          </>
        ) : (
          <>
            <Button
              className="h-11 rounded-full px-4"
              onClick={startEditing}
              type="button"
              variant="outline"
            >
              <Pencil aria-hidden="true" /> 编辑歌词
            </Button>
            <CopyLyricsDialog language={song.language} lines={lines} />
          </>
        )}
        {!isEditingLines ? (
          <>
            <Button
              className="h-11 rounded-full px-4"
              onClick={() =>
                setShowAudioSync((current) => {
                  const next = !current;
                  if (!next) setIsTimingCalibration(false);
                  return next;
                })
              }
              type="button"
              variant={showAudioSync ? 'default' : 'outline'}
            >
              <AudioLines aria-hidden="true" /> 对音源
            </Button>
            {showAudioSync && hasTimedLines ? (
              <Button
                aria-pressed={isTimingCalibration}
                className="h-11 rounded-full px-4"
                onClick={() => setIsTimingCalibration((current) => !current)}
                type="button"
                variant={isTimingCalibration ? 'default' : 'ghost'}
              >
                {isTimingCalibration ? '完成校准' : '校准时间'}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {!isEditingLines ? (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-foreground/10 bg-card/55 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <fieldset className="flex min-w-0 items-center gap-2">
            <legend className="shrink-0 px-1 text-sm font-medium text-foreground/58">
              整首显示
            </legend>
            <div className="grid min-w-0 flex-1 grid-cols-3 rounded-full bg-background/75 p-1 sm:flex-none">
              {DISPLAY_MODES.map((mode) => (
                <Button
                  aria-label={mode.description}
                  aria-pressed={displayMode === mode.id}
                  className="h-9 rounded-full px-3 text-sm"
                  key={mode.id}
                  onClick={() => setWholeDisplayMode(mode.id)}
                  size="sm"
                  title={mode.description}
                  type="button"
                  variant={displayMode === mode.id ? 'default' : 'ghost'}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
          </fieldset>
          <Button
            aria-pressed={isLinePractice}
            className="h-11 rounded-full px-5"
            onClick={toggleLinePractice}
            type="button"
            variant={isLinePractice ? 'default' : 'outline'}
          >
            {isLinePractice ? '退出逐句练唱' : '逐句练唱'}
          </Button>
        </div>
      ) : null}
      {showAudioSync && !isEditingLines ? (
        <div
          className={`panel-enter rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-[0_20px_70px_rgb(52_69_54/22%)] backdrop-blur sm:mb-4 sm:bg-primary/[0.06] sm:p-5 sm:shadow-none ${
            audioUrl
              ? `fixed inset-x-3 z-40 sm:static ${isLinePractice ? 'bottom-24' : 'bottom-3'}`
              : 'mb-4'
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground/72">
              <AudioLines aria-hidden="true" className="size-5 text-primary" />
              在线音源
            </div>
            <div className="min-w-0 flex-1">
              {audioUrl ? (
                <audio
                  ref={audioRef}
                  className="h-11 w-full"
                  controls
                  onLoadedMetadata={(event) => {
                    setAudioDuration(event.currentTarget.duration);
                    handleAudioLoaded();
                  }}
                  onError={handleAudioError}
                  onLoadedData={handleAudioLoaded}
                  onTimeUpdate={(event) => {
                    const nextIndex = activeLyricIndexAtTime(
                      linesRef.current,
                      event.currentTarget.currentTime,
                    );
                    if (nextIndex !== null) {
                      setActiveLineIndex(nextIndex);
                      if (isLinePractice) setPracticeLineIndex(nextIndex);
                    }
                    if (
                      stopAt !== null &&
                      event.currentTarget.currentTime >= stopAt - 0.03
                    ) {
                      event.currentTarget.pause();
                      setStopAt(null);
                    }
                  }}
                  playsInline
                  preload="metadata"
                  src={audioUrl}
                >
                  <track
                    default
                    kind="captions"
                    label={song.language === 'yue' ? '粤语歌词' : '日语歌词'}
                    src={captionTrack}
                    srcLang={song.language === 'yue' ? 'zh-HK' : 'ja'}
                  />
                </audio>
              ) : (
                <p className="text-sm text-foreground/48">
                  这首歌没有关联在线音源
                </p>
              )}
            </div>
          </div>
          {audioError ? (
            <div
              className="mt-2 flex items-center justify-between gap-3"
              role="alert"
            >
              <p className="text-sm text-rose-700">
                {audioRetryStopped
                  ? '音源暂时不可用，歌词仍可正常练习。'
                  : '在线音源连接失败，正在重试。'}
              </p>
              {audioRetryStopped ? (
                <Button
                  className="h-9 shrink-0 rounded-full"
                  onClick={retryAudio}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  重新连接
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-popover shadow-[0_20px_65px_rgb(52_69_54/9%)]">
        {visibleLines.map((line, index) => {
          const lineDisplayMode = lineDisplayModes[index] ?? displayMode;
          return line.isBreak ? (
            <div
              key={`break-${index}`}
              aria-hidden="true"
              className="h-7 border-y border-foreground/[0.035] bg-background/45"
            />
          ) : (
            <article
              aria-current={
                isLinePractice && practiceLineIndex === index
                  ? 'true'
                  : undefined
              }
              key={index}
              id={`lyric-line-${index}`}
              className={`border-b border-foreground/[0.07] px-5 py-6 transition-[background-color,opacity,transform] duration-300 last:border-b-0 sm:px-8 ${
                isLinePractice
                  ? practiceLineIndex === index
                    ? 'relative z-10 bg-primary/[0.10] opacity-100 shadow-[inset_4px_0_0_var(--primary)]'
                    : 'opacity-35'
                  : showAudioSync && activeLineIndex === index
                    ? 'bg-primary/[0.075]'
                    : ''
              }`}
            >
              {isEditingLines ? (
                <div className="grid gap-3">
                  <label>
                    <span className="sr-only">
                      第 {index + 1} 行
                      {song.language === 'yue' ? '粤语歌词' : '日语'}
                    </span>
                    <Textarea
                      className="min-h-12 resize-y border-foreground/12 bg-background px-4 py-3 text-[1.2rem] leading-relaxed font-semibold text-foreground"
                      lang={song.language === 'yue' ? 'zh-HK' : 'ja'}
                      onChange={(event) =>
                        updateLine(index, 'japanese', event.target.value)
                      }
                      value={line.japanese}
                    />
                  </label>
                  {song.language === 'ja' ? (
                    <label>
                      <span className="sr-only">
                        第 {index + 1} 行平假名读音
                      </span>
                      <Textarea
                        className="min-h-11 resize-y border-foreground/12 bg-background px-4 py-2 text-base leading-relaxed text-foreground/72"
                        lang="ja"
                        onChange={(event) =>
                          updateLine(index, 'reading', event.target.value)
                        }
                        placeholder="平假名读音"
                        value={line.reading}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span className="sr-only">
                      第 {index + 1} 行
                      {song.language === 'yue' ? '粤拼' : '罗马音'}
                    </span>
                    <Textarea
                      className="min-h-11 resize-y border-foreground/12 bg-background px-4 py-2 font-mono text-base leading-relaxed text-muted-foreground"
                      onChange={(event) =>
                        updateLine(index, 'romaji', event.target.value)
                      }
                      placeholder={song.language === 'yue' ? '粤拼' : '罗马音'}
                      value={line.romaji}
                    />
                  </label>
                  <label>
                    <span className="sr-only">第 {index + 1} 行中文跟唱音</span>
                    <Textarea
                      className="min-h-11 resize-y border-primary/25 bg-primary/[0.05] px-4 py-2 text-lg leading-relaxed font-medium text-primary"
                      onChange={(event) =>
                        updateLine(index, 'chinesePhonetic', event.target.value)
                      }
                      value={line.chinesePhonetic}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {song.language === 'yue' ? (
                      <Button
                        className="h-9 rounded-full"
                        disabled={isLoadingCandidates}
                        onClick={() => void openCantoneseCandidates(index)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {isLoadingCandidates && candidateLineIndex === index
                          ? '正在读取…'
                          : '选择多音读法'}
                      </Button>
                    ) : null}
                    <Button
                      className="h-9 rounded-full"
                      disabled={regeneratingLine !== null}
                      onClick={() => void regenerateDraftLine(index)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {regeneratingLine === index ? '正在重算…' : '重算本句'}
                    </Button>
                    <Button
                      className="h-9 rounded-full"
                      disabled={regeneratingLine !== null}
                      onClick={() => void regenerateDraftLine(index, true)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      恢复自动
                    </Button>
                    {line.chinesePhoneticEdited && line.reading.trim() ? (
                      <Button
                        className="h-9 rounded-full"
                        onClick={() =>
                          onSaveCorrection(line.reading, line.chinesePhonetic)
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        记住此写法
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <p
                      lang={song.language === 'yue' ? 'zh-HK' : 'ja'}
                      className="min-w-0 flex-1 text-[1.35rem] leading-relaxed font-semibold tracking-[0.015em] text-foreground sm:text-[1.6rem]"
                    >
                      {line.japanese}
                    </p>
                    <Button
                      aria-label={`切换第 ${index + 1} 句显示方式，当前${DISPLAY_MODES.find((mode) => mode.id === lineDisplayMode)?.label}`}
                      className="h-8 shrink-0 rounded-full px-2.5 text-xs text-foreground/52"
                      onClick={() => cycleLineDisplayMode(index)}
                      size="sm"
                      title="切换本句显示"
                      type="button"
                      variant="ghost"
                    >
                      本句·
                      {
                        DISPLAY_MODES.find(
                          (mode) => mode.id === lineDisplayMode,
                        )?.label
                      }
                    </Button>
                  </div>
                  {lineDisplayMode !== 'original' ? (
                    <p className="mt-2 font-mono text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {line.romaji}
                    </p>
                  ) : null}
                  {lineDisplayMode === 'all' ? (
                    <button
                      className="mt-2 flex w-full items-center gap-2 rounded-lg text-left text-lg leading-relaxed font-medium tracking-[0.02em] text-primary transition-colors hover:bg-primary/[0.05] focus-visible:outline-2 focus-visible:outline-primary sm:text-xl"
                      onClick={() => startPhoneticEdit(index)}
                      type="button"
                    >
                      <span>{line.chinesePhonetic}</span>
                      {line.chinesePhoneticEdited ? (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs tracking-normal">
                          已修改
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {showAudioSync ? (
                    <div className="mt-4 border-t border-foreground/[0.07] pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          className="h-10 rounded-full"
                          disabled={
                            !audioUrl || typeof line.startTime !== 'number'
                          }
                          onClick={() => playLine(index)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Play aria-hidden="true" /> 播放本句
                        </Button>
                        {isTimingCalibration ? (
                          <>
                            <span className="rounded-full bg-primary/[0.07] px-3 py-2 font-mono text-xs text-foreground/58">
                              {typeof line.startTime === 'number'
                                ? formatLyricTime(line.startTime)
                                : '--:--.-'}
                            </span>
                            <Button
                              aria-label={`第 ${index + 1} 句提前 0.5 秒`}
                              className="h-10 rounded-full"
                              disabled={typeof line.startTime !== 'number'}
                              onClick={() =>
                                updateLineStartTime(
                                  index,
                                  line.startTime! - 0.5,
                                )
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              提前 0.5 秒
                            </Button>
                            <Button
                              aria-label={`第 ${index + 1} 句推迟 0.5 秒`}
                              className="h-10 rounded-full"
                              disabled={typeof line.startTime !== 'number'}
                              onClick={() =>
                                updateLineStartTime(
                                  index,
                                  line.startTime! + 0.5,
                                )
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              推迟 0.5 秒
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </div>
      {isLinePractice ? (
        <nav
          aria-label="逐句练唱控制"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center gap-2 rounded-2xl border border-primary/20 bg-card/95 p-2 shadow-[0_18px_55px_rgb(52_69_54/28%)] backdrop-blur sm:sticky sm:inset-x-auto sm:bottom-4 sm:mt-4"
        >
          <Button
            aria-label="上一句"
            className="h-12 flex-1 rounded-xl"
            disabled={previousPracticeLineIndex === null}
            onClick={() => movePracticeLine(-1)}
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" /> 上一句
          </Button>
          <p
            aria-live="polite"
            className="min-w-16 text-center text-sm font-medium text-foreground/64"
          >
            {practiceLinePosition} / {readableLineCount}
          </p>
          <Button
            aria-label="下一句"
            className="h-12 flex-1 rounded-xl"
            disabled={nextPracticeLineIndex === null}
            onClick={() => movePracticeLine(1)}
            type="button"
          >
            下一句 <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      ) : null}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setCandidateLineIndex(null);
        }}
        open={candidateLineIndex !== null}
      >
        <DialogContent className="max-w-lg bg-popover p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">选择粤拼读音</DialogTitle>
            <DialogDescription>
              选择后会记住这个词语，下次自动使用相同读音。
            </DialogDescription>
          </DialogHeader>
          {isLoadingCandidates ? (
            <p className="py-6 text-center text-sm text-foreground/52">
              正在读取候选读音…
            </p>
          ) : cantoneseCandidates.length ? (
            <div className="max-h-[55vh] space-y-3 overflow-y-auto">
              {cantoneseCandidates.map((candidate) => (
                <section
                  key={candidate.text}
                  className="rounded-xl border border-foreground/10 bg-background p-3"
                >
                  <p className="mb-2 text-lg font-semibold" lang="zh-HK">
                    {candidate.text}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {candidate.readings.map((reading) => (
                      <Button
                        key={reading}
                        className="h-9 rounded-full font-mono"
                        onClick={() =>
                          void chooseCantoneseCandidate(candidate.text, reading)
                        }
                        size="sm"
                        type="button"
                        variant={
                          cantoneseCorrections[candidate.text] === reading
                            ? 'default'
                            : 'outline'
                        }
                      >
                        {reading}
                      </Button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-foreground/52">
              本句没有需要选择的多音读法。
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              关闭
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        onOpenChange={(open) => {
          if (!open) setEditingPhoneticIndex(null);
        }}
        open={editingPhoneticIndex !== null}
      >
        <DialogContent className="top-auto right-0 bottom-0 left-0 max-w-none translate-x-0 translate-y-0 gap-5 rounded-t-3xl rounded-b-none bg-popover p-5 data-open:slide-in-from-bottom-6 data-closed:slide-out-to-bottom-6 sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">修改中文跟唱音</DialogTitle>
            <DialogDescription lang="ja">
              {editingPhoneticLine?.japanese}
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="phonetic-line-editor">
            <span className="mb-2 block text-sm font-medium text-foreground/60">
              中文跟唱音
            </span>
            <Input
              id="phonetic-line-editor"
              className="h-12 bg-background text-lg text-primary"
              onChange={(event) => setPhoneticDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && editingPhoneticIndex !== null) {
                  savePhoneticEdit(editingPhoneticIndex);
                }
              }}
              value={phoneticDraft}
            />
          </label>
          <DialogFooter className="-mx-5 -mb-5 rounded-b-none px-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:-mb-6 sm:rounded-b-2xl sm:px-6">
            {editingPhoneticIndex !== null ? (
              <Button
                onClick={() => restorePhonetic(editingPhoneticIndex)}
                type="button"
                variant="ghost"
              >
                恢复自动结果
              </Button>
            ) : null}
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button
              disabled={!phoneticDraft.trim()}
              onClick={() => {
                if (editingPhoneticIndex !== null) {
                  savePhoneticEdit(editingPhoneticIndex);
                }
              }}
              type="button"
            >
              保存并记住
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '时长未知';
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function buildCaptionTrack(lines: LyricLine[], duration: number): string {
  const cues = lines.flatMap((line, index) => {
    const range = getLinePlaybackRange(lines, index, duration);
    if (line.isBreak || !range) return [];
    return [
      `${formatVttTimestamp(range.start)} --> ${formatVttTimestamp(range.end)}\n${line.japanese}`,
    ];
  });
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n${cues.join('\n\n')}`)}`;
}

function formatVttTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remaining}`;
}
