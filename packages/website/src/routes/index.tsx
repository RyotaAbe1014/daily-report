import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  StatusIndicator,
} from '@cloudscape-design/components';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useApi } from '../hooks/useApi';

export const Route = createFileRoute('/')({
  component: RouteComponent,
});

function RouteComponent() {
  const api = useApi();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  // 今日の日報がすでに作成されているかどうかに応じて、ボタンの文言を切り替えます。
  const { data, isLoading } = useQuery(
    api.dailyReport.get.queryOptions({ date: today }),
  );
  const todayReport = data?.report ?? null;

  return (
    <ContentLayout
      header={
        <Header variant="h1" description="日々の記録を残します">
          ホーム
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container
          header={<Header variant="h2">今日の日報</Header>}
          footer={
            <SpaceBetween direction="horizontal" size="xs">
              {/*
                ボタンのラベル（「今日の日報を書く」または「今日の日報を編集」）は取得結果に依存するため、
                データ取得が完了するまではボタンを無効化（disabled）にして誤操作を防ぎます。
              */}
              <Button
                variant="primary"
                disabled={isLoading}
                onClick={() =>
                  navigate({ to: '/reports/$date', params: { date: today } })
                }
              >
                {todayReport ? '今日の日報を編集' : '今日の日報を書く'}
              </Button>
              <Button onClick={() => navigate({ to: '/reports' })}>
                一覧を見る
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="s">
            <Box variant="awsui-key-label">{today}</Box>
            {/*
              読み込み完了前に「まだ書かれていません」を表示すると、実際には存在する日報を
              未作成と誤認させてしまうため、データが確定するまではスピナーのみを表示します。
            */}
            {isLoading ? (
              <StatusIndicator type="loading">読み込み中</StatusIndicator>
            ) : todayReport ? (
              <Box variant="p">
                {todayReport.sections.length} 件のセクションが記録されています。
              </Box>
            ) : (
              <Box variant="p" color="text-body-secondary">
                まだ書かれていません。
              </Box>
            )}
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
