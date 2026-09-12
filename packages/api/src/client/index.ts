import { createTRPCClient, httpLink, HTTPLinkOptions } from '@trpc/client';
import { AppRouter } from '../router.js';

export interface ApiClientConfig {
  readonly url: string;
  readonly token: string;
}

export const createApiClient = (config: ApiClientConfig) => {
  const linkOptions: HTTPLinkOptions<any> = {
    url: config.url,
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  };
  return createTRPCClient<AppRouter>({
    links: [httpLink(linkOptions)],
  });
};
