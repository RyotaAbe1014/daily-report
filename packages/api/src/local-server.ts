import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { appRouter } from './router.js';

const PORT = 2022;

// ローカルサーバーは API Gateway を経由しないため Cognito のクレームが存在しない。
// 認証ミドルウェアに固定ユーザーを使わせるための明示的な指定。
// 本番の Lambda ではこの変数を設定しないこと。
process.env.LOCAL_DEV = 'true';

createHTTPServer({
  router: appRouter,
  middleware: cors(),
  createContext() {
    return {
      event: {} as any,
      context: {} as any,
      info: {} as any,
    };
  },
}).listen(PORT);

console.log(`Local TRPC server listening on port ${PORT}`);
