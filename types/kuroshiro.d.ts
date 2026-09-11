declare module 'kuroshiro' {
  export default class Kuroshiro {
    static Util: {
      kanaToRomaji(
        text: string,
        system: 'nippon' | 'passport' | 'hepburn',
      ): string;
    };
    init(analyzer: unknown): Promise<void>;
    convert(
      text: string,
      options: {
        to: 'hiragana' | 'katakana' | 'romaji';
        mode?: 'normal' | 'spaced' | 'okurigana' | 'furigana';
        romajiSystem?: 'nippon' | 'passport' | 'hepburn';
      },
    ): Promise<string>;
  }
}
