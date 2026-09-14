import {
  Alert,
  AttributeEditor,
  Box,
  Button,
  Container,
  ContentLayout,
  DatePicker,
  Flashbar,
  type FlashbarProps,
  Form,
  FormField,
  Header,
  Input,
  SpaceBetween,
  Spinner,
  Textarea,
} from '@cloudscape-design/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';

export const Route = createFileRoute('/reports/$date')({
  component: RouteComponent,
});

/** サーバー側 SectionSchema と同等の上限値。バリデーションエラーを防ぐため保存前にチェックします。 */
const MAX_SECTIONS = 20;
const HEADING_MAX = 200;
const BODY_MAX = 100_000;

type Section = { heading: string; body: string };

const emptySection = (): Section => ({ heading: '', body: '' });

function RouteComponent() {
  const { date: routeDate } = Route.useParams();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(routeDate);
  const [sections, setSections] = useState<Section[]>([emptySection()]);
  const [notifications, setNotifications] = useState<FlashbarProps['items']>(
    [],
  );

  // 編集対象のデータ取得には URL パラメータの日付（routeDate）を使用します。
  // フォーム内の日付入力を変更しても取得先は変えず、「保存先の日付を変更する」操作として扱います。
  const { data, isLoading, error } = useQuery(
    api.dailyReport.get.queryOptions({ date: routeDate }),
  );

  const existing = data?.report ?? null;

  // 取得完了時、既存の日報データをフォームの入力状態に反映します。
  useEffect(() => {
    if (existing) {
      setSections(existing.sections.map((s) => ({ ...s })));
    }
  }, [existing]);

  const invalidate = () => {
    queryClient.invalidateQueries(api.dailyReport.list.queryFilter());
    queryClient.invalidateQueries(api.dailyReport.get.queryFilter());
  };

  const notifyError = (header: string, message: string) => {
    setNotifications([
      {
        type: 'error',
        header,
        content: message,
        dismissible: true,
        onDismiss: () => setNotifications([]),
      },
    ]);
  };

  const createReport = useMutation({
    ...api.dailyReport.create.mutationOptions(),
    onSuccess: () => {
      invalidate();
      navigate({ to: '/reports' });
    },
    onError: (e) => notifyError('作成できませんでした', e.message),
  });

  const updateReport = useMutation({
    ...api.dailyReport.update.mutationOptions(),
    onSuccess: () => {
      invalidate();
      navigate({ to: '/reports' });
    },
    onError: (e) => notifyError('更新できませんでした', e.message),
  });

  const deleteReport = useMutation({
    ...api.dailyReport.delete.mutationOptions(),
    onSuccess: () => {
      invalidate();
      navigate({ to: '/reports' });
    },
    onError: (e) => notifyError('削除できませんでした', e.message),
  });

  const isSaving =
    createReport.isPending || updateReport.isPending || deleteReport.isPending;

  /** 入力内容が保存可能な状態かを判定します。サーバー側スキーマと同じバリデーション条件を適用しています。 */
  const validationMessage = (() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return '日付を選んでください。';
    }
    if (sections.length < 1) {
      return 'セクションを 1 件以上入力してください。';
    }
    if (sections.some((s) => !s.heading.trim() || !s.body.trim())) {
      return '見出しと本文の両方を入力してください。';
    }
    if (sections.some((s) => s.heading.length > HEADING_MAX)) {
      return `見出しは ${HEADING_MAX} 文字までです。`;
    }
    if (sections.some((s) => s.body.length > BODY_MAX)) {
      return `本文は ${BODY_MAX} 文字までです。`;
    }
    return null;
  })();

  const save = () => {
    if (validationMessage) {
      notifyError('入力を確認してください', validationMessage);
      return;
    }
    const input = { date, sections };
    // 取得元と同じ日付であれば更新（update）、別の日付または新規作成時は作成（create）を実行します。
    if (existing && date === routeDate) {
      updateReport.mutate(input);
    } else {
      createReport.mutate(input);
    }
  };

  if (isLoading) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <ContentLayout
      notifications={<Flashbar items={notifications} />}
      header={
        <Header
          variant="h1"
          description={
            existing
              ? `${routeDate} の日報を編集しています`
              : `${routeDate} の日報を新しく作成します`
          }
          actions={
            existing ? (
              <Button
                onClick={() => deleteReport.mutate({ date: routeDate })}
                loading={deleteReport.isPending}
              >
                削除
              </Button>
            ) : undefined
          }
        >
          {existing ? '日報を編集' : '日報を作成'}
        </Header>
      }
    >
      {error ? (
        <Alert type="error" header="日報を取得できませんでした">
          {error.message}
        </Alert>
      ) : null}

      <Form
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="link"
              onClick={() => navigate({ to: '/reports' })}
              disabled={isSaving}
            >
              キャンセル
            </Button>
            <Button variant="primary" onClick={save} loading={isSaving}>
              保存
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">基本情報</Header>}>
            <FormField
              label="日付"
              description="1 日につき 1 件の日報を保存できます"
            >
              <DatePicker
                value={date}
                onChange={({ detail }) => setDate(detail.value)}
                placeholder="YYYY/MM/DD"
                openCalendarAriaLabel={(selected) =>
                  selected ? `日付を選択 (${selected})` : '日付を選択'
                }
              />
            </FormField>
          </Container>

          <Container
            header={
              <Header
                variant="h2"
                counter={`(${sections.length}/${MAX_SECTIONS})`}
                description="本文は Markdown で書けます"
              >
                セクション
              </Header>
            }
          >
            <AttributeEditor
              items={sections}
              addButtonText="セクションを追加"
              removeButtonText="削除"
              // 最低 1 件のセクション入力が必須であるため、最後の 1 件は削除不可とします。
              isItemRemovable={() => sections.length > 1}
              onAddButtonClick={() =>
                setSections([...sections, emptySection()])
              }
              onRemoveButtonClick={({ detail }) =>
                setSections(sections.filter((_, i) => i !== detail.itemIndex))
              }
              disableAddButton={sections.length >= MAX_SECTIONS}
              empty="セクションがありません"
              definition={[
                {
                  label: '見出し',
                  control: (item: Section, index) => (
                    <Input
                      value={item.heading}
                      placeholder="今日やったこと"
                      onChange={({ detail }) =>
                        setSections(
                          sections.map((s, i) =>
                            i === index ? { ...s, heading: detail.value } : s,
                          ),
                        )
                      }
                    />
                  ),
                },
                {
                  label: '本文',
                  control: (item: Section, index) => (
                    <Textarea
                      value={item.body}
                      rows={5}
                      placeholder="- 日報 API を実装した"
                      onChange={({ detail }) =>
                        setSections(
                          sections.map((s, i) =>
                            i === index ? { ...s, body: detail.value } : s,
                          ),
                        )
                      }
                    />
                  ),
                },
              ]}
            />
          </Container>
        </SpaceBetween>
      </Form>
    </ContentLayout>
  );
}
