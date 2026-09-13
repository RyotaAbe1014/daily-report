import { initTRPC, TRPCError } from '@trpc/server';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuthPlugin, LOCAL_DEV_USER_ID } from './auth.js';

/**
 * 認証プラグインだけを載せた最小のルーター。
 * 解決した userId をそのまま返すので、プラグインの出力を直接検査できる。
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

/** claims から組み立てた APIGatewayProxyEvent 相当の最小オブジェクト。 */
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

    // 経路によっては claims が JSON 文字列で載るため両方を許容している。
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
    // 本番でオーソライザーの設定が外れた場合に素通りさせないための既定値。
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

    // LOCAL_DEV は 'true' との完全一致でのみ有効。
    // '1' や 'false' で固定ユーザーに落ちてはいけない。
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

    // ローカルでは API Gateway を経由しないので、
    // たまたまクレームが載っていても固定ユーザーを優先する。
    it('prefers the fixed user over any claims present', async () => {
      process.env.LOCAL_DEV = 'true';
      await expect(
        callWithEvent(eventWithClaims({ sub: 'user-abc' })),
      ).resolves.toBe(LOCAL_DEV_USER_ID);
    });
  });
});
