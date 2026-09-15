import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from './QueryClientProvider';

/**
 * 既定のリトライ方針のテスト。
 *
 * 入力が不正で 400 が返る場面でも既定の 3 回リトライが働くと、画面には
 * 何も出ないまま数秒待たされたうえで同じ失敗に終わる。回復し得る失敗
 * だけ再試行することを固定する。
 */

/** tRPC のエラーを模した値。 */
const errorWithStatus = (httpStatus: number) =>
  Object.assign(new Error('failed'), { data: { httpStatus } });

const Probe = ({ fail }: { fail: () => Promise<unknown> }) => {
  const { isError } = useQuery({
    queryKey: ['probe'],
    queryFn: fail,
  });
  return <div>{isError ? 'error' : 'pending'}</div>;
};

const renderProbe = (fail: () => Promise<unknown>) =>
  render(
    <QueryClientProvider disableDevtools>
      <Probe fail={fail} />
    </QueryClientProvider>,
  );

describe('既定のリトライ方針', () => {
  it.each([400, 401, 403, 404, 409])('%i は投げ直さない', async (status) => {
    const fail = vi.fn().mockRejectedValue(errorWithStatus(status));
    renderProbe(fail);

    expect(await screen.findByText('error')).toBeDefined();
    expect(fail).toHaveBeenCalledTimes(1);
  });

  // 時間を置けば通る見込みがあるものは再試行する。
  it.each([408, 429, 500, 503])('%i は投げ直す', async (status) => {
    const fail = vi.fn().mockRejectedValue(errorWithStatus(status));
    renderProbe(fail);

    await waitFor(() => expect(fail.mock.calls.length).toBeGreaterThan(1), {
      timeout: 5000,
    });
  });

  it('ステータスが付かない失敗も投げ直す', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('network down'));
    renderProbe(fail);

    await waitFor(() => expect(fail.mock.calls.length).toBeGreaterThan(1), {
      timeout: 5000,
    });
  });
});
