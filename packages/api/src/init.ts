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
 * 認証を必須とするプロシージャ。
 *
 * ctx.userId が string として確定するため、各プロシージャは入力から
 * userId を受け取ってはならない。入力に userId を含めると、他人の ID を
 * 指定して他人の日報を読み書きできてしまう。
 */
export const authenticatedProcedure = publicProcedure.concat(
  createAuthPlugin(),
);
