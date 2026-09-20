import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, renderRoute } from '../test/renderRoute';
import { Route } from './index';

/**
 * ホーム画面のテスト。
 *
 * 主な検証項目は以下の 3 点：
 * 1. 今日の日付で日報取得 API を呼び出していること
 * 2. 取得結果の有無に応じて導線ボタンの文言が切り替わること
 * 3. 取得完了まで日報の有無を断定した表示を行わないこと
 */

const HomeComponent = Route.options.component as () => React.ReactNode;

/**
 * ボタンがクリック可能（disabled 解除）になるまで待機して要素を返却するヘルパー関数。
 *
 * データ取得中は操作ミスを防ぐためメインボタンを無効化しています。
 * 単に要素の出現を待つだけではクリックが無視される可能性があるため、
 * タイミング依存によるテストの不安定さを防ぐ目的で disabled の解除まで明示的に待ちます。
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
  // テスト実行時の「今日」の日付を固定します。
  // UTC 変換によって日付が前日にずれる問題（#5）の影響をテスト対象から除外するため、日中の時刻（JST 12:00）に指定しています。
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
    // API に渡された入力引数（今日の日付を持つ { date } オブジェクト）を検証する。
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
   * データ取得完了前に「まだ書かれていません」を表示すると、実際には存在する日報を
   * 未作成と誤認させる恐れがあるため、取得処理中の表示制御を検証する。
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

      // 取得処理中は「書く」「編集」のどちらを表示すべきか未確定のため、ボタンを無効化（disabled）とする。
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

    // 一覧画面への遷移ボタンは日報の取得結果に依存しないため、無効化を待たずに即座に押下可能。
    fireEvent.click(await screen.findByRole('button', { name: '一覧を見る' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/reports'),
    );
  });
});
