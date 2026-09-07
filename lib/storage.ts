export const LYRICS_STORAGE_KEY = 'lemon-lyrics-practice:v1';

export function clearLyricsStorage(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(LYRICS_STORAGE_KEY);
}
