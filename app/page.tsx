'use client';

import {
  ArrowLeft,
  ExternalLink,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { convertLyrics, MAX_LYRICS_LENGTH, type LyricLine } from '@/lib/lyrics';
import { clearLyricsStorage, LYRICS_STORAGE_KEY } from '@/lib/storage';

type SavedLyrics = {
  version: 1;
  song: 'Lemon';
  artist: '米津玄師';
  rawLyrics: string;
  lines: LyricLine[];
  savedAt: string;
};

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

function isSavedLyrics(value: unknown): value is SavedLyrics {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<SavedLyrics>;
  return (
    record.version === 1 &&
    record.song === 'Lemon' &&
    record.artist === '米津玄師' &&
    typeof record.rawLyrics === 'string' &&
    Array.isArray(record.lines)
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return '暂时无法生成读音，请稍后重试。你的原歌词仍然保留着。';
}

export default function Home() {
  const [rawLyrics, setRawLyrics] = useState('');
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [isEditing, setIsEditing] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LYRICS_STORAGE_KEY);
      if (!stored) return;
      const saved: unknown = JSON.parse(stored);
      if (!isSavedLyrics(saved)) return;
      queueMicrotask(() => {
        setRawLyrics(saved.rawLyrics);
        setLines(saved.lines);
        setIsEditing(false);
      });
    } catch {
      clearLyricsStorage(localStorage);
    }
  }, []);

  const generateFromText = useCallback(async (lyrics: string) => {
    const converted = await convertLyrics(lyrics);
    const saved: SavedLyrics = {
      version: 1,
      song: 'Lemon',
      artist: '米津玄師',
      rawLyrics: lyrics.replace(/\r\n?/gu, '\n'),
      lines: converted,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(LYRICS_STORAGE_KEY, JSON.stringify(saved));
    setRawLyrics(saved.rawLyrics);
    setLines(converted);
    setIsEditing(false);
    setError('');
    return converted.filter((line) => !line.isBreak).length;
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const registration = context.registerTool(
      {
        name: 'generate_lyrics_view',
        title: '生成三行对照歌词',
        description: '把用户提供的日语歌词转换为日语、罗马音和中文跟唱近似音，并保存到当前浏览器。',
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
          if (!input || typeof input !== 'object' || typeof (input as { lyrics?: unknown }).lyrics !== 'string') {
            throw new Error('lyrics 必须是字符串。');
          }

          try {
            const lineCount = await generateFromText((input as { lyrics: string }).lyrics);
            return { lineCount, savedLocally: true, song: 'Lemon' };
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

  function clearLyrics() {
    clearLyricsStorage(localStorage);
    setRawLyrics('');
    setLines([]);
    setError('');
    setIsEditing(true);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-8 flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
              <span aria-hidden="true">レ</span>
              日语跟唱练习
            </div>
            <p className="mb-2 text-sm font-medium tracking-[0.18em] text-white/55 uppercase">
              Kenshi Yonezu · 2018
            </p>
            <h1 className="font-heading text-5xl font-semibold tracking-[-0.04em] text-white sm:text-7xl">
              Lemon
            </h1>
            <p className="mt-3 text-lg text-white/68">米津玄師</p>
          </div>

          <nav aria-label="歌曲资料" className="flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 px-4 text-sm font-medium text-white/76 transition hover:border-primary/55 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              href="https://reissuerecords.net/discography/lemon/"
              rel="noreferrer"
              target="_blank"
            >
              官方页面 <ExternalLink aria-hidden="true" className="size-4" />
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 px-4 text-sm font-medium text-white/76 transition hover:border-primary/55 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              href="https://www.youtube.com/watch?v=SX_ViT4Ra7k"
              rel="noreferrer"
              target="_blank"
            >
              官方 MV <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </nav>
        </header>

        {isEditing ? (
          <LyricsEditor
            error={error}
            isGenerating={isGenerating}
            onLyricsChange={setRawLyrics}
            onSubmit={handleSubmit}
            rawLyrics={rawLyrics}
          />
        ) : (
          <LyricsReader lines={lines} onClear={clearLyrics} onEdit={() => setIsEditing(true)} />
        )}

        <footer className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-6 text-sm leading-relaxed text-white/42 sm:flex-row sm:items-center sm:justify-between">
          <p>中文音译仅供跟唱参考，不是翻译；自动读音可能需要人工校正。</p>
          <p>歌词不上传，也不会随网站发布。</p>
        </footer>
      </div>
    </main>
  );
}

function LyricsEditor({
  error,
  isGenerating,
  onLyricsChange,
  onSubmit,
  rawLyrics,
}: {
  error: string;
  isGenerating: boolean;
  onLyricsChange: (value: string) => void;
  onSubmit: (event: { preventDefault(): void }) => void;
  rawLyrics: string;
}) {
  return (
    <section aria-labelledby="lyrics-input-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <form
        className="rounded-[1.75rem] border border-white/10 bg-card p-5 shadow-[0_24px_80px_rgb(2_6_23/28%)] sm:p-8"
        onSubmit={onSubmit}
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h2 id="lyrics-input-title" className="text-xl font-semibold text-white">
              粘贴日语歌词
            </h2>
            <p className="mt-1 text-base leading-relaxed text-white/58">每行一句，空行会保留为段落间隔。</p>
          </div>
        </div>

        <label className="sr-only" htmlFor="lyrics-input">
          《Lemon》日语歌词
        </label>
        <Textarea
          id="lyrics-input"
          aria-describedby={error ? 'lyrics-error lyrics-privacy' : 'lyrics-privacy'}
          aria-invalid={Boolean(error)}
          className="min-h-64 resize-y rounded-2xl border-white/12 bg-[#07122b] p-5 text-base leading-8 text-white placeholder:text-white/34 focus-visible:border-primary focus-visible:ring-primary/20"
          maxLength={MAX_LYRICS_LENGTH}
          onChange={(event) => onLyricsChange(event.target.value)}
          placeholder={'在这里粘贴你合法取得的日语歌词…\n\n网站不会内置或上传完整歌词。'}
          value={rawLyrics}
        />

        {error ? (
          <p id="lyrics-error" aria-live="polite" className="mt-3 text-base text-rose-300">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p id="lyrics-privacy" className="flex items-center gap-2 text-sm text-white/48">
            <LockKeyhole aria-hidden="true" className="size-4 text-primary" />
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
        <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">显示顺序</p>
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
                <strong className="block text-base font-medium text-white">{title}</strong>
                <span className="mt-0.5 block text-sm leading-relaxed text-white/48">{detail}</span>
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
          <p className="text-sm font-semibold tracking-[0.14em] text-primary uppercase">三行对照</p>
          <h2 id="lyrics-reader-title" className="mt-1 text-2xl font-semibold text-white">
            跟着读，再跟着唱
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 rounded-full px-4" onClick={onEdit} type="button" variant="outline">
            <ArrowLeft aria-hidden="true" /> 重新编辑
          </Button>
          <Button className="h-11 rounded-full px-4" onClick={onClear} type="button" variant="destructive">
            <Trash2 aria-hidden="true" /> 清除本机歌词
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-card shadow-[0_24px_80px_rgb(2_6_23/28%)]">
        {lines.map((line, index) =>
          line.isBreak ? (
            <div key={`break-${index}`} aria-hidden="true" className="h-9 border-y border-white/[0.035] bg-[#07122b]/55" />
          ) : (
            <article key={`${index}-${line.japanese}`} className="border-b border-white/[0.07] px-5 py-7 last:border-b-0 sm:px-8">
              <p lang="ja" className="text-[1.35rem] leading-relaxed font-semibold tracking-[0.015em] text-white sm:text-[1.6rem]">
                {line.japanese}
              </p>
              <p className="mt-2 font-mono text-base leading-relaxed text-sky-200/78 sm:text-lg">{line.romaji}</p>
              <p className="mt-2 text-lg leading-relaxed font-medium tracking-[0.06em] text-primary sm:text-xl">
                {line.chinesePhonetic}
              </p>
            </article>
          ),
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-primary/16 bg-primary/[0.06] p-4 text-sm leading-relaxed text-white/56">
        <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>“·”表示促音时短暂停顿，“—”表示拉长前一个音。歌曲中的连读、弱化和节奏请以原唱为准。</p>
      </div>
    </section>
  );
}
