import { initTRPC, TRPCError } from '@trpc/server';
import { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface IAuthContext {
  /**
   * 認証済みユーザーの一意識別子（Cognito の `sub` クレーム値）。
   *
   * ユーザープール内で一意かつ不変であることが保証されているため、DynamoDB のパーティションキーとして使用します。
   * ※ メールアドレスやユーザー名は変更される可能性があるため、識別キーとしては使用しません。
   */
  userId?: string;
}

/**
 * ローカル開発環境で使用するモック用固定ユーザー ID。
 * API Gateway を経由しないローカル環境では認証クレームが存在しないために使用します。
 */
export const LOCAL_DEV_USER_ID = 'local-dev-user';

/**
 * API Gateway の Cognito オーソライザーによって検証済みのクレームからユーザー ID を抽出します。
 *
 * オーソライザーが Lambda 実行前にトークンの署名と有効期限を検証しているため、
 * ここにクレームが存在する場合は検証済みとみなして再検証は行いません。
 * （逆に言えば、オーソライザーを経由しないリクエストのクレームは信用できません）
 */
const getClaimedUserId = (
  event: APIGatewayProxyEvent | undefined,
): string | undefined => {
  const claims = event?.requestContext?.authorizer?.claims;
  if (!claims) {
    return undefined;
  }
  // REST API のオーソライザーは claims をオブジェクトとして渡しますが、
  // 設定やテスト経路によっては JSON 文字列として渡される場合があるため、両方の形式に対応します。
  const parsed: Record<string, unknown> =
    typeof claims === 'string' ? JSON.parse(claims) : claims;
  const sub = parsed.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : undefined;
};

/**
 * リクエストコンテキストに認証情報（userId）を設定・検証するプラグイン。
 *
 * userId を解決できないリクエストは UNAUTHORIZED エラーとして遮断します。
 * 環境変数 LOCAL_DEV が厳密に 'true' の場合のみローカル用の固定 ID を許可します。
 * 環境変数等の設定漏れ時にはデフォルトで拒否するフェイルクローズ（安全側に倒す）設計としています。
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
