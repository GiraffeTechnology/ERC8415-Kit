import type { ProjectionStore } from '../../engine/projection/store.ts';
import { ApiKeyStore } from '../../engine/ops/apiKeys.ts';
import { TenantRegistry } from '../../engine/ops/tenants.ts';
import { Metrics } from '../../engine/ops/metrics.ts';

export const gateway = (store: ProjectionStore) => {
  const tenants = new TenantRegistry();
  tenants.add('test', store);
  const keys = new ApiKeyStore({ now: () => 1n });
  const issued = keys.issue('test', 'test');
  return { options: { tenants, keys, metrics: new Metrics() }, issued,
    headers: { authorization: `Bearer ${issued.secret}` } };
};
