import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, renderRoute } from '../test/renderRoute';
import { Route } from './index';

/**
 * ホーム画面のテスト。
 *
 * 画面の関心は 3 つ。今日の日付で get を引くこと、その結果で導線の文言を
 * 変えること、そして結果が確定するまで日報の有無を断定しないこと。
 */

const HomeComponent = Route.options.component as () => React.ReactNode;

/**
 * ボタンが押せる状態になるまで待ってから返す。
 *
 * 取得中はプライマリ操作を無効にしているため、見つかった時点で
 * クリックしても何も起きない。有効化を待たずに押すとテストが
 * 実装ではなくタイミングに左右される。
 */
const findEnabledButton = async (name: string) => {
  const button = (await screen.findByRole('button', {
    name,
  })) as HTMLButtonElement;
  await waitFor(() => expect(button.disabled).toBe(false));
  return button;
};

const reportWith = (sectionCount: number) => ({
  report: {
    date: '2026-09-13',
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      heading: `見出し${i + 1}`,
      body: '本文',
    })),
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
  },
});

beforeEach(() => {
  // 「今日」を固定する。日中の時刻にしているのは、UTC 起因で日付が
  // 前日にずれる問題（#5）をこのテストの対象から外すため。
  vi.setSystemTime(new Date('2026-09-13T12:00:00+09:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ホーム', () => {
  it('今日の日付で日報を取得する', async () => {
    const get = vi.fn().mockResolvedValue({ report: null });
    renderRoute(HomeComponent, { handlers: { 'dailyReport.get': get } });

    await waitFor(() => expect(get).toHaveBeenCalled());
    // 入力は { date } のオブジェクト。日付は今日。
    const input = get.mock.calls[0]?.[0] as { date: string };
    expect(input.date).toBe('2026-09-13');
  });

  it('今日の日付を画面に出す', async () => {
    renderRoute(HomeComponent, {
      handlers: { 'dailyReport.get': () => ({ report: null }) },
    });

    expect(await screen.findByText('2026-09-13')).toBeDefined();
  });

  describe('日報がまだない日', () => {
    const handlers = { 'dailyReport.get': () => ({ report: null }) };

    it('未作成であることを伝える', async () => {
      renderRoute(HomeComponent, { handlers });
      expect(await screen.findByText('まだ書かれていません。')).toBeDefined();
    });

    it('「書く」導線を出す', async () => {
      renderRoute(HomeComponent, { handlers });
      expect(
        await screen.findByRole('button', { name: '今日の日報を書く' }),
      ).toBeDefined();
      expect(screen.queryByRole('button', { name: '今日の日報を編集' })).toBe(
        null,
      );
    });

    it('「書く」で今日の編集画面へ遷移する', async () => {
      const { router } = renderRoute(HomeComponent, { handlers });

      fireEvent.click(await findEnabledButton('今日の日報を書く'));

      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/reports/2026-09-13'),
      );
    });
  });

  describe('日報がある日', () => {
    const handlers = { 'dailyReport.get': () => reportWith(3) };

    it('記録済みのセクション数を伝える', async () => {
      renderRoute(HomeComponent, { handlers });
      expect(
        await screen.findByText('3 件のセクションが記録されています。'),
      ).toBeDefined();
    });

    it('「編集」導線を出す', async () => {
      renderRoute(HomeComponent, { handlers });
      expect(
        await screen.findByRole('button', { name: '今日の日報を編集' }),
      ).toBeDefined();
      expect(screen.queryByRole('button', { name: '今日の日報を書く' })).toBe(
        null,
      );
    });

    it('「編集」で今日の編集画面へ遷移する', async () => {
      const { router } = renderRoute(HomeComponent, { handlers });

      fireEvent.click(await findEnabledButton('今日の日報を編集'));

      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/reports/2026-09-13'),
      );
    });
  });

  /**
   * 取得が終わるまで「まだ書かれていません」を出すと、実際には存在する
   * 日報を未作成だと誤解させる。確定前に状態を断定しないことを固定する。
   */
  describe('取得中', () => {
    it('日報の有無を断定しない', async () => {
      const pending = deferred<{ report: null }>();
      renderRoute(HomeComponent, {
        handlers: { 'dailyReport.get': () => pending.promise },
      });

      expect(await screen.findByText('読み込み中')).toBeDefined();
      expect(screen.queryByText('まだ書かれていません。')).toBe(null);

      pending.resolve({ report: null });
      expect(await screen.findByText('まだ書かれていません。')).toBeDefined();
    });

    it('ラベルが確定するまでプライマリ操作を押させない', async () => {
      const pending = deferred<{ report: null }>();
      renderRoute(HomeComponent, {
        handlers: { 'dailyReport.get': () => pending.promise },
      });

      // 取得中はラベルが「書く」か「編集」か決まらないので無効。
      const button = (await screen.findByRole('button', {
        name: '今日の日報を書く',
      })) as HTMLButtonElement;
      expect(button.disabled).toBe(true);

      pending.resolve({ report: null });
      await waitFor(() =>
        expect(
          (
            screen.getByRole('button', {
              name: '今日の日報を書く',
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false),
      );
    });
  });

  it('一覧への導線がある', async () => {
    const { router } = renderRoute(HomeComponent, {
      handlers: { 'dailyReport.get': () => ({ report: null }) },
    });

    // 一覧への導線は取得結果に依存しないので、無効化を待つ必要はない。
    fireEvent.click(await screen.findByRole('button', { name: '一覧を見る' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/reports'),
    );
  });
});
