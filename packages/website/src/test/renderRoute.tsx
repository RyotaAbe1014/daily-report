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
 * プロシージャ名（例: 'dailyReport.get'）から、そのプロシージャが返す値を
 * 決める関数への対応。値を返せば解決、throw すれば失敗として扱われる。
 */
export type ProcedureHandlers = Record<
  string,
  (input: unknown) => unknown | Promise<unknown>
>;

/**
 * handlers を引くだけの tRPC リンク。
 *
 * 本物の createTRPCClient をそのまま使い、一番下のリンクだけ差し替える。
 * クライアント内部の実装に触れないので、tRPC 側の都合で壊れにくい。
 */
const stubLink =
  (handlers: ProcedureHandlers): TRPCLink<AppRouter> =>
  () =>
  ({ op }) => {
    // tRPC のリンクは observable を返す約束。購読されたら 1 回値を流して
    // 完了する、という最小の実装で足りる。
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
 * 1 つのルートコンポーネントを、API スタブと router を付けて描画する。
 *
 * 画面は useApi() と useNavigate() に依存するため、素の render では動かない。
 * ここで最小の Provider 一式を組む。
 */
export const renderRoute = (
  component: () => ReactNode,
  options: {
    handlers?: ProcedureHandlers;
    /** 初期表示する URL。ルートパラメータを使う画面で指定する。 */
    initialPath?: string;
    /** ルートのパス。$date のようなパラメータを含められる。 */
    routePath?: string;
  } = {},
) => {
  const { handlers = {}, initialPath = '/', routePath = '/' } = options;

  const queryClient = new QueryClient({
    defaultOptions: {
      // テストではリトライを待ちたくない。失敗は即座に error にする。
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
   * 遷移先として存在させるだけのルート。描画内容は検証しない。
   * 検証対象と同じパスを二重に登録すると router が id の重複で落ちるため、
   * 対象のパスは除いてから足す。
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
        {/* router の型はルートツリーごとに異なるため、ここでは緩めて渡す */}
        <RouterProvider router={router as never} />
      </ApiTRPCContext.Provider>
    </QueryClientProvider>,
  );

  // render の戻り値は screen 経由で足りるので返さない。
  // 返すと pretty-format の型が推論に混ざって名前解決できなくなる。
  return { router, queryClient };
};

/** 解決を任意のタイミングまで遅らせるためのハンドラ。 */
export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
