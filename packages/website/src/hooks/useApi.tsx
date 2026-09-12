import { useContext } from 'react';
import {
  ApiTRPCContext,
  type ApiTRPCContextValue,
} from '../components/ApiClientProvider';

export const useApi = (): ApiTRPCContextValue['optionsProxy'] => {
  const container = useContext(ApiTRPCContext);
  if (!container) {
    throw new Error('useApi must be used within ApiClientProvider');
  }
  return container.optionsProxy;
};

export const useApiClient = (): ApiTRPCContextValue['client'] => {
  const container = useContext(ApiTRPCContext);
  if (!container) {
    throw new Error('useApiClient must be used within ApiClientProvider');
  }
  return container.client;
};
