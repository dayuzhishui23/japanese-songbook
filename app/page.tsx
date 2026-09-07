'use client';

import {
  ArrowLeft,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileUp,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Pencil,
  Play,
  Search,
  TimerReset,
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
  MAX_LYRICS_LENGTH,
  PHONETIC_RULES_VERSION,
  regenerateLyricLine,
  setLyricStartTime,
  type LyricLine,
} from '@/lib/lyrics';
import { normalizeReadingKey } from '@/lib/phonetic';
import type {
  OnlineSongResult,
  TimedLyricLine,
} from '@/lib/online-music';
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

const MAX_BACKUP_SIZE = 5 * 1024 * 1024;
const SITES_ORIGIN = 'https://lemon-lyrics-practice.dayuzhishui23.chatgpt.site';

function apiUrl(path: string): string {
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')) {
    return `${SITES_ORIGIN}${path}`;
  }
  return path;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '暂时无法生成读音，请稍后重试。你的原歌词仍然保留着。';
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
          '把用户提供的日语歌词转换为日语、罗马音和中文跟唱近似音，并保存到当前选中的歌曲。',
        inputSchema: {
          type: 'object',
          properties: {
            lyrics: {
              type: 'string',
              minLength: 1,
              maxLength: MAX_LYRICS_LENGTH,
              description: '用户合法取得并提供的日语歌词，每行一句。',
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
  }

  async function addOnlineSong(result: OnlineSongResult) {
    setIsGenerating(true);
    setError('');
    try {
      const response = await fetch(apiUrl(`/api/lyrics?id=${result.id}`));
      const payload = (await response.json()) as {
        error?: string;
        lyrics?: string;
        timedLines?: TimedLyricLine[];
      };
      if (!response.ok || !payload.lyrics || !payload.timedLines?.length) {
        throw new Error(payload.error || '这首歌暂时没有可用歌词。');
      }
      const converted = await convertLyrics(
        payload.lyrics,
        library.phoneticCorrections,
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
            song.title.toLocaleLowerCase() === result.title.toLocaleLowerCase() &&
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
      };
      const songs = existing
        ? library.songs.map((current) =>
            current.id === existing.id ? song : current,
          )
        : [...library.songs, song];
      persist({ ...library, activeSongId: song.id, songs });
      setRawLyrics(payload.lyrics);
      setIsEditing(false);
    } catch (onlineError) {
      const message = errorMessage(onlineError);
      setError(message);
      throw new Error(message);
    } finally {
      setIsGenerating(false);
    }
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
      version: 3,
      activeSongId: nextActive?.id ?? '',
      songs,
      phoneticCorrections: library.phoneticCorrections,
    });
    setRawLyrics(nextActive?.rawLyrics ?? '');
    setIsEditing(!nextActive?.lines.length);
    setError('');
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
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-11 rounded-xl bg-cover bg-center sm:size-14"
              style={{ backgroundImage: "url('./songbook-icon.png')" }}
            />
            <h1 className="font-heading text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-4xl">
              日本語歌集
            </h1>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <LibraryBackupDialog library={library} onImport={importLibrary} />
            <OnlineSongSearchDialog onChoose={addOnlineSong} />
          </div>
        </header>

        <SongShelf
          activeSongId={library.activeSongId}
          onSelect={selectSong}
          songs={library.songs}
        />

        {activeSong ? (
          <>
            <SongHeader
              onDelete={deleteSong}
              onUpdate={updateSong}
              song={activeSong}
            />
            {isEditing ? (
              <LyricsEditor
                error={error}
                isGenerating={isGenerating}
                onLyricsChange={setRawLyrics}
                onSubmit={handleSubmit}
                rawLyrics={rawLyrics}
                songTitle={activeSong.title}
              />
            ) : (
              <LyricsReader
                corrections={library.phoneticCorrections}
                key={activeSong.id}
                lines={activeSong.lines}
                onClear={clearCurrentLyrics}
                onDeleteCorrection={deletePhoneticCorrection}
                onEdit={() => setIsEditing(true)}
                onSave={saveEditedLines}
                onSaveCorrection={savePhoneticCorrection}
                song={activeSong}
              />
            )}
          </>
        ) : (
          <EmptyLibrary onChoose={addOnlineSong} />
        )}
      </div>
    </main>
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
              className={`min-w-40 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active
                  ? 'border-primary/55 bg-primary/12'
                  : 'border-foreground/10 bg-card hover:border-foreground/24'
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

function SongHeader({
  onDelete,
  onUpdate,
  song,
}: {
  onDelete: () => void;
  onUpdate: (draft: SongDraft) => void;
  song: SongRecord;
}) {
  return (
    <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-foreground/10 bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h2 className="truncate text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">
          {song.title}
        </h2>
        <p className="mt-2 text-lg text-foreground/62">{song.artist}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {song.officialUrl ? (
          <ExternalLinkButton href={song.officialUrl} label="歌曲资料" />
        ) : null}
        {song.mvUrl ? (
          <ExternalLinkButton href={song.mvUrl} label="官方 MV" />
        ) : null}
        <SongFormDialog initial={song} onSave={onUpdate} />
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button className="h-11 rounded-full" size="sm" variant="ghost" />
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
              <AlertDialogAction onClick={onDelete} variant="destructive">
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}

function ExternalLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/14 px-4 text-sm font-medium text-foreground/72 transition hover:border-primary/55 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label} <ExternalLink aria-hidden="true" className="size-4" />
    </a>
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
        render={
          <Button
            className="h-11 rounded-full px-5"
            variant="outline"
          />
        }
      >
        <Pencil aria-hidden="true" /> 编辑资料
      </DialogTrigger>
      <DialogContent className="max-w-lg border-foreground/12 bg-card p-6 sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">
              编辑歌曲资料
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
            <FormField label="歌曲资料链接">
              <Input
                className="h-11 bg-background text-base"
                onChange={(e) =>
                  setDraft({ ...draft, officialUrl: e.target.value })
                }
                placeholder="https://…"
                type="url"
                value={draft.officialUrl}
              />
            </FormField>
            <FormField label="官方 MV 链接">
              <Input
                className="h-11 bg-background text-base"
                onChange={(e) => setDraft({ ...draft, mvUrl: e.target.value })}
                placeholder="https://…"
                type="url"
                value={draft.mvUrl}
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
    <label className="grid gap-2 text-sm font-medium text-foreground/72">
      <span>
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function LibraryBackupDialog({
  library,
  onImport,
}: {
  library: SongLibrary;
  onImport: (library: SongLibrary) => void;
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
        备份
      </DialogTrigger>
      <DialogContent className="max-w-lg border-foreground/12 bg-card p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">本机歌本备份</DialogTitle>
          <DialogDescription>
            保存歌曲、校音和时间点，不包含音频文件。
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}

function OnlineSongSearchDialog({
  onChoose,
}: {
  onChoose: (song: OnlineSongResult) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OnlineSongResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingSongId, setLoadingSongId] = useState('');
  const [searchError, setSearchError] = useState('');

  async function searchSongs(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    setIsSearching(true);
    setSearchError('');
    setResults([]);
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
      if (!payload.songs?.length) setSearchError('没有找到歌曲。');
    } catch (searchFailure) {
      setSearchError(errorMessage(searchFailure));
    } finally {
      setIsSearching(false);
    }
  }

  async function chooseSong(song: OnlineSongResult) {
    setLoadingSongId(song.id);
    setSearchError('');
    try {
      await onChoose(song);
      setOpen(false);
      setQuery('');
      setResults([]);
    } catch (selectionFailure) {
      setSearchError(errorMessage(selectionFailure));
    } finally {
      setLoadingSongId('');
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchError('');
      }}
      open={open}
    >
      <DialogTrigger
        render={<Button className="h-11 rounded-full px-5" />}
      >
        <Search aria-hidden="true" /> 搜歌
      </DialogTrigger>
      <DialogContent className="max-w-xl border-foreground/12 bg-card p-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">搜索歌曲</DialogTitle>
          <DialogDescription>输入歌名或歌手，选择后自动生成学唱歌词。</DialogDescription>
        </DialogHeader>
        <form className="mt-5 flex gap-2" onSubmit={searchSongs}>
          <Input
            className="h-12 min-w-0 bg-background text-base"
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：Lemon 米津玄師"
            value={query}
          />
          <Button
            className="h-12 shrink-0 rounded-full px-5"
            disabled={isSearching || Boolean(loadingSongId)}
            type="submit"
          >
            {isSearching ? <LoaderCircle className="animate-spin" /> : <Search />}
            搜索
          </Button>
        </form>
        {searchError ? (
          <p className="mt-3 text-sm text-rose-700" role="alert">
            {searchError}
          </p>
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
                <Music2 aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-base text-foreground">
                    {song.title}
                  </strong>
                  <span className="mt-0.5 block truncate text-sm text-foreground/48">
                    {song.artist}
                  </span>
                </span>
                {loadingSongId === song.id ? (
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EmptyLibrary({
  onChoose,
}: {
  onChoose: (song: OnlineSongResult) => Promise<void>;
}) {
  return (
    <section className="grid min-h-80 place-items-center rounded-[1.75rem] border border-dashed border-foreground/16 bg-card p-8 text-center">
      <div>
        <Music2 aria-hidden="true" className="mx-auto size-10 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold text-foreground">歌本还是空的</h2>
        <div className="mt-5">
          <OnlineSongSearchDialog onChoose={onChoose} />
        </div>
      </div>
    </section>
  );
}

function PhoneticDictionaryDialog({
  corrections,
  onDelete,
  onSave,
}: {
  corrections: Record<string, string>;
  onDelete: (reading: string) => void;
  onSave: (reading: string, chinesePhonetic: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState('');
  const [chinesePhonetic, setChinesePhonetic] = useState('');
  const entries = Object.entries(corrections).sort(([a], [b]) =>
    a.localeCompare(b, 'ja'),
  );

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
      <DialogContent className="max-w-lg border-foreground/12 bg-card p-6 sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-foreground">
              本机校音词典
            </DialogTitle>
            <DialogDescription>
              相同读音再次出现时，优先使用你保存的写法。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <FormField label="平假名读音">
              <Input
                className="h-11 bg-background text-base"
                lang="ja"
                onChange={(event) => setReading(event.target.value)}
                placeholder="例如：きょう"
                value={reading}
              />
            </FormField>
            <FormField label="中文跟唱音">
              <Input
                className="h-11 bg-background text-base"
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
            <div className="mt-5 max-h-56 space-y-2 overflow-y-auto border-t border-foreground/10 pt-4">
              {entries.map(([savedReading, savedPhonetic]) => (
                <div
                  key={savedReading}
                  className="flex items-center gap-3 rounded-xl bg-background px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/72">
                    <span lang="ja">{savedReading}</span> → {savedPhonetic}
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
  onLyricsChange,
  onSubmit,
  rawLyrics,
  songTitle,
}: {
  error: string;
  isGenerating: boolean;
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
          日语歌词
        </h2>
        <label className="sr-only" htmlFor="lyrics-input">
          《{songTitle}》日语歌词
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

function LyricsReader({
  corrections,
  lines,
  onClear,
  onDeleteCorrection,
  onEdit,
  onSave,
  onSaveCorrection,
  song,
}: {
  corrections: Record<string, string>;
  lines: LyricLine[];
  onClear: () => void;
  onDeleteCorrection: (reading: string) => void;
  onEdit: () => void;
  onSave: (lines: LyricLine[]) => void;
  onSaveCorrection: (reading: string, chinesePhonetic: string) => void;
  song: SongRecord;
}) {
  const [isEditingLines, setIsEditingLines] = useState(false);
  const [draftLines, setDraftLines] = useState<LyricLine[]>([]);
  const [regeneratingLine, setRegeneratingLine] = useState<number | null>(null);
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [isUpdatingPhonetics, setIsUpdatingPhonetics] = useState(false);
  const [lineError, setLineError] = useState('');
  const [showAudioSync, setShowAudioSync] = useState(Boolean(song.sourceId));
  const [audioError, setAudioError] = useState(false);
  const [audioAttempt, setAudioAttempt] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
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
    setAudioAttempt((current) => current + 1);
  }

  function handleAudioError() {
    setAudioError(true);
    if (audioRetryCountRef.current >= 2 || audioRetryTimerRef.current) return;
    audioRetryCountRef.current += 1;
    audioRetryTimerRef.current = setTimeout(() => {
      audioRetryTimerRef.current = null;
      setAudioAttempt((current) => current + 1);
    }, 1_200);
  }

  function handleAudioLoaded() {
    audioRetryCountRef.current = 0;
    setAudioError(false);
  }

  function startEditing() {
    setDraftLines(lines.map((line) => ({ ...line })));
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
              ...(field === 'romaji' ? { romajiEdited: true } : {}),
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
            ? regenerateLyricLine(line, corrections)
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
            ? regenerateLyricLine(line, corrections)
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

  const visibleLines = isEditingLines ? draftLines : lines;

  function markLine(index: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const updated = setLyricStartTime(
      linesRef.current,
      index,
      audio.currentTime,
    );
    linesRef.current = updated;
    onSave(updated);
    setActiveLineIndex(index);
  }

  function selectActiveLine(index: number) {
    setActiveLineIndex(index);
    requestAnimationFrame(() => {
      document
        .getElementById(`lyric-line-${index}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function moveActiveLine(direction: -1 | 1) {
    const next = adjacentLyricIndex(lines, activeLineIndex, direction);
    if (next !== null) selectActiveLine(next);
  }

  function markAndAdvance() {
    const audio = audioRef.current;
    const current = activeLineIndex ?? adjacentLyricIndex(lines, null, 1);
    if (!audio || current === null) return;
    const updated = setLyricStartTime(
      linesRef.current,
      current,
      audio.currentTime,
    );
    linesRef.current = updated;
    onSave(updated);
    const next = adjacentLyricIndex(lines, current, 1);
    if (next !== null) selectActiveLine(next);
  }

  function playLine(index: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const range = getLinePlaybackRange(lines, index, audio.duration);
    if (!range) return;
    audio.currentTime = range.start;
    setStopAt(range.end);
    void audio.play();
  }

  function clearTimings() {
    const updated = linesRef.current.map((line) => ({
      ...line,
      startTime: undefined,
    }));
    linesRef.current = updated;
    onSave(updated);
    setStopAt(null);
  }

  const activeLine =
    activeLineIndex === null ? null : (lines[activeLineIndex] ?? null);

  return (
    <section
      aria-label="对照歌词"
      className={showAudioSync && audioUrl ? 'pb-52 sm:pb-0' : undefined}
    >
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
          onDelete={onDeleteCorrection}
          onSave={onSaveCorrection}
        />
        {isEditingLines ? (
          <>
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
          <Button
            className="h-11 rounded-full px-4"
            onClick={startEditing}
            type="button"
            variant="outline"
          >
            <Pencil aria-hidden="true" /> 编辑歌词
          </Button>
        )}
        {!isEditingLines ? (
          <>
            <Button
              className="h-11 rounded-full px-4"
              onClick={onEdit}
              type="button"
              variant="outline"
            >
              <ArrowLeft aria-hidden="true" /> 重新生成
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    className="h-11 rounded-full px-4"
                    type="button"
                    variant="destructive"
                  />
                }
              >
                <Trash2 aria-hidden="true" /> 清除此歌歌词
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>清除此歌的本机歌词？</AlertDialogTitle>
                  <AlertDialogDescription>
                    歌曲资料会保留，但粘贴的歌词和生成结果将被删除。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={onClear} variant="destructive">
                    确认清除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
        {!isEditingLines ? (
          <Button
            className="h-11 rounded-full px-4"
            onClick={() => {
              setShowAudioSync((current) => !current);
              setActiveLineIndex((current) =>
                current === null ? adjacentLyricIndex(lines, null, 1) : current,
              );
            }}
            type="button"
            variant={showAudioSync ? 'default' : 'outline'}
          >
            <AudioLines aria-hidden="true" /> 对音源
          </Button>
        ) : null}
      </div>
      {showAudioSync && !isEditingLines ? (
        <div
          className={`rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-[0_20px_70px_rgb(52_69_54/22%)] backdrop-blur sm:mb-4 sm:bg-primary/[0.06] sm:p-5 sm:shadow-none ${
            audioUrl ? 'fixed inset-x-3 bottom-3 z-40 sm:static' : 'mb-4'
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
                    if (nextIndex !== null) setActiveLineIndex(nextIndex);
                    if (
                      stopAt !== null &&
                      event.currentTarget.currentTime >= stopAt - 0.03
                    ) {
                      event.currentTarget.pause();
                      setStopAt(null);
                    }
                  }}
                  playsInline
                  src={audioUrl}
                >
                  <track
                    default
                    kind="captions"
                    label="日语歌词"
                    src={captionTrack}
                    srcLang="ja"
                  />
                </audio>
              ) : (
                <p className="text-sm text-foreground/48">这首歌没有关联在线音源</p>
              )}
            </div>
            {lines.some((line) => typeof line.startTime === 'number') ? (
              <Button
                className="h-11 rounded-full"
                onClick={clearTimings}
                type="button"
                variant="ghost"
              >
                <TimerReset aria-hidden="true" /> 清除时间
              </Button>
            ) : null}
          </div>
          {audioError ? (
            <div className="mt-2 flex items-center justify-between gap-3" role="alert">
              <p className="text-sm text-rose-700">
                在线音源连接失败，正在自动重试。
              </p>
              <Button
                className="h-9 shrink-0 rounded-full"
                onClick={retryAudio}
                size="sm"
                type="button"
                variant="outline"
              >
                立即重试
              </Button>
            </div>
          ) : null}
          {audioUrl && activeLine && !activeLine.isBreak ? (
            <div className="mt-3 grid gap-3 border-t border-foreground/10 pt-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <div className="flex items-center gap-1">
                <Button
                  aria-label="上一句"
                  className="size-10 rounded-full"
                  disabled={
                    adjacentLyricIndex(lines, activeLineIndex, -1) === null
                  }
                  onClick={() => moveActiveLine(-1)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <Button
                  aria-label="下一句"
                  className="size-10 rounded-full"
                  disabled={
                    adjacentLyricIndex(lines, activeLineIndex, 1) === null
                  }
                  onClick={() => moveActiveLine(1)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
              <p
                className="min-w-0 truncate text-base font-medium text-foreground"
                lang="ja"
              >
                {activeLine.japanese}
              </p>
              <Button
                className="h-11 rounded-full px-5"
                onClick={markAndAdvance}
                type="button"
              >
                标记并下一句
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-[0_24px_80px_rgb(52_69_54/12%)]">
        {visibleLines.map((line, index) =>
          line.isBreak ? (
            <div
              key={`break-${index}`}
              aria-hidden="true"
              className="h-9 border-y border-foreground/[0.035] bg-background/55"
            />
          ) : (
            <article
              key={index}
              id={`lyric-line-${index}`}
              className={`border-b border-foreground/[0.07] px-5 py-7 last:border-b-0 sm:px-8 ${
                showAudioSync && activeLineIndex === index
                  ? 'bg-primary/[0.07] ring-1 ring-inset ring-primary/30'
                  : ''
              }`}
            >
              {isEditingLines ? (
                <div className="grid gap-3">
                  <label>
                    <span className="sr-only">第 {index + 1} 行日语</span>
                    <Textarea
                      className="min-h-12 resize-y border-foreground/12 bg-background px-4 py-3 text-[1.2rem] leading-relaxed font-semibold text-foreground"
                      lang="ja"
                      onChange={(event) =>
                        updateLine(index, 'japanese', event.target.value)
                      }
                      value={line.japanese}
                    />
                  </label>
                  <label>
                    <span className="sr-only">第 {index + 1} 行平假名读音</span>
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
                  <label>
                    <span className="sr-only">第 {index + 1} 行罗马音</span>
                    <Textarea
                      className="min-h-11 resize-y border-foreground/12 bg-background px-4 py-2 font-mono text-base leading-relaxed text-muted-foreground"
                      onChange={(event) =>
                        updateLine(index, 'romaji', event.target.value)
                      }
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
                  <p
                    lang="ja"
                    className="text-[1.35rem] leading-relaxed font-semibold tracking-[0.015em] text-foreground sm:text-[1.6rem]"
                  >
                    {line.japanese}
                  </p>
                  <p className="mt-2 font-mono text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {line.romaji}
                  </p>
                  <p className="mt-2 text-lg leading-relaxed font-medium tracking-[0.06em] text-primary sm:text-xl">
                    {line.chinesePhonetic}
                  </p>
                  {showAudioSync ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/[0.07] pt-4">
                      <span className="min-w-16 font-mono text-sm text-foreground/48">
                        {typeof line.startTime === 'number'
                          ? formatTimestamp(line.startTime)
                          : '--:--.-'}
                      </span>
                      <Button
                        className="h-10 rounded-full"
                        disabled={!audioUrl}
                        onClick={() => markLine(index)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        标记起点
                      </Button>
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
                    </div>
                  ) : null}
                </>
              )}
            </article>
          ),
        )}
      </div>
      <p className="mt-3 text-sm text-foreground/42">
        · 短停顿　— 长音　中文为跟唱近似音　在线来源可能失效
      </p>
    </section>
  );
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${remaining}`;
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
