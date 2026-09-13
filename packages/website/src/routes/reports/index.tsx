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

/** 1 ページあたりの件数。サーバー側の既定は 31 だが一覧では短めにする。 */
const PAGE_SIZE = 10;

function RouteComponent() {
  const api = useApi();
  const navigate = useNavigate();

  /**
   * カーソルはサーバーが返す不透明な文字列。前ページへ戻れるように
   * これまでに通過したカーソルを積んでおく。先頭ページは undefined。
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

  /** 次ページがあるなら、その分だけページ番号を見せる。 */
  const pagesCount = cursors.length + (nextCursor ? 1 : 0);

  const goToPage = (nextPageIndex: number) => {
    // 未訪問の次ページへ進むときだけカーソルを積む。
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

      <Table
        variant="full-page"
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
            id: 'headings',
            header: '見出し',
            cell: (item) => item.sections.map((s) => s.heading).join(' / '),
          },
          {
            id: 'updatedAt',
            header: '更新',
            width: 200,
            cell: (item) => new Date(item.updatedAt).toLocaleString('ja-JP'),
          },
        ]}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={reports.length > 0 ? `(${reports.length})` : undefined}
            description="日付ごとに 1 件の日報を記録します"
            actions={
              <Button
                variant="primary"
                onClick={() =>
                  navigate({
                    to: '/reports/$date',
                    // 既定は今日。日付は編集画面で変更できる。
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
          <Box textAlign="center" padding="l">
            <SpaceBetween size="s">
              <Box variant="strong">まだ日報がありません</Box>
              <Box variant="p" color="text-body-secondary">
                最初の日報を書いてみましょう。
              </Box>
            </SpaceBetween>
          </Box>
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
    </SpaceBetween>
  );
}
