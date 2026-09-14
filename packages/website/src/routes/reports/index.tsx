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
   *
   * この履歴は「どこまで進んだか」でしかなく、総ページ数ではない。
   * カーソル方式では全体の件数が分からないため、何ページあるかは
   * 表示せず、前後に移動できるかどうかだけを見せる。
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
    // 未訪問のページへ進むときだけカーソルを積む。
    // 戻ってから進み直した場合は既に積んであるので触らない。
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
     * 進んだ先の履歴は捨てる。残しても使い道がないうえ、削除などで
     * 件数が減ったあとは実体のない位置を指したままになる。
     * 進み直すときはその時点の応答から改めてカーソルを積む。
     */
    setCursors(cursors.slice(0, pageIndex));
    setPageIndex(pageIndex - 1);
  };

  return (
    <SpaceBetween size="l">
      {error ? (
        <Alert type="error" header="日報を取得できませんでした">
          {error.message}
        </Alert>
      ) : null}

      {/*
        Table は行を親の左右いっぱいに広げるため、そのままだと日付の左端が
        ヘッダーより外側に出る。styles.css で内側に寄せて列を揃える。
      */}
      <div className="table-aligned-with-header">
        <Table
          // full-page はモバイル幅のときヘッダーとフッターの両方に
          // ページネーションを複製する。操作は上の 1 つに絞りたいので container を使う。
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
            // 取得に失敗したときは Alert を出しているので、ここで
            // 「まだありません」と重ねると未作成だと誤解させる。
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
            // ページ番号は出さない。カーソル方式では総件数が分からず、
            // 訪問履歴を総ページ数として見せると、削除で件数が減った
            // あとも実体のないページが残ってしまう。
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
