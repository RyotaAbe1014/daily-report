import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deferred, renderRoute } from '../../test/renderRoute';
import { Route } from './index';

/**
 * 一覧画面のテスト。
 *
 * 関心はカーソルページングの積み方と、行から編集画面へ渡す日付。
 * カーソルはサーバーが返す不透明な文字列で、前ページへ戻るために
 * 通過したものを積んでいる。ここが崩れると同じページを往復したり
 * 進めなくなったりするので、入力に何が渡るかまで見る。
 */

const ListComponent = Route.options.component as () => React.ReactNode;

const renderList = (handlers: Record<string, (input: unknown) => unknown>) =>
  renderRoute(ListComponent, {
    handlers,
    routePath: '/reports',
    initialPath: '/reports',
  });

const report = (date: string, sections = 1) => ({
  date,
  sections: Array.from({ length: sections }, (_, i) => ({
    heading: `見出し${i + 1}`,
    body: '本文',
  })),
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T09:30:00.000Z',
});

/** 行を日付で引く。テーブルの行構造に依存させない。 */
const rowFor = async (date: string) => {
  const cell = await screen.findByText(date);
  const row = cell.closest('tr');
  if (!row) {
    throw new Error(`row for ${date} not found`);
  }
  return row;
};

describe('一覧', () => {
  it('降順で 10 件ずつ取得する', async () => {
    const list = vi.fn().mockResolvedValue({ reports: [], cursor: null });
    renderList({ 'dailyReport.list': list });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list.mock.calls[0]?.[0]).toMatchObject({
      limit: 10,
      order: 'desc',
    });
  });

  it('日報を行として並べる', async () => {
    renderList({
      'dailyReport.list': () => ({
        reports: [report('2026-09-13', 3), report('2026-09-12', 1)],
        cursor: null,
      }),
    });

    const row = await rowFor('2026-09-13');
    expect(within(row).getByText('3 件')).toBeDefined();
    expect(await screen.findByText('2026-09-12')).toBeDefined();
  });

  it('件数をヘッダーに出す', async () => {
    renderList({
      'dailyReport.list': () => ({
        reports: [report('2026-09-13'), report('2026-09-12')],
        cursor: null,
      }),
    });

    expect(await screen.findByText('(2)')).toBeDefined();
  });

  it('日報がないときは空であることを伝える', async () => {
    renderList({
      'dailyReport.list': () => ({ reports: [], cursor: null }),
    });

    expect(await screen.findByText('まだ日報がありません')).toBeDefined();
  });

  it('取得に失敗したら知らせる', async () => {
    renderList({
      'dailyReport.list': () => {
        throw new Error('boom');
      },
    });

    expect(await screen.findByText('日報を取得できませんでした')).toBeDefined();
    // 失敗を空と取り違えさせない。
    expect(screen.queryByText('まだ日報がありません')).toBe(null);
  });

  it('取得中は読み込み中と伝える', async () => {
    const pending = deferred<{ reports: []; cursor: null }>();
    renderList({ 'dailyReport.list': () => pending.promise });

    expect(await screen.findByText('読み込み中')).toBeDefined();
    expect(screen.queryByText('まだ日報がありません')).toBe(null);

    pending.resolve({ reports: [], cursor: null });
    expect(await screen.findByText('まだ日報がありません')).toBeDefined();
  });

  describe('編集画面への導線', () => {
    it('日付をクリックするとその日の編集画面へ移る', async () => {
      const { router } = renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13'), report('2026-09-12')],
          cursor: null,
        }),
      });

      fireEvent.click(
        await screen.findByRole('button', { name: '2026-09-13' }),
      );

      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/reports/2026-09-13'),
      );
    });

    it('別の行からはその行の日付へ移る', async () => {
      const { router } = renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13'), report('2026-09-12')],
          cursor: null,
        }),
      });

      fireEvent.click(
        await screen.findByRole('button', { name: '2026-09-12' }),
      );

      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/reports/2026-09-12'),
      );
    });
  });

  describe('ページング', () => {
    /** ページごとの応答を順に返す。呼ばれた入力は calls に残す。 */
    const pagedHandler = (
      pages: { reports: unknown[]; cursor: string | null }[],
    ) => {
      const calls: { cursor?: string | null }[] = [];
      const handler = (input: unknown) => {
        const typed = input as { cursor?: string | null };
        calls.push(typed);
        // カーソルの値で何ページ目かを決める。
        const index = typed.cursor
          ? pages.findIndex((p) => p.cursor === typed.cursor) + 1
          : 0;
        return pages[index] ?? { reports: [], cursor: null };
      };
      return { handler, calls };
    };

    it('次ページへ進むときサーバーが返したカーソルを渡す', async () => {
      const { handler, calls } = pagedHandler([
        { reports: [report('2026-09-13')], cursor: 'cursor-1' },
        { reports: [report('2026-09-12')], cursor: null },
      ]);
      renderList({ 'dailyReport.list': handler });

      await screen.findByText('2026-09-13');
      // 初回はカーソルなし。
      expect(calls[0]?.cursor).toBeUndefined();

      fireEvent.click(screen.getByRole('button', { name: '2' }));

      await screen.findByText('2026-09-12');
      expect(calls.at(-1)?.cursor).toBe('cursor-1');
    });

    it('前ページへ戻ると先頭のカーソルに戻る', async () => {
      const { handler, calls } = pagedHandler([
        { reports: [report('2026-09-13')], cursor: 'cursor-1' },
        { reports: [report('2026-09-12')], cursor: null },
      ]);
      renderList({ 'dailyReport.list': handler });

      await screen.findByText('2026-09-13');
      fireEvent.click(screen.getByRole('button', { name: '2' }));
      await screen.findByText('2026-09-12');

      fireEvent.click(screen.getByRole('button', { name: '1' }));

      await screen.findByText('2026-09-13');
      // 先頭ページはカーソルを付けずに引き直す。
      expect(calls.at(-1)?.cursor).toBeUndefined();
    });

    // 次ページの有無はページ番号の数で表れる。cursor が null なら
    // 現在のページまでしか出さない。
    it('最後のページでは次のページ番号を出さない', async () => {
      renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13')],
          cursor: null,
        }),
      });

      await screen.findByText('2026-09-13');
      expect(screen.getByRole('button', { name: '1' })).toBeDefined();
      expect(screen.queryByRole('button', { name: '2' })).toBe(null);
    });

    it('次ページがあるうちは次のページ番号を出す', async () => {
      renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13')],
          cursor: 'cursor-1',
        }),
      });

      await screen.findByText('2026-09-13');
      expect(await screen.findByRole('button', { name: '2' })).toBeDefined();
    });
  });
});
