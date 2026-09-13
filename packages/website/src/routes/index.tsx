import {
  Box,
  Button,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
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

  // 今日の日報が既にあるかで、導線の文言と遷移先を変える。
  const { data } = useQuery(api.dailyReport.get.queryOptions({ date: today }));
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
              <Button
                variant="primary"
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
            {todayReport ? (
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
