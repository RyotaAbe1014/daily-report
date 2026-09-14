import {
  Alert,
  Box,
  Button,
  Header,
  Pagination,
  SpaceBetween,
  Table,
} from '@cloudscape-design/components';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useApi } from '../../hooks/useApi';

export const Route = createFileRoute('/reports/')({
  component: RouteComponent,
});

/** 1 ページあたりの表示件数。サーバー側のデフォルトは 31 件ですが、一覧画面では見やすさのため 10 件に設定しています。 */
const PAGE_SIZE = 10;

function RouteComponent() {
  const api = useApi();
  const navigate = useNavigate();

  /**
   * サーバーから返却されるページネーション用カーソル文字列の履歴。
   * 前のページへ戻れるよう、通過したカーソルを配列で保持します（先頭ページは undefined）。
   */
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  const { data, isLoading, error } = useQuery(
    api.dailyReport.list.queryOptions({
      limit: PAGE_SIZE,
      order: 'desc',
      cursor: cursors[pageIndex],
    }),
  );

  const reports = data?.reports ?? [];
  const nextCursor = data?.cursor ?? null;

  /** 次ページが存在する場合、その分のページ番号を含めて表示件数を計算します。 */
  const pagesCount = cursors.length + (nextCursor ? 1 : 0);

  const goToPage = (nextPageIndex: number) => {
    // 初めて訪れる次ページへ遷移する場合のみ、新しいカーソルを履歴に追加します。
    if (nextPageIndex === cursors.length && nextCursor) {
      setCursors([...cursors, nextCursor]);
    }
    setPageIndex(nextPageIndex);
  };

  return (
    <SpaceBetween size="l">
      {error ? (
        <Alert type="error" header="日報を取得できませんでした">
          {error.message}
        </Alert>
      ) : null}

      {/*
        Table はデフォルトで行幅が親コンテナいっぱいまで広がり、日付列の左端が
        ヘッダーからはみ出るため、styles.css でマージンを調整して列の開始位置を揃えています。
      */}
      <div className="table-aligned-with-header">
        <Table
          // variant="full-page" にするとモバイル表示時に上下両方へページネーションが表示されてしまうため、
          // 上部のみに絞る目的で "container" を指定しています。
          variant="container"
          loading={isLoading}
          loadingText="読み込み中"
          items={reports}
          columnDefinitions={[
            {
              id: 'date',
              header: '日付',
              width: 160,
              cell: (item) => (
                <Button
                  variant="inline-link"
                  onClick={() =>
                    navigate({
                      to: '/reports/$date',
                      params: { date: item.date },
                    })
                  }
                >
                  {item.date}
                </Button>
              ),
            },
            {
              id: 'sections',
              header: 'セクション',
              width: 130,
              cell: (item) => `${item.sections.length} 件`,
            },
            {
              id: 'updatedAt',
              header: '更新',
              cell: (item) => new Date(item.updatedAt).toLocaleString('ja-JP'),
            },
          ]}
          header={
            <Header
              variant="h1"
              counter={reports.length > 0 ? `(${reports.length})` : undefined}
              description="日付ごとに 1 件の日報を記録します"
              actions={
                <Button
                  variant="primary"
                  onClick={() =>
                    navigate({
                      to: '/reports/$date',
                      // デフォルトは今日の日付。実際の日付は遷移後の編集画面でも変更可能です。
                      params: { date: new Date().toISOString().slice(0, 10) },
                    })
                  }
                >
                  日報を書く
                </Button>
              }
            >
              日報
            </Header>
          }
          empty={
            // 取得エラー時は上部に Alert を表示しているため、
            // ここで「まだ日報がありません」と表示すると未作成と誤認されるのを防ぐ
            error ? (
              <Box textAlign="center" padding="l" color="text-body-secondary">
                日報を表示できませんでした
              </Box>
            ) : (
              <Box textAlign="center" padding="l">
                <SpaceBetween size="s">
                  <Box variant="strong">まだ日報がありません</Box>
                  <Box variant="p" color="text-body-secondary">
                    最初の日報を書いてみましょう。
                  </Box>
                </SpaceBetween>
              </Box>
            )
          }
          pagination={
            <Pagination
              currentPageIndex={pageIndex + 1}
              pagesCount={pagesCount}
              openEnd={nextCursor !== null}
              onChange={({ detail }) => goToPage(detail.currentPageIndex - 1)}
            />
          }
        />
      </div>
    </SpaceBetween>
  );
}
