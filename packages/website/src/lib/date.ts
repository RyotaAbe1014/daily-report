/**
 * 日付に関するユーティリティ。
 *
 * サーバー側の DateSchema（packages/api/src/schema/daily-report.ts）と
 * 同一の判定条件を持ちます。API パッケージから直接 import すると
 * サーバー専用の依存までブラウザ側に取り込まれてしまうため、
 * 条件のみをこちらに複製しています。
 * 一方を変更する際は、もう一方も必ず合わせてください。
 */

/** YYYY-MM-DD 形式かつ実在する日付かどうかを判定します。 */
export const isValidDateString = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  /*
   * Date.parse 単体では判定できません。月が範囲外であれば NaN になりますが、
   * 日の超過分は翌月へロールオーバーして受理されてしまいます
   * （例: 2026-02-30 -> 2026-03-02）。
   * パース結果を ISO 文字列へ再変換し、元の入力値と一致するかまで確認します。
   */
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().startsWith(`${value}T`)
  );
};
