'use client';

import {
  ArrowLeft,
  ExternalLink,
  Library,
  LockKeyhole,
  Music2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
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
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
              <Music2 aria-hidden="true" className="size-4" /> 日语跟唱练习
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
              我的日语歌本
            </h1>
            <p className="mt-2 text-base text-white/55">
              每首歌的歌词和读音都只保存在当前浏览器。
            </p>
          </div>
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

        <footer className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm leading-relaxed text-white/42 sm:flex-row sm:items-center sm:justify-between">
          <p>中文音译仅供跟唱参考，不是翻译；自动读音可能需要人工校正。</p>
          <p>歌词不上传，也不会随网站发布。</p>
        </footer>
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
    <section aria-label="歌曲列表" className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white/48">
        <Library aria-hidden="true" className="size-4" /> {songs.length} 首歌曲
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {songs.map((song, index) => {
          const active = song.id === activeSongId;
          return (
            <button
              key={song.id}
              aria-current={active ? 'true' : undefined}
              className={`min-w-44 rounded-2xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                active
                  ? 'border-primary/55 bg-primary/12'
                  : 'border-white/10 bg-card hover:border-white/24'
              }`}
              onClick={() => onSelect(song)}
              type="button"
            >
              <span
                className={`text-xs font-semibold tracking-[0.16em] ${active ? 'text-primary' : 'text-white/35'}`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <strong className="mt-2 block truncate text-base text-white">
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
    <section className="mb-6 flex flex-col gap-5 rounded-[1.75rem] border border-white/10 bg-[#08152f] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div className="min-w-0">
        <p className="mb-1 text-sm font-medium tracking-[0.16em] text-white/42 uppercase">
          Now practicing
        </p>
        <h2 className="truncate text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
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
                这会删除此歌曲及其保存在本机的歌词，无法撤销。
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
            <DialogDescription className="text-base">
              歌名和歌手为必填，资料链接可以稍后补充。
            </DialogDescription>
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
        <p className="mt-2 text-base text-white/52">添加一首想学唱的日语歌。</p>
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
    <section
      aria-labelledby="lyrics-input-title"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]"
    >
      <form
        className="rounded-[1.75rem] border border-white/10 bg-card p-5 shadow-[0_24px_80px_rgb(2_6_23/28%)] sm:p-8"
        onSubmit={onSubmit}
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2
              id="lyrics-input-title"
              className="text-xl font-semibold text-white"
            >
              粘贴日语歌词
            </h2>
            <p className="mt-1 text-base leading-relaxed text-white/58">
              每行一句，空行会保留为段落间隔。
            </p>
          </div>
        </div>
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
          placeholder={
            '在这里粘贴你合法取得的日语歌词…\n\n网站不会内置或上传完整歌词。'
          }
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
            歌词只保存在这台设备
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
      <aside className="rounded-[1.75rem] border border-primary/18 bg-primary/[0.07] p-6">
        <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
          显示顺序
        </p>
        <ol className="mt-6 space-y-5">
          {[
            ['日', '日语原文', '保留你的原始换行'],
            ['R', '罗马音', '平文式读音'],
            ['中', '中文音译', '便于跟唱的近似音'],
          ].map(([mark, title, detail]) => (
            <li key={mark} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/8 text-sm font-semibold text-primary">
                {mark}
              </span>
              <span>
                <strong className="block text-base font-medium text-white">
                  {title}
                </strong>
                <span className="mt-0.5 block text-sm leading-relaxed text-white/48">
                  {detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
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
    <section aria-labelledby="lyrics-reader-title">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">
            三行对照
          </p>
          <h2
            id="lyrics-reader-title"
            className="mt-1 text-2xl font-semibold text-white"
          >
            跟着读，再跟着唱
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
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
      </div>
      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-card shadow-[0_24px_80px_rgb(2_6_23/28%)]">
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
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/16 bg-primary/[0.06] p-4 text-sm leading-relaxed text-white/56">
        <RotateCcw
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-primary"
        />
        <p>
          “·”表示促音时短暂停顿，“—”表示拉长前一个音。歌曲中的连读、弱化和节奏请以原唱为准。
        </p>
      </div>
    </section>
  );
}
