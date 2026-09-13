import { describe, expect, it } from 'vitest';
import {
  DailyReportSchema,
  DateSchema,
  DeleteDailyReportInputSchema,
  GetDailyReportInputSchema,
  GetDailyReportOutputSchema,
  ListDailyReportsInputSchema,
  ListDailyReportsOutputSchema,
  SaveDailyReportInputSchema,
  SectionSchema,
} from './daily-report.js';

describe('DateSchema', () => {
  it.each(['2026-09-13', '2000-01-01', '2024-02-29'])('accepts %s', (value) => {
    expect(DateSchema.parse(value)).toBe(value);
  });

  it.each([
    ['slashes instead of hyphens', '2026/09/13'],
    ['no zero padding', '2026-9-13'],
    ['a full ISO timestamp', '2026-09-13T00:00:00Z'],
    ['an empty string', ''],
    ['trailing whitespace', '2026-09-13 '],
  ])('rejects %s', (_label, value) => {
    expect(DateSchema.safeParse(value).success).toBe(false);
  });

  // フォーマットが YYYY-MM-DD に合致していても、カレンダー上に実在しない日付はバリデーションで弾く。
  // DynamoDB のソートキーとして利用するため、不正な日付値の混入を防ぐ。
  it.each(['2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32'])(
    'rejects the out-of-range date %s',
    (value) => {
      expect(DateSchema.safeParse(value).success).toBe(false);
    },
  );

  // Date.parse は日の超過を翌月にロールオーバーして受理してしまうため（例: 2026-02-30 -> 2026-03-02）、
  // 正規化後の値と入力値が完全一致するかどうかを検査していることを確認する。
  it.each([
    ['2026-02-30', '2026-03-02'],
    ['2025-02-29', '2025-03-01'],
    ['2026-04-31', '2026-05-01'],
    ['2026-06-31', '2026-07-01'],
  ])('rejects %s, which would roll over to %s', (value) => {
    expect(DateSchema.safeParse(value).success).toBe(false);
  });

  // うるう年の2月29日は正常に受理されることを確認（ロールオーバー検査による誤検知の防止）。
  it.each(['2024-02-29', '2000-02-29', '2028-02-29'])(
    'accepts the leap day %s',
    (value) => {
      expect(DateSchema.parse(value)).toBe(value);
    },
  );
});

describe('SectionSchema', () => {
  it('keeps the body verbatim, including Markdown', () => {
    const body = '- 箇条書き\n\n**強調** と `code`\n<script>alert(1)</script>';
    expect(SectionSchema.parse({ heading: '見出し', body }).body).toBe(body);
  });

  it('rejects an empty heading or body', () => {
    expect(SectionSchema.safeParse({ heading: '', body: 'x' }).success).toBe(
      false,
    );
    expect(SectionSchema.safeParse({ heading: 'x', body: '' }).success).toBe(
      false,
    );
  });

  it('bounds the heading at 200 characters', () => {
    expect(
      SectionSchema.safeParse({ heading: 'a'.repeat(200), body: 'x' }).success,
    ).toBe(true);
    expect(
      SectionSchema.safeParse({ heading: 'a'.repeat(201), body: 'x' }).success,
    ).toBe(false);
  });

  it('bounds the body at 100,000 characters', () => {
    expect(
      SectionSchema.safeParse({ heading: 'x', body: 'a'.repeat(100_000) })
        .success,
    ).toBe(true);
    expect(
      SectionSchema.safeParse({ heading: 'x', body: 'a'.repeat(100_001) })
        .success,
    ).toBe(false);
  });
});

describe('SaveDailyReportInputSchema', () => {
  const section = { heading: '今日やったこと', body: '実装した' };

  it('accepts a single section', () => {
    const parsed = SaveDailyReportInputSchema.parse({
      date: '2026-09-13',
      sections: [section],
    });
    expect(parsed.sections).toHaveLength(1);
  });

  it('requires at least one section', () => {
    expect(
      SaveDailyReportInputSchema.safeParse({
        date: '2026-09-13',
        sections: [],
      }).success,
    ).toBe(false);
  });

  it('caps sections at 20', () => {
    const build = (count: number) => ({
      date: '2026-09-13',
      sections: Array.from({ length: count }, () => section),
    });
    expect(SaveDailyReportInputSchema.safeParse(build(20)).success).toBe(true);
    expect(SaveDailyReportInputSchema.safeParse(build(21)).success).toBe(false);
  });

  // 入力から userId を受け取ると他人の日報を操作できてしまう脆弱性につながるため、
  // スキーマが余分なキーを自動的に除去（strip）することを明示的に検証する。
  it('strips a userId supplied by the caller', () => {
    const parsed = SaveDailyReportInputSchema.parse({
      date: '2026-09-13',
      sections: [section],
      userId: 'someone-else',
    } as never);
    expect(parsed).not.toHaveProperty('userId');
  });

  it('preserves section order', () => {
    const parsed = SaveDailyReportInputSchema.parse({
      date: '2026-09-13',
      sections: [
        { heading: '1 番目', body: 'a' },
        { heading: '2 番目', body: 'b' },
        { heading: '3 番目', body: 'c' },
      ],
    });
    expect(parsed.sections.map((s) => s.heading)).toEqual([
      '1 番目',
      '2 番目',
      '3 番目',
    ]);
  });
});

describe('ListDailyReportsInputSchema', () => {
  it('defaults to the 31 most recent reports', () => {
    const parsed = ListDailyReportsInputSchema.parse({});
    expect(parsed.limit).toBe(31);
    expect(parsed.order).toBe('desc');
    expect(parsed.from).toBeUndefined();
    expect(parsed.to).toBeUndefined();
  });

  it('accepts an explicit range and order', () => {
    const parsed = ListDailyReportsInputSchema.parse({
      from: '2026-09-01',
      to: '2026-09-30',
      order: 'asc',
      limit: 100,
    });
    expect(parsed).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      order: 'asc',
      limit: 100,
    });
  });

  it.each([0, 101, 1.5, -1])('rejects the limit %s', (limit) => {
    expect(ListDailyReportsInputSchema.safeParse({ limit }).success).toBe(
      false,
    );
  });

  it('rejects an unknown order', () => {
    expect(
      ListDailyReportsInputSchema.safeParse({ order: 'ascending' }).success,
    ).toBe(false);
  });

  // カーソルはクライアント側で解釈しない不透明な文字列として扱うため、
  // null および undefined のいずれも「指定なし」として受け付ける。
  it.each([undefined, null])('accepts the cursor %s', (cursor) => {
    expect(ListDailyReportsInputSchema.safeParse({ cursor }).success).toBe(
      true,
    );
  });

  // from > to の期間整合性チェックはスキーマ層ではなくプロシージャ側の責務。
  // スキーマ単体ではこの指定が通過する仕様であることを記録・確認する。
  it('does not itself reject from later than to', () => {
    expect(
      ListDailyReportsInputSchema.safeParse({
        from: '2026-09-30',
        to: '2026-09-01',
      }).success,
    ).toBe(true);
  });
});

/**
 * 出力スキーマによって userId などの内部フィールドが除去される仕様のテスト。
 * DynamoDB のキー設計が外部に漏洩するのを防ぐ多層防御として機能している。
 * プロシージャ層で誤って内部データを含めてしまってもスキーマで除去される前提を単体テストで固定する。
 */
describe('output schemas strip internal fields', () => {
  const withUserId = {
    date: '2026-09-13',
    sections: [{ heading: 'a', body: 'b' }],
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    userId: 'leaked',
  };

  it('DailyReportSchema drops userId', () => {
    const parsed = DailyReportSchema.parse(withUserId);
    expect(Object.keys(parsed).sort()).toEqual([
      'createdAt',
      'date',
      'sections',
      'updatedAt',
    ]);
  });

  it('GetDailyReportOutputSchema drops userId from the nested report', () => {
    const parsed = GetDailyReportOutputSchema.parse({ report: withUserId });
    expect(parsed.report).not.toHaveProperty('userId');
  });

  it('GetDailyReportOutputSchema accepts a null report', () => {
    expect(GetDailyReportOutputSchema.parse({ report: null })).toEqual({
      report: null,
    });
  });

  it('ListDailyReportsOutputSchema drops userId from every report', () => {
    const parsed = ListDailyReportsOutputSchema.parse({
      reports: [withUserId, withUserId],
      cursor: null,
    });
    for (const report of parsed.reports) {
      expect(report).not.toHaveProperty('userId');
    }
  });

  // セクション内に含まれる不要なキーも除去する。
  // DynamoDB の項目に将来的に内部用属性が追加されても、レスポンスに漏洩しないことを確認する。
  it('drops unknown keys inside sections', () => {
    const parsed = DailyReportSchema.parse({
      ...withUserId,
      sections: [{ heading: 'a', body: 'b', internalFlag: true }],
    });
    expect(parsed.sections[0]).toEqual({ heading: 'a', body: 'b' });
  });
});

describe('GetDailyReportInputSchema / DeleteDailyReportInputSchema', () => {
  it('require a valid date', () => {
    expect(GetDailyReportInputSchema.parse({ date: '2026-09-13' })).toEqual({
      date: '2026-09-13',
    });
    expect(
      DeleteDailyReportInputSchema.safeParse({ date: 'not-a-date' }).success,
    ).toBe(false);
  });
});
