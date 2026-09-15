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
import { isValidDateString } from '../../lib/date';
import { toErrorMessage } from '../../lib/errorMessage';

export const Route = createFileRoute('/reports/$date')({
  component: RouteComponent,
});

/** サーバー側 SectionSchema と同じ上限。超過は保存前に弾く。 */
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

  /*
   * URL の日付はユーザーが直接書き換えられる。実在しない日付のまま
   * 進むと、DatePicker が近い日付に丸めてしまい、指定していない日に
   * 書き込みかねない。サーバーと同じスキーマで先に弾く。
   */
  const isValidDate = isValidDateString(routeDate);

  const [date, setDate] = useState(routeDate);
  const [sections, setSections] = useState<Section[]>([emptySection()]);
  const [notifications, setNotifications] = useState<FlashbarProps['items']>(
    [],
  );

  // 編集対象は URL の日付。フォームの date を変えても取得先は変えない
  // （別日を開き直すのではなく、保存先の日付を変える操作にする）。
  const { data, isLoading, error } = useQuery({
    ...api.dailyReport.get.queryOptions({ date: routeDate }),
    // 弾いた日付でサーバーを叩いても 400 が返るだけなので問い合わせない。
    enabled: isValidDate,
  });

  const existing = data?.report ?? null;

  // 取得できたら既存の内容をフォームに流し込む。
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
    onError: (e) =>
      notifyError('作成できませんでした', toErrorMessage(e, 'create')),
  });

  const updateReport = useMutation({
    ...api.dailyReport.update.mutationOptions(),
    onSuccess: () => {
      invalidate();
      navigate({ to: '/reports' });
    },
    onError: (e) =>
      notifyError('更新できませんでした', toErrorMessage(e, 'update')),
  });

  const deleteReport = useMutation({
    ...api.dailyReport.delete.mutationOptions(),
    onSuccess: () => {
      invalidate();
      navigate({ to: '/reports' });
    },
    onError: (e) =>
      notifyError('削除できませんでした', toErrorMessage(e, 'delete')),
  });

  const isSaving =
    createReport.isPending || updateReport.isPending || deleteReport.isPending;

  /** 保存できる状態か。サーバー側スキーマと同じ条件で判定する。 */
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
    // 同じ日付に既存があれば更新、なければ作成。
    if (existing && date === routeDate) {
      updateReport.mutate(input);
    } else {
      createReport.mutate(input);
    }
  };

  if (!isValidDate) {
    return (
      <ContentLayout header={<Header variant="h1">日報を開けません</Header>}>
        <Alert
          type="error"
          header="日付が正しくありません"
          action={
            <Button onClick={() => navigate({ to: '/reports' })}>
              一覧へ戻る
            </Button>
          }
        >
          「{routeDate}」は日付として扱えません。一覧から選び直してください。
        </Alert>
      </ContentLayout>
    );
  }

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
          {toErrorMessage(error, 'load')}
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
              // 1 件は必須なので、最後の 1 件は消させない。
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
