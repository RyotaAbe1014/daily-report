/**
 * 日報プロシージャの結合テスト。
 *
 * ローカルで起動した DynamoDB Local (Docker) に対して実際の読み書きを検証します。
 * 実行コマンド: `nx run @daily-report/api:test-integration`
 * ※ 通常の単体テストからは除外されているため、Docker が起動していない環境では実行されません。
 *
 * 認証は LOCAL_DEV の固定ユーザーに設定しているため、本テストでは
 * プロシージャ層の振る舞い（エラーコード、日付範囲の絞り込み、ページネーション）を重点的に検証します。
 * （※ ユーザー間のデータ分離については db パッケージ側のテストで検証済み）
 */
import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it } from 'vitest';

// import より先に環境変数が設定されている必要があります。
// 後続のモジュール読み込み時にテーブル名等の解決でこの値を参照するためです。
process.env.LOCAL_DEV = 'true';

const { appRouter } = await import('../router.js');

const caller = appRouter.createCaller({
  event: {} as never,
  context: {} as never,
  info: {} as never,
} as never);

const api = caller.dailyReport;

/** 本テストファイルで作成・操作対象とする日付一覧。各テスト終了後に必ず削除してクリーンアップします。 */
const dates = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

const section = (heading: string, body = 'x') => ({ heading, body });

/**
 * 日報オブジェクトに外部公開を許可したキーのみが含まれていることを検証するヘルパー。
 * 出力スキーマ（.output() の zod スキーマ）で userId が除外されていることを各プロシージャ経由で確認し、意図せぬ情報漏洩を防ぎます。
 */
const PUBLIC_FIELDS = ['createdAt', 'date', 'sections', 'updatedAt'];
const expectPublicShape = (report: unknown) => {
  expect(Object.keys(report ?? {}).sort()).toEqual(PUBLIC_FIELDS);
};

/** 非同期処理でスローされた TRPCError のエラーコード（または結果）を取得するヘルパー。 */
const codeOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof TRPCError ? error.code : `UNEXPECTED: ${error}`;
  }
};

afterEach(async () => {
  for (const date of dates) {
    await api.delete({ date });
  }
});

describe('dailyReport.get', () => {
  it('returns null for a date that was never written', async () => {
    await expect(api.get({ date: '2026-09-13' })).resolves.toEqual({
      report: null,
    });
  });

  it('returns the report after it is created', async () => {
    await api.create({
      date: '2026-09-13',
      sections: [section('今日やったこと', '実装した')],
    });

    const { report } = await api.get({ date: '2026-09-13' });
    expect(report?.date).toBe('2026-09-13');
    expect(report?.sections).toEqual([section('今日やったこと', '実装した')]);
  });

  // レスポンスに userId を含めない（内部のキー構造やアカウント識別子が外部に漏れるのを防ぐ）。
  it('returns exactly the public fields, never userId', async () => {
    await api.create({ date: '2026-09-13', sections: [section('a')] });

    const { report } = await api.get({ date: '2026-09-13' });
    expectPublicShape(report);
  });

  it('rejects a malformed date', async () => {
    await expect(codeOf(() => api.get({ date: '2026/09/13' }))).resolves.toBe(
      'BAD_REQUEST',
    );
  });
});

describe('dailyReport.create', () => {
  it('returns the created report with timestamps and no userId', async () => {
    const created = await api.create({
      date: '2026-09-13',
      sections: [section('a')],
    });

    expect(created.date).toBe('2026-09-13');
    expect(created.createdAt).toBeTypeOf('string');
    expect(created.updatedAt).toBeTypeOf('string');
    expectPublicShape(created);
  });

  it('conflicts on a duplicate date', async () => {
    await api.create({ date: '2026-09-13', sections: [section('a')] });

    await expect(
      codeOf(() =>
        api.create({ date: '2026-09-13', sections: [section('b')] }),
      ),
    ).resolves.toBe('CONFLICT');
  });

  it('rejects an empty sections array', async () => {
    await expect(
      codeOf(() => api.create({ date: '2026-09-13', sections: [] })),
    ).resolves.toBe('BAD_REQUEST');
  });

  it('rejects a date that does not exist on the calendar', async () => {
    await expect(
      codeOf(() =>
        api.create({ date: '2026-02-30', sections: [section('a')] }),
      ),
    ).resolves.toBe('BAD_REQUEST');
  });
});

describe('dailyReport.update', () => {
  it('replaces sections, keeping createdAt', async () => {
    const created = await api.create({
      date: '2026-09-13',
      sections: [section('更新前'), section('消える')],
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await api.update({
      date: '2026-09-13',
      sections: [section('更新後')],
    });

    expect(updated.sections).toEqual([section('更新後')]);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt > created.updatedAt).toBe(true);
    expectPublicShape(updated);
  });

  it('is not found when the date has no report', async () => {
    await expect(
      codeOf(() =>
        api.update({ date: '2026-09-13', sections: [section('a')] }),
      ),
    ).resolves.toBe('NOT_FOUND');
  });
});

describe('dailyReport.delete', () => {
  it('removes the report', async () => {
    await api.create({ date: '2026-09-13', sections: [section('a')] });

    await expect(api.delete({ date: '2026-09-13' })).resolves.toEqual({
      date: '2026-09-13',
    });
    await expect(api.get({ date: '2026-09-13' })).resolves.toEqual({
      report: null,
    });
  });

  // 冪等性（idempotence）の検証。同一日付の削除リトライ時にもエラーにならず正常終了することを確認する。
  it('succeeds for a date that does not exist', async () => {
    await expect(api.delete({ date: '2026-09-13' })).resolves.toEqual({
      date: '2026-09-13',
    });
  });
});

describe('dailyReport.list', () => {
  const seed = async () => {
    for (const date of dates) {
      await api.create({ date, sections: [section(date)] });
    }
  };

  it('defaults to descending by date', async () => {
    await seed();
    const { reports } = await api.list({});
    expect(reports.map((r) => r.date)).toEqual([...dates].reverse());
    for (const report of reports) {
      expectPublicShape(report);
    }
  });

  it('lists ascending when asked', async () => {
    await seed();
    const { reports } = await api.list({ order: 'asc' });
    expect(reports.map((r) => r.date)).toEqual(dates);
  });

  it('narrows to a range, inclusive on both ends', async () => {
    await seed();
    const { reports } = await api.list({
      from: '2026-09-11',
      to: '2026-09-12',
      order: 'asc',
    });
    expect(reports.map((r) => r.date)).toEqual(['2026-09-11', '2026-09-12']);
  });

  it('treats from alone as an open upper bound', async () => {
    await seed();
    const { reports } = await api.list({ from: '2026-09-12', order: 'asc' });
    expect(reports.map((r) => r.date)).toEqual(['2026-09-12', '2026-09-13']);
  });

  it('treats to alone as an open lower bound', async () => {
    await seed();
    const { reports } = await api.list({ to: '2026-09-11', order: 'asc' });
    expect(reports.map((r) => r.date)).toEqual(['2026-09-10', '2026-09-11']);
  });

  it('matches a single day when from equals to', async () => {
    await seed();
    const { reports } = await api.list({
      from: '2026-09-12',
      to: '2026-09-12',
    });
    expect(reports.map((r) => r.date)).toEqual(['2026-09-12']);
  });

  it('rejects from later than to', async () => {
    await expect(
      codeOf(() => api.list({ from: '2026-09-13', to: '2026-09-10' })),
    ).resolves.toBe('BAD_REQUEST');
  });

  it('pages with the returned cursor without repeating items', async () => {
    await seed();

    const page1 = await api.list({ limit: 2, order: 'asc' });
    expect(page1.reports.map((r) => r.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
    ]);
    expect(page1.cursor).toBeTruthy();

    const page2 = await api.list({
      limit: 2,
      order: 'asc',
      cursor: page1.cursor,
    });
    expect(page2.reports.map((r) => r.date)).toEqual([
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('returns a null cursor on the last page', async () => {
    await api.create({ date: '2026-09-13', sections: [section('a')] });

    const { reports, cursor } = await api.list({ limit: 10 });
    expect(reports).toHaveLength(1);
    expect(cursor).toBeNull();
  });

  it('returns an empty list when there is nothing stored', async () => {
    await expect(api.list({})).resolves.toEqual({ reports: [], cursor: null });
  });
});
