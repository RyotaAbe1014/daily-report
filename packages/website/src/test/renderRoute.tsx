import type { AppRouter } from '@daily-report/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createTRPCClient, TRPCClientError, type TRPCLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { ReactNode } from 'react';
import { ApiTRPCContext } from '../components/ApiClientProvider';

/**
 * プロシージャ名（例: 'dailyReport.get'）と、その返却値を解決する関数とのマッピング。
 * 値を返せば成功（resolve）、例外を throw すれば失敗（reject）として処理されます。
 */
export type ProcedureHandlers = Record<
  string,
  (input: unknown) => unknown | Promise<unknown>
>;

/**
 * 指定した handlers の結果を返すモック用 tRPC リンク。
 *
 * 公式の createTRPCClient をそのまま使い、末端のリンク層のみを差し替えます。
 * クライアントの内部実装に依存しないため、tRPC のバージョンアップ等による影響を受けにくい設計です。
 */
const stubLink =
  (handlers: ProcedureHandlers): TRPCLink<AppRouter> =>
  () =>
  ({ op }) => {
    // tRPC のリンク仕様に従い observable を返します。
    // テスト用途のため、購読開始時に一度だけ値を流して完了（complete）する最小構成としています。
    const subscribe = (observer: {
      next?: (value: unknown) => void;
      error?: (err: unknown) => void;
      complete?: () => void;
    }) => {
      let cancelled = false;

      Promise.resolve()
        .then(() => {
          const handler = handlers[op.path];
          if (!handler) {
            throw new Error(`No stub handler registered for "${op.path}"`);
          }
          return handler(op.input);
        })
        .then((data) => {
          if (cancelled) {
            return;
          }
          observer.next?.({ result: { type: 'data', data } });
          observer.complete?.();
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          observer.error?.(
            error instanceof TRPCClientError
              ? error
              : new TRPCClientError(
                  error instanceof Error ? error.message : String(error),
                ),
          );
        });

      return {
        unsubscribe: () => {
          cancelled = true;
        },
      };
    };

    return { subscribe } as never;
  };

/**
 * 対象のルートコンポーネントを、モック API とルーターを設定した状態でレンダリングします。
 *
 * 画面コンポーネントは useApi() や useNavigate() に依存しているため、通常の render() では動作しません。
 * ここで動作に必要な最小限の Provider 群を一括で設定します。
 */
export const renderRoute = (
  component: () => ReactNode,
  options: {
    handlers?: ProcedureHandlers;
    /** 初期表示する URL。URL パラメータを必要とする画面などで指定します。 */
    initialPath?: string;
    /** ルートの定義パス（例: '$date' などの動的パラメータを含むパス）。 */
    routePath?: string;
  } = {},
) => {
  const { handlers = {}, initialPath = '/', routePath = '/' } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      // テスト実行時の待機時間をなくすため、自動リトライを無効化し即座にエラーとします。
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const client = createTRPCClient<AppRouter>({ links: [stubLink(handlers)] });
  const optionsProxy = createTRPCOptionsProxy<AppRouter>({
    client,
    queryClient,
  });

  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: routePath,
    component,
  });

  /**
   * 画面遷移の検証用にダミーとして登録しておく遷移先ルート一覧。
   * テスト対象と同一パスを二重登録すると router が ID 重複エラーで停止するため、
   * 対象のパスを除外した上で追加します。
   */
  const destinations = ['/', '/reports', '/reports/$date']
    .filter((path) => path !== routePath)
    .map((path) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path,
        component: () => <div>{path}</div>,
      }),
    );

  const router = createRouter({
    routeTree: rootRoute.addChildren([route, ...destinations]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ApiTRPCContext.Provider value={{ optionsProxy, client }}>
        {/* router の型定義はルートツリーの構造に依存するため、ここでは柔軟に扱えるようキャストして渡します */}
        <RouterProvider router={router as never} />
      </ApiTRPCContext.Provider>
    </QueryClientProvider>,
  );

  // レンダリング結果の要素は screen 経由で取得可能なため返却しません。
  // （戻り値に含めると pretty-format の型推論の影響で名前解決エラーが発生することがあります）
  return { router, queryClient };
};

/** 任意のタイミングで非同期処理を完了または拒否させるためのユーティリティ。 */
export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
