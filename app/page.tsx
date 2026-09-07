'use client';

import {
  ArrowLeft,
  ExternalLink,
  LockKeyhole,
  Music2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
import { convertLyrics, MAX_LYRICS_LENGTH, type LyricLine } from '@/lib/lyrics';
import {
  createDefaultLibrary,
  loadSongLibrary,
  saveSongLibrary,
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

const EMPTY_DRAFT: SongDraft = {
  title: '',
  artist: '',
  officialUrl: '',
  mvUrl: '',
};

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
      const converted = await convertLyrics(lyrics);
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

  function addSong(draft: SongDraft) {
    const song: SongRecord = {
      id: createSongId(),
      ...draft,
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      officialUrl: draft.officialUrl.trim(),
      mvUrl: draft.mvUrl.trim(),
      rawLyrics: '',
      lines: [],
      updatedAt: '',
    };
    persist({
      ...library,
      activeSongId: song.id,
      songs: [...library.songs, song],
    });
    setRawLyrics('');
    setIsEditing(true);
    setError('');
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
    persist({ version: 2, activeSongId: nextActive?.id ?? '', songs });
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
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <h1 className="font-heading text-2xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            日语歌本
          </h1>
          <SongFormDialog mode="add" onSave={addSong} />
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
                lines={activeSong.lines}
                onClear={clearCurrentLyrics}
                onEdit={() => setIsEditing(true)}
              />
            )}
          </>
        ) : (
          <EmptyLibrary onAdd={addSong} />
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
                  : 'border-white/10 bg-card hover:border-white/24'
              }`}
              onClick={() => onSelect(song)}
              type="button"
            >
              <strong className="block truncate text-base text-white">
                {song.title}
              </strong>
              <span className="mt-1 block truncate text-sm text-white/48">
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
    <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#08152f] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <h2 className="truncate text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
          {song.title}
        </h2>
        <p className="mt-2 text-lg text-white/62">{song.artist}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {song.officialUrl ? (
          <ExternalLinkButton href={song.officialUrl} label="歌曲资料" />
        ) : null}
        {song.mvUrl ? (
          <ExternalLinkButton href={song.mvUrl} label="官方 MV" />
        ) : null}
        <SongFormDialog initial={song} mode="edit" onSave={onUpdate} />
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
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 px-4 text-sm font-medium text-white/72 transition hover:border-primary/55 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
  mode,
  onSave,
}: {
  initial?: SongDraft;
  mode: 'add' | 'edit';
  onSave: (draft: SongDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SongDraft>(initial ?? EMPTY_DRAFT);

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.artist.trim()) return;
    onSave(draft);
    setOpen(false);
  }

  const add = mode === 'add';
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraft(initial ?? EMPTY_DRAFT);
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <Button
            className="h-11 rounded-full px-5"
            variant={add ? 'default' : 'outline'}
          />
        }
      >
        {add ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
        {add ? '添加歌曲' : '编辑资料'}
      </DialogTrigger>
      <DialogContent className="max-w-lg border-white/12 bg-card p-6 sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-white">
              {add ? '添加歌曲' : '编辑歌曲资料'}
            </DialogTitle>
            <DialogDescription>歌名和歌手为必填。</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="歌名" required>
              <Input
                className="h-11 bg-[#07122b] text-base"
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                required
                value={draft.title}
              />
            </FormField>
            <FormField label="歌手" required>
              <Input
                className="h-11 bg-[#07122b] text-base"
                onChange={(e) => setDraft({ ...draft, artist: e.target.value })}
                required
                value={draft.artist}
              />
            </FormField>
            <FormField label="歌曲资料链接">
              <Input
                className="h-11 bg-[#07122b] text-base"
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
                className="h-11 bg-[#07122b] text-base"
                onChange={(e) => setDraft({ ...draft, mvUrl: e.target.value })}
                placeholder="https://…"
                type="url"
                value={draft.mvUrl}
              />
            </FormField>
          </div>
          <DialogFooter className="mt-6 border-white/10 bg-white/[0.025]">
            <DialogClose render={<Button type="button" variant="outline" />}>
              取消
            </DialogClose>
            <Button type="submit">{add ? '添加并填写歌词' : '保存资料'}</Button>
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
    <label className="grid gap-2 text-sm font-medium text-white/72">
      <span>
        {label}
        {required ? <span className="ml-1 text-primary">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function EmptyLibrary({ onAdd }: { onAdd: (draft: SongDraft) => void }) {
  return (
    <section className="grid min-h-80 place-items-center rounded-[1.75rem] border border-dashed border-white/16 bg-card p-8 text-center">
      <div>
        <Music2 aria-hidden="true" className="mx-auto size-10 text-primary" />
        <h2 className="mt-4 text-2xl font-semibold text-white">歌本还是空的</h2>
        <div className="mt-5">
          <SongFormDialog mode="add" onSave={onAdd} />
        </div>
      </div>
    </section>
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
        className="rounded-2xl border border-white/10 bg-card p-5 shadow-[0_24px_80px_rgb(2_6_23/28%)] sm:p-7"
        onSubmit={onSubmit}
      >
        <h2
          id="lyrics-input-title"
          className="mb-4 text-xl font-semibold text-white"
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
          className="min-h-64 resize-y rounded-2xl border-white/12 bg-[#07122b] p-5 text-base leading-8 text-white placeholder:text-white/34 focus-visible:border-primary focus-visible:ring-primary/20"
          maxLength={MAX_LYRICS_LENGTH}
          onChange={(event) => onLyricsChange(event.target.value)}
          placeholder="粘贴歌词，每行一句…"
          value={rawLyrics}
        />
        {error ? (
          <p
            id="lyrics-error"
            aria-live="polite"
            className="mt-3 text-base text-rose-300"
          >
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            id="lyrics-privacy"
            className="flex items-center gap-2 text-sm text-white/48"
          >
            <LockKeyhole aria-hidden="true" className="size-4 text-primary" />{' '}
            仅存本机
          </p>
          <Button
            className="h-12 rounded-full px-6 text-base font-semibold shadow-[0_10px_30px_rgb(250_204_21/18%)]"
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
  lines,
  onClear,
  onEdit,
}: {
  lines: LyricLine[];
  onClear: () => void;
  onEdit: () => void;
}) {
  return (
    <section aria-label="对照歌词">
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button
          className="h-11 rounded-full px-4"
          onClick={onEdit}
          type="button"
          variant="outline"
        >
          <ArrowLeft aria-hidden="true" /> 重新编辑
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
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_24px_80px_rgb(2_6_23/28%)]">
        {lines.map((line, index) =>
          line.isBreak ? (
            <div
              key={`break-${index}`}
              aria-hidden="true"
              className="h-9 border-y border-white/[0.035] bg-[#07122b]/55"
            />
          ) : (
            <article
              key={`${index}-${line.japanese}`}
              className="border-b border-white/[0.07] px-5 py-7 last:border-b-0 sm:px-8"
            >
              <p
                lang="ja"
                className="text-[1.35rem] leading-relaxed font-semibold tracking-[0.015em] text-white sm:text-[1.6rem]"
              >
                {line.japanese}
              </p>
              <p className="mt-2 font-mono text-base leading-relaxed text-sky-200/78 sm:text-lg">
                {line.romaji}
              </p>
              <p className="mt-2 text-lg leading-relaxed font-medium tracking-[0.06em] text-primary sm:text-xl">
                {line.chinesePhonetic}
              </p>
            </article>
          ),
        )}
      </div>
      <p className="mt-3 text-sm text-white/42">
        · 短停顿　— 长音　中文为跟唱近似音
      </p>
    </section>
  );
}
