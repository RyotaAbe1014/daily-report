/**
 * 日報エンティティの統合テスト。
 *
 * ローカルで起動した DynamoDB Local (Docker) に対して実際の読み書きを検証します。
 * 実行コマンド: `nx run @daily-report/db:test-integration`
 * ※ 通常の単体テストからは除外されているため、Docker が起動していない環境では実行されません。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDailyReportEntity,
  type DailyReportEntity,
} from './daily-report.js';

// client.ts がローカルのエンドポイント（http://localhost:<port>）およびテーブル名を参照するために必要。
process.env.LOCAL_DEV = 'true';

/** 他のテストケースやプロセスとデータが衝突しないよう、テストごとに一意なユーザー ID を生成する。 */
const userFor = (name: string) => `test-${name}-${process.pid}`;

let entity: DailyReportEntity;
const touched: { userId: string; date: string }[] = [];

/** テスト終了後に後始末（delete）できるよう作成履歴に記録しつつ、日報を作成する。 */
const create = async (
  userId: string,
  date: string,
  sections: { heading: string; body: string }[],
) => {
  touched.push({ userId, date });
  const result = await entity.create({ userId, date, sections }).go();
  return result.data;
};

beforeAll(async () => {
  entity = await createDailyReportEntity();
});

afterAll(async () => {
  await Promise.all(
    touched.map(({ userId, date }) => entity.delete({ userId, date }).go()),
  );
});

describe('createDailyReportEntity', () => {
  it('round-trips a report', async () => {
    const userId = userFor('roundtrip');
    const sections = [
      { heading: '今日やったこと', body: 'API を実装した' },
      { heading: '明日やること', body: 'フロントを作る' },
    ];

    const created = await create(userId, '2026-09-13', sections);
    expect(created.sections).toEqual(sections);
    expect(created.createdAt).toBeTypeOf('string');
    expect(created.updatedAt).toBeTypeOf('string');

    const fetched = await entity.get({ userId, date: '2026-09-13' }).go();
    expect(fetched.data?.sections).toEqual(sections);
  });

  it('returns null for a date that was never written', async () => {
    const fetched = await entity
      .get({ userId: userFor('missing'), date: '2026-09-13' })
      .go();
    expect(fetched.data).toBeNull();
  });

  it('rejects a second create for the same user and date', async () => {
    const userId = userFor('duplicate');
    await create(userId, '2026-09-13', [{ heading: 'a', body: 'b' }]);

    await expect(
      entity
        .create({
          userId,
          date: '2026-09-13',
          sections: [{ heading: 'c', body: 'd' }],
        })
        .go(),
    ).rejects.toThrow();
  });

  it('preserves section order through a round trip', async () => {
    const userId = userFor('order');
    const headings = ['1 番目', '2 番目', '3 番目', '4 番目'];
    await create(
      userId,
      '2026-09-13',
      headings.map((heading) => ({ heading, body: 'x' })),
    );

    const fetched = await entity.get({ userId, date: '2026-09-13' }).go();
    expect(fetched.data?.sections.map((s) => s.heading)).toEqual(headings);
  });

  describe('patch', () => {
    it('replaces sections and advances updatedAt but not createdAt', async () => {
      const userId = userFor('patch');
      const created = await create(userId, '2026-09-13', [
        { heading: '更新前', body: 'a' },
      ]);

      // updatedAt は ISO 8601 文字列のため、更新前後の時刻差を確実に発生させる目的で微小待機する。
      await new Promise((resolve) => setTimeout(resolve, 5));

      const patched = await entity
        .patch({ userId, date: '2026-09-13' })
        .set({ sections: [{ heading: '更新後', body: 'b' }] })
        .go({ response: 'all_new' });

      const data = patched.data as {
        sections: { heading: string }[];
        createdAt: string;
        updatedAt: string;
      };
      expect(data.sections).toHaveLength(1);
      expect(data.sections[0]?.heading).toBe('更新後');
      expect(data.createdAt).toBe(created.createdAt);
      expect(data.updatedAt > created.updatedAt).toBe(true);
    });

    it('fails when the report does not exist', async () => {
      await expect(
        entity
          .patch({ userId: userFor('patch-missing'), date: '2026-09-13' })
          .set({ sections: [{ heading: 'x', body: 'y' }] })
          .go({ response: 'all_new' }),
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('removes the report', async () => {
      const userId = userFor('delete');
      await create(userId, '2026-09-13', [{ heading: 'a', body: 'b' }]);

      await entity.delete({ userId, date: '2026-09-13' }).go();
      const fetched = await entity.get({ userId, date: '2026-09-13' }).go();
      expect(fetched.data).toBeNull();
    });

    // 存在しない項目の削除でも例外にならず成功する挙動は、プロシージャ層が削除操作を冪等（idempotent）に保つ前提となっている。
    it('succeeds for a date that does not exist', async () => {
      await expect(
        entity
          .delete({ userId: userFor('delete-missing'), date: '2026-09-13' })
          .go(),
      ).resolves.toBeDefined();
    });
  });

  describe('query by date range', () => {
    const userId = userFor('range');
    const dates = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

    beforeAll(async () => {
      for (const date of dates) {
        await create(userId, date, [{ heading: date, body: 'x' }]);
      }
    });

    it('lists ascending by date', async () => {
      const result = await entity.query
        .primary({ userId })
        .go({ order: 'asc' });
      expect(result.data.map((r) => r.date)).toEqual(dates);
    });

    it('lists descending by date', async () => {
      const result = await entity.query
        .primary({ userId })
        .go({ order: 'desc' });
      expect(result.data.map((r) => r.date)).toEqual([...dates].reverse());
    });

    it('narrows with between, inclusive on both ends', async () => {
      const result = await entity.query
        .primary({ userId })
        .between({ date: '2026-09-11' }, { date: '2026-09-12' })
        .go({ order: 'asc' });
      expect(result.data.map((r) => r.date)).toEqual([
        '2026-09-11',
        '2026-09-12',
      ]);
    });

    it('narrows with gte', async () => {
      const result = await entity.query
        .primary({ userId })
        .gte({ date: '2026-09-12' })
        .go({ order: 'asc' });
      expect(result.data.map((r) => r.date)).toEqual([
        '2026-09-12',
        '2026-09-13',
      ]);
    });

    it('narrows with lte', async () => {
      const result = await entity.query
        .primary({ userId })
        .lte({ date: '2026-09-11' })
        .go({ order: 'asc' });
      expect(result.data.map((r) => r.date)).toEqual([
        '2026-09-10',
        '2026-09-11',
      ]);
    });

    it('pages with a cursor without repeating items', async () => {
      const page1 = await entity.query
        .primary({ userId })
        .go({ order: 'asc', limit: 2 });
      expect(page1.data.map((r) => r.date)).toEqual([
        '2026-09-10',
        '2026-09-11',
      ]);
      expect(page1.cursor).toBeTruthy();

      const page2 = await entity.query
        .primary({ userId })
        .go({ order: 'asc', limit: 2, cursor: page1.cursor });
      expect(page2.data.map((r) => r.date)).toEqual([
        '2026-09-12',
        '2026-09-13',
      ]);
    });
  });

  // パーティションキー（pk）がユーザー単位で分離されている設計の検証。
  // 他人のユーザー ID の項目には、同一日付であってもアクセスできないことを保証する。
  describe('isolation between users', () => {
    const alice = userFor('alice');
    const bob = userFor('bob');
    const date = '2026-09-11';

    beforeAll(async () => {
      await create(alice, date, [
        { heading: 'alice の日報', body: 'alice のみ' },
      ]);
    });

    it('hides the report from another user', async () => {
      const fetched = await entity.get({ userId: bob, date }).go();
      expect(fetched.data).toBeNull();
    });

    it('excludes it from another user list', async () => {
      const result = await entity.query.primary({ userId: bob }).go();
      expect(result.data).toEqual([]);
    });

    it('lets both users hold the same date independently', async () => {
      await create(bob, date, [{ heading: 'bob の日報', body: 'bob のみ' }]);

      const [aliceItem, bobItem] = await Promise.all([
        entity.get({ userId: alice, date }).go(),
        entity.get({ userId: bob, date }).go(),
      ]);
      expect(aliceItem.data?.sections[0]?.heading).toBe('alice の日報');
      expect(bobItem.data?.sections[0]?.heading).toBe('bob の日報');
    });

    it('keeps one user patch from touching the other', async () => {
      await entity
        .patch({ userId: bob, date })
        .set({ sections: [{ heading: 'bob 更新', body: 'x' }] })
        .go({ response: 'all_new' });

      const aliceItem = await entity.get({ userId: alice, date }).go();
      expect(aliceItem.data?.sections[0]?.heading).toBe('alice の日報');
    });

    it('keeps one user delete from touching the other', async () => {
      await entity.delete({ userId: bob, date }).go();

      const aliceItem = await entity.get({ userId: alice, date }).go();
      expect(aliceItem.data).not.toBeNull();
    });
  });
});
