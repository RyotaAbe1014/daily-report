import { AppRouter } from '@daily-report/api';
import { useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createContext, FC, PropsWithChildren, useMemo } from 'react';
import { useRuntimeConfig } from '../hooks/useRuntimeConfig';
import {
  TRPCClient,
  createTRPCClient,
  httpLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import { EventSourcePolyfill } from 'event-source-polyfill';
import { useAuth } from 'react-oidc-context';

export interface ApiTRPCContextValue {
  optionsProxy: ReturnType<typeof createTRPCOptionsProxy<AppRouter>>;
  client: TRPCClient<AppRouter>;
}

export const ApiTRPCContext = createContext<ApiTRPCContextValue | null>(null);

export const ApiClientProvider: FC<PropsWithChildren> = ({ children }) => {
  const queryClient = useQueryClient();
  const runtimeConfig = useRuntimeConfig();
  const apiUrl = runtimeConfig.apis.Api;
  const auth = useAuth();
  const user = auth?.user;

  const container = useMemo<ApiTRPCContextValue>(() => {
    const client = createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: apiUrl,
            EventSource: EventSourcePolyfill,
            eventSourceOptions: async ({ op }) => {
              return {
                headers: {
                  Authorization: `Bearer ${user?.access_token}`,
                },
              };
            },
          }),
          false: httpLink({
            url: apiUrl,
            headers: {
              Authorization: `Bearer ${user?.access_token}`,
            },
          }),
        }),
      ],
    });

    const optionsProxy = createTRPCOptionsProxy<AppRouter>({
      client,
      queryClient,
    });

    return { optionsProxy, client };
  }, [apiUrl, queryClient, user]);

  return (
    <ApiTRPCContext.Provider value={container}>
      {children}
    </ApiTRPCContext.Provider>
  );
};

export default ApiClientProvider;
