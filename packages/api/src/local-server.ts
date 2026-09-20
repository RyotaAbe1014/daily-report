import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { appRouter } from './router.js';

const PORT = 2022;

// ローカルスタンドアロンサーバーは API Gateway を経由しないため、Cognito のクレーム情報が存在しません。
// 認証ミドルウェアでローカル用のモックユーザー（固定ID）を使用させるために LOCAL_DEV を有効化しています。
// ※ 本番環境の Lambda では絶対にこの環境変数を設定しないでください。
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
