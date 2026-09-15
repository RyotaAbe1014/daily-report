/**
 * API のエラーを画面に出せる日本語にする。
 *
 * tRPC は入力検証に失敗すると zod の結果を JSON 文字列のまま message に
 * 入れてくる。そのまま出すと配列や "code": "custom" が画面に並ぶので、
 * エラーコードから組み立て直す。
 */

/** tRPC が返すエラーコード。サーバー側のプロシージャが投げるもの。 */
type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_SERVER_ERROR';

const codeOf = (error: unknown): ErrorCode | undefined =>
  (error as { data?: { code?: ErrorCode } })?.data?.code;

/**
 * 操作の文脈ごとの文面。同じ CONFLICT でも、作成なら「既にある」、
 * 更新なら別の意味になるため、呼び出す側が文脈を渡す。
 */
export type ErrorContext = 'load' | 'create' | 'update' | 'delete';

const MESSAGES: Record<ErrorContext, Partial<Record<ErrorCode, string>>> = {
  load: {
    BAD_REQUEST: '日付の形式が正しくありません。',
    NOT_FOUND: '指定された日報は見つかりませんでした。',
  },
  create: {
    BAD_REQUEST: '入力内容を確認してください。',
    CONFLICT: 'この日付の日報は既にあります。編集画面から変更してください。',
  },
  update: {
    BAD_REQUEST: '入力内容を確認してください。',
    NOT_FOUND: 'この日報は既に削除されています。',
  },
  delete: {
    NOT_FOUND: 'この日報は既に削除されています。',
  },
};

/** 文脈によらず同じ意味になるもの。 */
const COMMON: Partial<Record<ErrorCode, string>> = {
  UNAUTHORIZED: 'ログインし直してください。',
  FORBIDDEN: 'この操作を行う権限がありません。',
  TIMEOUT: '時間内に応答がありませんでした。もう一度お試しください。',
  TOO_MANY_REQUESTS:
    'アクセスが集中しています。しばらくしてからお試しください。',
  INTERNAL_SERVER_ERROR:
    'サーバーで問題が発生しました。しばらくしてからお試しください。',
};

/**
 * エラーを画面に出す 1 文にする。
 * 見当がつかない場合も、生のメッセージは見せずに定型文へ倒す。
 */
export const toErrorMessage = (
  error: unknown,
  context: ErrorContext,
): string => {
  const code = codeOf(error);
  if (!code) {
    // ネットワーク断などでコードが付かないケース。
    return '通信に失敗しました。接続を確認してもう一度お試しください。';
  }
  return (
    MESSAGES[context][code] ??
    COMMON[code] ??
    '問題が発生しました。しばらくしてからお試しください。'
  );
};
