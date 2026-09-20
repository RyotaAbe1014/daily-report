import {
  Alert,
  Box,
  Button,
  Header,
  SpaceBetween,
  Table,
} from '@cloudscape-design/components';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { toErrorMessage } from '../../lib/errorMessage';

export const Route = createFileRoute('/reports/')({
  component: RouteComponent,
});

/** 1 ページあたりの表示件数。サーバー側の既定値は 31 ですが、一覧画面では短めに設定します。 */
const PAGE_SIZE = 10;

function RouteComponent() {
  const api = useApi();
  const navigate = useNavigate();

  /**
   * サーバーから返却されるページネーション用カーソル文字列の履歴。
   * 前のページへ戻れるよう、通過したカーソルを配列で保持します（先頭ページは undefined）。
   *
   * この履歴はあくまで「どこまで進んだか」を表すもので、総ページ数ではありません。
   * カーソル方式では全体の件数を取得できないため、ページ数は表示せず、
   * 前後へ移動できるかどうかのみを提示します。
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

  const hasPrevious = pageIndex > 0;
  const hasNext = nextCursor !== null;

  const goToNextPage = () => {
    if (!nextCursor) {
      return;
    }
    // 初めて訪れるページへ遷移する場合のみ、新しいカーソルを履歴に追加します。
    // 戻ってから進み直した場合は既に保持済みのため、履歴は変更しません。
    if (pageIndex + 1 === cursors.length) {
      setCursors([...cursors, nextCursor]);
    }
    setPageIndex(pageIndex + 1);
  };

  const goToPreviousPage = () => {
    if (!hasPrevious) {
      return;
    }
    /*
     * 進んだ先の履歴は破棄します。保持しても再利用の余地がないうえ、
     * 削除などで件数が減った後は存在しない位置を指し続けてしまうためです。
     * 進み直す際は、その時点のレスポンスから改めてカーソルを取得します。
     */
    setCursors(cursors.slice(0, pageIndex));
    setPageIndex(pageIndex - 1);
  };

  return (
    <SpaceBetween size="l">
      {error ? (
        <Alert type="error" header="日報を取得できませんでした">
          {toErrorMessage(error, 'load')}
        </Alert>
      ) : null}

      {/*
        Table は行を親の左右いっぱいに広げるため、そのままだと日付の左端が
        ヘッダーより外側に出る。styles.css で内側に寄せて列を揃える。
      */}
      <div className="table-aligned-with-header">
        <Table
          // variant="full-page" はモバイル幅の場合、ヘッダーとフッターの双方に
          // ページネーションを複製します。操作を上部の 1 箇所へ集約するため container を使用します。
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
                      // 既定値は当日です。日付は編集画面で変更できます。
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
            // 取得失敗時は Alert を表示しているため、ここで「まだありません」と
            // 重ねて表示すると、未作成であると誤解を招きます。
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
            // ページ番号は表示しません。カーソル方式では総件数を取得できず、
            // 訪問履歴を総ページ数として扱うと、削除により件数が減った後も
            // 存在しないページが残ってしまうためです。
            hasPrevious || hasNext ? (
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  iconName="angle-left"
                  ariaLabel="前のページ"
                  disabled={!hasPrevious || isLoading}
                  onClick={goToPreviousPage}
                />
                <Button
                  iconName="angle-right"
                  ariaLabel="次のページ"
                  disabled={!hasNext || isLoading}
                  onClick={goToNextPage}
                />
              </SpaceBetween>
            ) : undefined
          }
        />
      </div>
    </SpaceBetween>
  );
}
