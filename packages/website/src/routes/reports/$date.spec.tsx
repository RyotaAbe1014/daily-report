import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deferred, renderRoute } from '../../test/renderRoute';
import { Route } from './$date';

/**
 * 作成・編集画面のテスト。
 *
 * 同一画面で新規作成と更新の両方を処理するため、状況に応じてどちらの mutation を呼び出すかの
 * 条件分岐を重点的に検証します。また、クライアント側の入力検証もサーバー側スキーマの条件と一致している必要があるため、
 * 送信データの境界値を含めて詳細にテストします。
 */

const EditComponent = Route.options.component as () => React.ReactNode;

const renderEdit = (
  handlers: Record<string, (input: unknown) => unknown>,
  date = '2026-09-13',
) =>
  renderRoute(EditComponent, {
    handlers,
    routePath: '/reports/$date',
    initialPath: `/reports/${date}`,
  });

const existingReport = (
  sections = [{ heading: '既存の見出し', body: '既存の本文' }],
) => ({
  report: {
    date: '2026-09-13',
    sections,
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T09:00:00.000Z',
  },
});

const saved = (date = '2026-09-13') => ({
  date,
  sections: [{ heading: 'a', body: 'b' }],
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
});

/** 指定したインデックスのセクションに見出しと本文を入力するヘルパー関数。 */
const fillSection = (index: number, heading: string, body: string) => {
  const headings = screen.getAllByPlaceholderText('今日やったこと');
  const bodies = screen.getAllByPlaceholderText('- 日報 API を実装した');
  fireEvent.change(headings[index], { target: { value: heading } });
  fireEvent.change(bodies[index], { target: { value: body } });
};

const clickSave = () =>
  fireEvent.click(screen.getByRole('button', { name: '保存' }));

describe('作成・編集', () => {
  it('URL の日付で日報を取得する', async () => {
    const get = vi.fn().mockResolvedValue({ report: null });
    renderEdit({ 'dailyReport.get': get }, '2026-09-20');

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0]?.[0]).toMatchObject({ date: '2026-09-20' });
  });

  describe('その日の日報がまだないとき', () => {
    const handlers = { 'dailyReport.get': () => ({ report: null }) };

    it('作成として見せる', async () => {
      renderEdit(handlers);
      expect(await screen.findByText('日報を作成')).toBeDefined();
    });

    it('削除は出さない', async () => {
      renderEdit(handlers);
      await screen.findByText('日報を作成');
      expect(screen.queryByRole('button', { name: '削除' })).toBe(null);
    });

    it('空のセクションが 1 件だけある', async () => {
      renderEdit(handlers);
      await screen.findByText('日報を作成');
      expect(screen.getAllByPlaceholderText('今日やったこと')).toHaveLength(1);
      expect(await screen.findByText('(1/20)')).toBeDefined();
    });
  });

  describe('その日の日報があるとき', () => {
    const handlers = { 'dailyReport.get': () => existingReport() };

    it('編集として見せる', async () => {
      renderEdit(handlers);
      expect(await screen.findByText('日報を編集')).toBeDefined();
    });

    it('既存の内容を読み込む', async () => {
      renderEdit(handlers);
      await screen.findByText('日報を編集');
      expect(
        (
          screen.getAllByPlaceholderText(
            '今日やったこと',
          )[0] as HTMLInputElement
        ).value,
      ).toBe('既存の見出し');
    });

    it('削除を出す', async () => {
      renderEdit(handlers);
      expect(await screen.findByRole('button', { name: '削除' })).toBeDefined();
    });
  });

  describe('セクションの増減', () => {
    const handlers = { 'dailyReport.get': () => ({ report: null }) };

    it('追加できる', async () => {
      renderEdit(handlers);
      await screen.findByText('日報を作成');

      fireEvent.click(screen.getByRole('button', { name: 'セクションを追加' }));

      expect(screen.getAllByPlaceholderText('今日やったこと')).toHaveLength(2);
      expect(screen.getByText('(2/20)')).toBeDefined();
    });

    it('2 件以上あれば削除できる', async () => {
      renderEdit(handlers);
      await screen.findByText('日報を作成');
      fireEvent.click(screen.getByRole('button', { name: 'セクションを追加' }));

      fireEvent.click(screen.getAllByRole('button', { name: '削除' })[0]);

      expect(screen.getAllByPlaceholderText('今日やったこと')).toHaveLength(1);
    });

    // セクションは最低 1 件必要なため、最後の 1 件は削除ボタンを表示させない。
    it('最後の 1 件は削除できない', async () => {
      renderEdit(handlers);
      await screen.findByText('日報を作成');

      expect(screen.getAllByPlaceholderText('今日やったこと')).toHaveLength(1);
      expect(screen.queryByRole('button', { name: '削除' })).toBe(null);
    });
  });

  describe('保存', () => {
    it('既存がなければ作成する', async () => {
      const create = vi.fn().mockResolvedValue(saved());
      renderEdit({
        'dailyReport.get': () => ({ report: null }),
        'dailyReport.create': create,
      });
      await screen.findByText('日報を作成');

      fillSection(0, '今日やったこと', '実装した');
      clickSave();

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0]?.[0]).toEqual({
        date: '2026-09-13',
        sections: [{ heading: '今日やったこと', body: '実装した' }],
      });
    });

    it('既存があれば更新する', async () => {
      const update = vi.fn().mockResolvedValue(saved());
      renderEdit({
        'dailyReport.get': () => existingReport(),
        'dailyReport.update': update,
      });
      await screen.findByText('日報を編集');

      fillSection(0, '更新後', '書き換えた');
      clickSave();

      await waitFor(() => expect(update).toHaveBeenCalled());
      expect(update.mock.calls[0]?.[0]).toEqual({
        date: '2026-09-13',
        sections: [{ heading: '更新後', body: '書き換えた' }],
      });
    });

    it('入力したセクションをすべて送る', async () => {
      const create = vi.fn().mockResolvedValue(saved());
      renderEdit({
        'dailyReport.get': () => ({ report: null }),
        'dailyReport.create': create,
      });
      await screen.findByText('日報を作成');

      fireEvent.click(screen.getByRole('button', { name: 'セクションを追加' }));
      fillSection(0, '今日やったこと', '実装した');
      fillSection(1, '明日やること', 'テストを書く');
      clickSave();

      await waitFor(() => expect(create).toHaveBeenCalled());
      const input = create.mock.calls[0]?.[0] as { sections: unknown[] };
      expect(input.sections).toEqual([
        { heading: '今日やったこと', body: '実装した' },
        { heading: '明日やること', body: 'テストを書く' },
      ]);
    });

    it('保存できたら一覧へ戻る', async () => {
      const { router } = renderEdit({
        'dailyReport.get': () => ({ report: null }),
        'dailyReport.create': () => saved(),
      });
      await screen.findByText('日報を作成');

      fillSection(0, '今日やったこと', '実装した');
      clickSave();

      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/reports'),
      );
    });

    it('保存に失敗したら知らせ、画面に留まる', async () => {
      const { router } = renderEdit({
        'dailyReport.get': () => ({ report: null }),
        'dailyReport.create': () => {
          throw new Error('A report for 2026-09-13 already exists.');
        },
      });
      await screen.findByText('日報を作成');

      fillSection(0, '今日やったこと', '実装した');
      clickSave();

      expect(await screen.findByText('作成できませんでした')).toBeDefined();
      expect(router.state.location.pathname).toBe('/reports/2026-09-13');
    });
  });

  /**
   * クライアント側バリデーションのテスト。
   * 不要な通信往復を減らすための事前チェックであり、サーバー側スキーマと同じ検証ルールが適用されていることを確認する。
   * （なお、最終的な整合性の担保はサーバー側で行われる）
   */
  describe('保存前の検証', () => {
    const setup = () => {
      const create = vi.fn().mockResolvedValue(saved());
      renderEdit({
        'dailyReport.get': () => ({ report: null }),
        'dailyReport.create': create,
      });
      return create;
    };

    it('見出しが空なら送らない', async () => {
      const create = setup();
      await screen.findByText('日報を作成');

      fillSection(0, '', '本文はある');
      clickSave();

      expect(await screen.findByText('入力を確認してください')).toBeDefined();
      expect(create).not.toHaveBeenCalled();
    });

    it('本文が空なら送らない', async () => {
      const create = setup();
      await screen.findByText('日報を作成');

      fillSection(0, '見出しはある', '');
      clickSave();

      expect(await screen.findByText('入力を確認してください')).toBeDefined();
      expect(create).not.toHaveBeenCalled();
    });

    it('空白だけの入力も空として扱う', async () => {
      const create = setup();
      await screen.findByText('日報を作成');

      fillSection(0, '   ', '   ');
      clickSave();

      expect(await screen.findByText('入力を確認してください')).toBeDefined();
      expect(create).not.toHaveBeenCalled();
    });

    it('見出しが 200 文字を超えたら送らない', async () => {
      const create = setup();
      await screen.findByText('日報を作成');

      fillSection(0, 'あ'.repeat(201), '本文');
      clickSave();

      expect(await screen.findByText('入力を確認してください')).toBeDefined();
      expect(create).not.toHaveBeenCalled();
    });

    it('見出しがちょうど 200 文字なら送る', async () => {
      const create = setup();
      await screen.findByText('日報を作成');

      fillSection(0, 'あ'.repeat(200), '本文');
      clickSave();

      await waitFor(() => expect(create).toHaveBeenCalled());
    });
  });

  describe('削除', () => {
    it('その日の日報を削除して一覧へ戻る', async () => {
      const del = vi.fn().mockResolvedValue({ date: '2026-09-13' });
      const { router } = renderEdit({
        'dailyReport.get': () => existingReport(),
        'dailyReport.delete': del,
      });

      fireEvent.click(await screen.findByRole('button', { name: '削除' }));

      await waitFor(() => expect(del).toHaveBeenCalled());
      expect(del.mock.calls[0]?.[0]).toEqual({ date: '2026-09-13' });
      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/reports'),
      );
    });
  });

  describe('取得中', () => {
    it('作成と編集のどちらか決まるまでフォームを出さない', async () => {
      const pending = deferred<{ report: null }>();
      renderEdit({ 'dailyReport.get': () => pending.promise });

      expect(screen.queryByText('日報を作成')).toBe(null);
      expect(screen.queryByText('日報を編集')).toBe(null);

      pending.resolve({ report: null });
      expect(await screen.findByText('日報を作成')).toBeDefined();
    });
  });

  it('キャンセルで一覧へ戻る', async () => {
    const { router } = renderEdit({
      'dailyReport.get': () => ({ report: null }),
    });
    await screen.findByText('日報を作成');

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/reports'),
    );
  });
});
