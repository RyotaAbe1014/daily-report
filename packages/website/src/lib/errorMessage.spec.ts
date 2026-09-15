import { describe, expect, it } from 'vitest';
import { toErrorMessage } from './errorMessage';

/** tRPC が返すエラーを模した値。 */
const withCode = (code: string) => ({ data: { code } });

describe('toErrorMessage', () => {
  /*
   * tRPC は入力検証に失敗すると zod の結果を JSON 文字列のまま message に
   * 入れてくる。これがそのまま画面に出ていたので、混入しないことを固定する。
   */
  it('does not leak the raw zod payload', () => {
    const error = {
      message:
        '[\n  {\n    "code": "custom",\n    "path": [\n      "date"\n    ],\n    "message": "date must be a real calendar date"\n  }\n]',
      data: { code: 'BAD_REQUEST' },
    };

    const message = toErrorMessage(error, 'load');
    expect(message).not.toContain('"code"');
    expect(message).not.toContain('[');
    expect(message).toBe('日付の形式が正しくありません。');
  });

  describe('文脈ごとに文面を変える', () => {
    it('作成の CONFLICT は既にあることを伝える', () => {
      expect(toErrorMessage(withCode('CONFLICT'), 'create')).toContain(
        '既にあります',
      );
    });

    it('更新の NOT_FOUND は削除済みであることを伝える', () => {
      expect(toErrorMessage(withCode('NOT_FOUND'), 'update')).toContain(
        '削除されています',
      );
    });

    it('取得の NOT_FOUND は見つからないことを伝える', () => {
      expect(toErrorMessage(withCode('NOT_FOUND'), 'load')).toContain(
        '見つかりませんでした',
      );
    });
  });

  describe('文脈によらない文面', () => {
    it.each([
      ['UNAUTHORIZED', 'ログイン'],
      ['FORBIDDEN', '権限'],
      ['INTERNAL_SERVER_ERROR', 'サーバー'],
    ])('%s は共通の文面になる', (code, expected) => {
      expect(toErrorMessage(withCode(code), 'load')).toContain(expected);
    });
  });

  it('コードが付かない失敗は通信エラーとして扱う', () => {
    expect(toErrorMessage(new Error('Failed to fetch'), 'load')).toContain(
      '通信に失敗しました',
    );
  });

  it('知らないコードでも定型文に倒す', () => {
    const message = toErrorMessage(withCode('SOMETHING_NEW'), 'load');
    expect(message).toContain('問題が発生しました');
    expect(message).not.toContain('SOMETHING_NEW');
  });

  // 文脈に用意がないコードは共通の文面へ落ちる。
  it('文脈に定義がなければ共通の文面を使う', () => {
    expect(toErrorMessage(withCode('UNAUTHORIZED'), 'delete')).toContain(
      'ログイン',
    );
  });
});
