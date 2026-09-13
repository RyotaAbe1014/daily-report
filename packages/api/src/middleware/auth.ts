import { initTRPC, TRPCError } from '@trpc/server';
import { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface IAuthContext {
  /**
   * 認証済みユーザーの識別子。Cognito の `sub` クレーム。
   *
   * ユーザープール内で一意かつ不変なので、DynamoDB のパーティションキーに使う。
   * メールアドレスやユーザー名は変更できてしまうため使わない。
   */
  userId?: string;
}

/**
 * ローカル開発で使う固定のユーザー ID。
 * API Gateway を経由しないローカルサーバーにはクレームが存在しないため。
 */
export const LOCAL_DEV_USER_ID = 'local-dev-user';

/**
 * API Gateway の Cognito オーソライザーが検証したクレームを取り出す。
 *
 * オーソライザーは Lambda に到達する前にトークンの署名と有効期限を検証済み。
 * ここに値があるということは検証を通過しているので、再検証はしない。
 * 逆に言うと、この経路以外から来たリクエストのクレームは信用できない。
 */
const getClaimedUserId = (
  event: APIGatewayProxyEvent | undefined,
): string | undefined => {
  const claims = event?.requestContext?.authorizer?.claims;
  if (!claims) {
    return undefined;
  }
  // REST API のオーソライザーは claims をオブジェクトで渡すが、
  // 経路によっては JSON 文字列で載ることがあるため両方を許容する。
  const parsed: Record<string, unknown> =
    typeof claims === 'string' ? JSON.parse(claims) : claims;
  const sub = parsed.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : undefined;
};

/**
 * 認証コンテキストを組み立てるプラグイン。
 *
 * userId を解決できない場合は UNAUTHORIZED で弾く。
 * LOCAL_DEV が明示的に 'true' のときだけローカル用の固定 ID を使う。
 * 環境変数が未設定なら拒否する（フェイルクローズ）。本番で
 * オーソライザーの設定が外れた場合に素通りさせないための既定値。
 */
export const createAuthPlugin = () => {
  const t = initTRPC
    .context<
      IAuthContext &
        Partial<CreateAWSLambdaContextOptions<APIGatewayProxyEvent>>
    >()
    .create();

  return t.procedure.use(async (opts) => {
    const userId =
      process.env.LOCAL_DEV === 'true'
        ? LOCAL_DEV_USER_ID
        : getClaimedUserId(opts.ctx.event);

    if (!userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    return opts.next({
      ctx: {
        ...opts.ctx,
        userId,
      },
    });
  });
};
