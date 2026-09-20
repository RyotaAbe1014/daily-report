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

      fireEvent.click(screen.getByRole('button', { name: '次のページ' }));

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
      fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
      await screen.findByText('2026-09-12');

      fireEvent.click(screen.getByRole('button', { name: '前のページ' }));

      await screen.findByText('2026-09-13');
      // 先頭ページはカーソルを付けずに引き直す。
      expect(calls.at(-1)?.cursor).toBeUndefined();
    });

    it('先頭ページでは前へ戻れない', async () => {
      renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13')],
          cursor: 'cursor-1',
        }),
      });

      await screen.findByText('2026-09-13');
      expect(
        (
          screen.getByRole('button', {
            name: '前のページ',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it('最後のページでは次へ進めない', async () => {
      const { handler } = pagedHandler([
        { reports: [report('2026-09-13')], cursor: 'cursor-1' },
        { reports: [report('2026-09-12')], cursor: null },
      ]);
      renderList({ 'dailyReport.list': handler });

      await screen.findByText('2026-09-13');
      fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
      await screen.findByText('2026-09-12');

      expect(
        (
          screen.getByRole('button', {
            name: '次のページ',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });

    it('次ページがあるうちは次へ進める', async () => {
      renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13')],
          cursor: 'cursor-1',
        }),
      });

      await screen.findByText('2026-09-13');
      expect(
        (
          screen.getByRole('button', {
            name: '次のページ',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    // 1 ページに収まるなら移動する余地がないので操作自体を出さない。
    it('1 ページに収まるときは移動の操作を出さない', async () => {
      renderList({
        'dailyReport.list': () => ({
          reports: [report('2026-09-13')],
          cursor: null,
        }),
      });

      await screen.findByText('2026-09-13');
      expect(screen.queryByRole('button', { name: '前のページ' })).toBe(null);
    });

    /*
     * 戻ったあとに進み直すときは、その時点の応答が返したカーソルを
     * 使う。古いカーソルを使い回すと、間の項目が消えていた場合に
     * 実体のない位置を指してしまう。
     */
    it('戻ってから進み直すとカーソルを取り直す', async () => {
      const calls: (string | null | undefined)[] = [];
      let cursorForPage2 = 'cursor-old';
      const handler = (input: unknown) => {
        const { cursor } = input as { cursor?: string | null };
        calls.push(cursor);
        if (!cursor) {
          return { reports: [report('2026-09-13')], cursor: cursorForPage2 };
        }
        return { reports: [report('2026-09-12')], cursor: null };
      };
      const { queryClient } = renderList({ 'dailyReport.list': handler });

      await screen.findByText('2026-09-13');
      fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
      await screen.findByText('2026-09-12');
      expect(calls.at(-1)).toBe('cursor-old');

      fireEvent.click(screen.getByRole('button', { name: '前のページ' }));
      await screen.findByText('2026-09-13');

      // 間の項目が消え、先頭ページが返す次のカーソルが変わった状況。
      cursorForPage2 = 'cursor-new';
      await queryClient.invalidateQueries();
      await waitFor(() => expect(calls.at(-1)).toBeUndefined());

      fireEvent.click(screen.getByRole('button', { name: '次のページ' }));

      // 古い cursor-old ではなく、引き直した cursor-new を使う。
      await waitFor(() => expect(calls.at(-1)).toBe('cursor-new'));
    });

    /*
     * 実際に起きた不具合の再現。2 ページ目の最後の 1 件を消すと全体が
     * 1 ページに収まるのに、訪問履歴を総ページ数として使っていたため
     * 実体のないページへ進めてしまい、そこで「まだ日報がありません」と
     * 表示されていた。
     */
    it('件数が減って 1 ページに収まったら次へ進めない', async () => {
      let total = 11;
      const handler = (input: unknown) => {
        const { cursor } = input as { cursor?: string | null };
        // 先頭ページは 10 件。11 件目があるときだけ次のカーソルを返す。
        if (!cursor) {
          return {
            reports: Array.from({ length: Math.min(total, 10) }, (_, i) =>
              report(`2026-09-${String(13 - i).padStart(2, '0')}`),
            ),
            cursor: total > 10 ? 'cursor-1' : null,
          };
        }
        return { reports: [report('2026-09-02')], cursor: null };
      };

      const { queryClient } = renderList({ 'dailyReport.list': handler });

      await screen.findByText('2026-09-13');
      fireEvent.click(screen.getByRole('button', { name: '次のページ' }));
      await screen.findByText('2026-09-02');

      // 2 ページ目の 1 件が消え、全体が 1 ページに収まる状況にする。
      total = 10;
      fireEvent.click(screen.getByRole('button', { name: '前のページ' }));
      await screen.findByText('2026-09-13');
      await queryClient.invalidateQueries();

      // 1 ページに収まったので移動の操作ごと消える。修正前はここに
      // 実体のない 2 ページ目が残っていた。
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: '次のページ' })).toBe(null),
      );
    });
  });
});
