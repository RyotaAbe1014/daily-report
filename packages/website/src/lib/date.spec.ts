import { describe, expect, it } from 'vitest';
import { isValidDateString } from './date';

/**
 * サーバー側 DateSchema と同一の判定条件を保つためのテスト。
 * packages/api/src/schema/daily-report.spec.ts と同じ境界値を並べ、
 * 片方だけ変更された場合に検知できるようにする。
 */
describe('isValidDateString', () => {
  it.each(['2026-09-13', '2000-01-01', '2024-02-29'])('accepts %s', (v) => {
    expect(isValidDateString(v)).toBe(true);
  });

  it.each([
    ['slashes', '2026/09/13'],
    ['no padding', '2026-9-13'],
    ['full timestamp', '2026-09-13T00:00:00Z'],
    ['empty', ''],
    ['trailing space', '2026-09-13 '],
    ['not a date at all', 'hello'],
  ])('rejects %s', (_label, v) => {
    expect(isValidDateString(v)).toBe(false);
  });

  it.each(['2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32'])(
    'rejects out-of-range %s',
    (v) => {
      expect(isValidDateString(v)).toBe(false);
    },
  );

  // Date.parse は日の超過を翌月にロールオーバーして受理してしまうため（例: 2026-02-30 -> 2026-03-02）、
  // 正規化後の値と入力値が一致するかを検査していることを確認する。
  it.each(['2026-02-30', '2025-02-29', '2026-04-31', '2026-06-31'])(
    'rejects %s, which would roll over',
    (v) => {
      expect(isValidDateString(v)).toBe(false);
    },
  );

  it.each(['2024-02-29', '2000-02-29', '2028-02-29'])(
    'accepts leap day %s',
    (v) => {
      expect(isValidDateString(v)).toBe(true);
    },
  );
});
