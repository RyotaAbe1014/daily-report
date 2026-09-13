import { initTRPC } from '@trpc/server';
import {
  createAuthPlugin,
  createErrorPlugin,
  createLoggerPlugin,
  createMetricsPlugin,
  createTracerPlugin,
  IMiddlewareContext,
} from './middleware/index.js';

process.env.POWERTOOLS_SERVICE_NAME = 'Api';
process.env.POWERTOOLS_METRICS_NAMESPACE = 'Api';

export type Context = IMiddlewareContext;

export const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure
  .concat(createLoggerPlugin())
  .concat(createTracerPlugin())
  .concat(createMetricsPlugin())
  .concat(createErrorPlugin());

/**
 * 認証を必須とするプロシージャ定義。
 *
 * ミドルウェアによって ctx.userId が確定するため、各プロシージャの入力スキーマで
 * クライアントから userId を受け取らないようにしてください（なりすましによる他人の日報アクセスを防ぐため）。
 */
export const authenticatedProcedure = publicProcedure.concat(
  createAuthPlugin(),
);
