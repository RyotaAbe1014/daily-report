import {
  QueryClient,
  QueryClientProvider as QueryClientProviderInner,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ComponentProps, FC, PropsWithChildren, useState } from 'react';

/** 再試行しても結果が変わらない HTTP ステータスか。 */
const isClientError = (error: unknown): boolean => {
  const status = (error as { data?: { httpStatus?: number } })?.data
    ?.httpStatus;
  // 400 番台は入力や権限の問題なので、投げ直しても同じ結果になる。
  // 例外は 408（タイムアウト）と 429（レート制限）で、時間を置けば通る。
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
};

/**
 * 既定のリトライは 3 回。入力エラーでもそれが働くと、画面には何も
 * 出ないまま数秒待たされたうえで同じ失敗に終わる。回復し得る失敗
 * だけ再試行する。
 */
const defaultQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !isClientError(error) && failureCount < 3,
      },
      mutations: {
        // 書き込みの再送は重複を生みかねないので、回復し得る失敗でも
        // 1 回だけにとどめる。
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
