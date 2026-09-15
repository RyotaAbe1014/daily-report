/**
 * 日付の扱い。
 *
 * サーバー側の DateSchema（packages/api/src/schema/daily-report.ts）と
 * 同じ条件を持つ。API パッケージから import するとサーバー専用の依存まで
 * ブラウザに引き込まれてしまうため、条件だけをここに写している。
 * 片方を変えるときはもう片方も合わせること。
 */

/** YYYY-MM-DD として実在する日付か。 */
export const isValidDateString = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  /*
   * Date.parse だけでは不十分。月の範囲外は NaN になるが、日の溢れは
   * 翌月へロールオーバーして通ってしまう（2026-02-30 -> 2026-03-02）。
   * 正規化した結果が入力と一致することまで確かめる。
   */
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().startsWith(`${value}T`)
  );
};
