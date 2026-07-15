import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { checkKeyHealth, checkAllKeys } from '../services/health.js';
import { hasProvider } from '../providers/index.js';
import { getQuotaStateForKeys } from '../services/provider-quota.js';

export const healthRouter = Router();

// Get health status for all platforms
healthRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();

  const platforms = db.prepare(`
    SELECT
      platform,
      COUNT(*) as total_keys,
      SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as healthy_keys,
      SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as rate_limited_keys,
      SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END) as invalid_keys,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_keys,
      SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END) as unknown_keys,
      SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled_keys
    FROM api_keys
    GROUP BY platform
  `).all() as any[];

  const keys = db.prepare(`
    SELECT id, platform, label, status, enabled, created_at, last_checked_at
    FROM api_keys
    ORDER BY platform, created_at DESC
  `).all() as any[];

  const diagnostics = db.prepare(`
    SELECT key_id, network_status, api_status, auth_status, quota_status,
           model_status, message, consecutive_failures, checked_at
    FROM provider_diagnostics
  `).all() as any[];
  const diagnosticsByKey = new Map(diagnostics.map(d => [d.key_id, d]));

  res.json({
    platforms: platforms.map(p => ({
      platform: p.platform,
      hasProvider: hasProvider(p.platform),
      totalKeys: p.total_keys,
      healthyKeys: p.healthy_keys,
      rateLimitedKeys: p.rate_limited_keys,
      invalidKeys: p.invalid_keys,
      errorKeys: p.error_keys,
      unknownKeys: p.unknown_keys,
      enabledKeys: p.enabled_keys,
    })),
    keys: keys.map(k => {
      const d = diagnosticsByKey.get(k.id);
      return {
        id: k.id,
        platform: k.platform,
        label: k.label,
        status: k.status,
        enabled: k.enabled === 1,
        createdAt: k.created_at,
        lastCheckedAt: k.last_checked_at,
        diagnostic: d ? {
          keyId: k.id,
          network: d.network_status,
          api: d.api_status,
          auth: d.auth_status,
          quota: d.quota_status,
          model: d.model_status,
          message: d.message,
          consecutiveFailures: d.consecutive_failures,
          checkedAt: d.checked_at,
        } : undefined,
      };
    }),
    quotaStates: getQuotaStateForKeys(),
  });
});

// Check a specific key
healthRouter.post('/check/:keyId', async (req: Request, res: Response) => {
  const keyId = parseInt(req.params.keyId as string, 10);
  if (isNaN(keyId)) {
    res.status(400).json({ error: { message: 'Invalid key ID' } });
    return;
  }

  const status = await checkKeyHealth(keyId);
  const diagnostic = getDb().prepare(`
    SELECT network_status AS network, api_status AS api, auth_status AS auth,
           quota_status AS quota, model_status AS model, message,
           consecutive_failures AS consecutiveFailures, checked_at AS checkedAt
    FROM provider_diagnostics WHERE key_id = ?
  `).get(keyId);
  res.json({ keyId, status, diagnostic });
});

// Check all keys
healthRouter.post('/check-all', async (_req: Request, res: Response) => {
  await checkAllKeys();
  res.json({ success: true });
});
