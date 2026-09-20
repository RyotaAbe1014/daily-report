/**
 * API のエラーを画面表示用の日本語メッセージへ変換します。
 *
 * tRPC は入力バリデーションに失敗すると、zod の検証結果を JSON 文字列の
 * まま message に格納します。そのまま表示すると配列や "code": "custom"
 * といった内部表現が画面に出てしまうため、エラーコードを基に文面を
 * 組み立て直します。
 */

/** tRPC が返却するエラーコード。サーバー側のプロシージャが送出します。 */
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
 * 操作の文脈ごとのメッセージ定義。
 * 同じ CONFLICT でも、作成時は「既に存在する」という意味になる一方、
 * 更新時は別の意味を持つため、呼び出し側から文脈を指定する形にしています。
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

/** 文脈によらず意味が変わらないエラーコード向けのメッセージ。 */
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
 * エラーを画面表示用の一文へ変換します。
 * 該当するコードが判別できない場合も、生のメッセージは表示せず
 * 定型文にフォールバックします。
 */
export const toErrorMessage = (
  error: unknown,
  context: ErrorContext,
): string => {
  const code = codeOf(error);
  if (!code) {
    // ネットワーク断など、エラーコードが付与されないケースです。
    return '通信に失敗しました。接続を確認してもう一度お試しください。';
  }
  return (
    MESSAGES[context][code] ??
    COMMON[code] ??
    '問題が発生しました。しばらくしてからお試しください。'
  );
};
