import { initTRPC, TRPCError } from '@trpc/server';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthPlugin, LOCAL_DEV_USER_ID } from './auth.js';

/**
 * 認証プラグインのみを適用したテスト用の最小ルーター。
 * 解決された userId をそのまま返却するため、認証プラグインの出力結果を直接テストできます。
 */
const callWithEvent = async (event: unknown) => {
  const t = initTRPC.context<Record<string, unknown>>().create();
  const caller = t.router({
    whoami: t.procedure
      .concat(createAuthPlugin())
      .query(({ ctx }) => ctx.userId),
  });

  return caller.createCaller({ event } as never).whoami();
};

/** 指定した claims を含む、APIGatewayProxyEvent 相当のテスト用最小オブジェクトを作成します。 */
const eventWithClaims = (claims: unknown) =>
  ({
    requestContext: { authorizer: { claims } },
  }) as unknown as APIGatewayProxyEvent;

const expectUnauthorized = async (event: unknown) => {
  await expect(callWithEvent(event)).rejects.toSatisfy(
    (error: unknown) =>
      error instanceof TRPCError && error.code === 'UNAUTHORIZED',
  );
};

describe('createAuthPlugin', () => {
  const originalLocalDev = process.env.LOCAL_DEV;

  beforeEach(() => {
    delete process.env.LOCAL_DEV;
  });

  afterEach(() => {
    if (originalLocalDev === undefined) {
      delete process.env.LOCAL_DEV;
    } else {
      process.env.LOCAL_DEV = originalLocalDev;
    }
  });

  describe('with the API Gateway authorizer', () => {
    it('takes the sub claim when claims arrive as an object', async () => {
      await expect(
        callWithEvent(eventWithClaims({ sub: 'user-abc' })),
      ).resolves.toBe('user-abc');
    });

    // 連携経路や環境によって claims が JSON 文字列として渡されるケースがあるため、両方の形式に対応していることを検証する。
    it('takes the sub claim when claims arrive as a JSON string', async () => {
      await expect(
        callWithEvent(eventWithClaims(JSON.stringify({ sub: 'user-xyz' }))),
      ).resolves.toBe('user-xyz');
    });

    it('ignores other claims and uses only sub', async () => {
      await expect(
        callWithEvent(
          eventWithClaims({
            sub: 'user-abc',
            email: 'someone@example.com',
            'cognito:username': 'display-name',
          }),
        ),
      ).resolves.toBe('user-abc');
    });
  });

  describe('fails closed', () => {
    // 本番環境でオーソライザーの設定ミス等が発生した場合でも、不正アクセスを素通りさせないためのフェイルクローズ動作を検証する。
    it('rejects when LOCAL_DEV is unset and there are no claims', async () => {
      await expectUnauthorized({});
    });

    it('rejects when the event is missing entirely', async () => {
      await expectUnauthorized(undefined);
    });

    it('rejects when the authorizer is absent', async () => {
      await expectUnauthorized({ requestContext: {} });
    });

    it('rejects claims without a sub', async () => {
      await expectUnauthorized(eventWithClaims({ email: 'a@b.c' }));
    });

    it('rejects an empty sub', async () => {
      await expectUnauthorized(eventWithClaims({ sub: '' }));
    });

    it('rejects a non-string sub', async () => {
      await expectUnauthorized(eventWithClaims({ sub: 12345 }));
    });

    // LOCAL_DEV は文字列 'true' と完全一致する場合のみ有効とする。
    // '1' や大文字 'TRUE'、'false' などで誤ってローカル用固定ユーザーにフォールバックしないことを検証する。
    it.each(['1', 'false', 'TRUE', ''])(
      'rejects when LOCAL_DEV is %o rather than the exact string true',
      async (value) => {
        process.env.LOCAL_DEV = value;
        await expectUnauthorized({});
      },
    );
  });

  describe('in local development', () => {
    it('uses the fixed user when LOCAL_DEV is exactly true', async () => {
      process.env.LOCAL_DEV = 'true';
      await expect(callWithEvent({})).resolves.toBe(LOCAL_DEV_USER_ID);
    });

    // ローカル開発環境では API Gateway を経由しない前提のため、
    // 仮にイベント内にクレームが含まれていた場合でもローカル固定ユーザーを優先して適用する。
    it('prefers the fixed user over any claims present', async () => {
      process.env.LOCAL_DEV = 'true';
      await expect(
        callWithEvent(eventWithClaims({ sub: 'user-abc' })),
      ).resolves.toBe(LOCAL_DEV_USER_ID);
    });
  });
});
