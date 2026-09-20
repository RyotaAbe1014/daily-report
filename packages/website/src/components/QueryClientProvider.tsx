import {
  QueryClient,
  QueryClientProvider as QueryClientProviderInner,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ComponentProps, FC, PropsWithChildren, useState } from 'react';

/** 再試行しても結果が変わらない HTTP ステータスかどうかを判定します。 */
const isClientError = (error: unknown): boolean => {
  const status = (error as { data?: { httpStatus?: number } })?.data
    ?.httpStatus;
  // 400 番台は入力内容や権限に起因するため、再送しても同じ結果になります。
  // ただし 408（タイムアウト）と 429（レート制限）は時間を置けば成功し得るため除外します。
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
};

/**
 * TanStack Query の既定リトライ回数は 3 回です。入力エラーに対しても
 * これが適用されると、画面に何も表示されないまま数秒待たされた末に
 * 同じ失敗に終わってしまいます。回復の見込みがある失敗のみ再試行します。
 */
const defaultQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !isClientError(error) && failureCount < 3,
      },
      mutations: {
        // 書き込み操作の再送は重複登録を招く恐れがあるため、
        // 回復の見込みがある失敗であっても再試行は 1 回までとします。
        retry: (failureCount, error) =>
          !isClientError(error) && failureCount < 1,
      },
    },
  });

type QueryClientProviderProps = PropsWithChildren & {
  client?: QueryClient;
  devtoolsOptions?: Omit<ComponentProps<typeof ReactQueryDevtools>, 'client'>;
  disableDevtools?: boolean;
};

export const QueryClientProvider: FC<QueryClientProviderProps> = ({
  children,
  client = defaultQueryClient(),
  disableDevtools = false,
  devtoolsOptions,
}) => {
  const [queryClient] = useState(client);
  return (
    <QueryClientProviderInner client={queryClient}>
      {children}
      {!disableDevtools && (
        <ReactQueryDevtools client={queryClient} {...devtoolsOptions} />
      )}
    </QueryClientProviderInner>
  );
};

export default QueryClientProvider;
