import { getDb } from '../db/index.js';
import { resolveProvider } from '../providers/index.js';
import { decrypt } from '../lib/crypto.js';
import type { Platform, KeyStatus, ProviderDiagnostic, DiagnosticStatus } from '@freellmapi/shared/types.js';
import { inferQuotaPoolKey } from './provider-quota.js';
import type { Scheduler } from '../lib/scheduler.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const CONSECUTIVE_AUTH_FAILURES_TO_DISABLE = 3;

type DiagnosticWrite = Omit<ProviderDiagnostic, 'keyId' | 'checkedAt'>;

function diagnosticMessage(platform: string, kind: 'healthy' | 'network' | 'auth' | 'quota' | 'provider' | 'missing'): string {
  if (kind === 'healthy') return `${platform} 连接、认证和模型检测正常。`;
  if (kind === 'network') return `${platform} 当前无法连接。请检查代理是否已启动，以及 PROXY_URL 是否可从容器访问。`;
  if (kind === 'auth') return `${platform} 认证失败。请确认 API Key 后重新检测；系统不会因单次失败立即停用。`;
  if (kind === 'quota') return `${platform} 当前额度不足或请求过于频繁，请稍后重新检测。`;
  if (kind === 'missing') return `${platform} 未检测到 API Key，请重新填写 API Key。`;
  return `${platform} 服务已响应，但本次模型检测异常。建议稍后立即重新检测。`;
}

function readFailureCount(keyId: number): number {
  const row = getDb().prepare(
    'SELECT consecutive_failures FROM provider_diagnostics WHERE key_id = ?',
  ).get(keyId) as { consecutive_failures: number } | undefined;
  return row?.consecutive_failures ?? 0;
}

function writeDiagnostic(keyId: number, value: DiagnosticWrite): void {
  getDb().prepare(`
    INSERT INTO provider_diagnostics (
      key_id, network_status, api_status, auth_status, quota_status,
      model_status, message, consecutive_failures, checked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key_id) DO UPDATE SET
      network_status = excluded.network_status,
      api_status = excluded.api_status,
      auth_status = excluded.auth_status,
      quota_status = excluded.quota_status,
      model_status = excluded.model_status,
      message = excluded.message,
      consecutive_failures = excluded.consecutive_failures,
      checked_at = excluded.checked_at
  `).run(
    keyId, value.network, value.api, value.auth, value.quota,
    value.model, value.message, value.consecutiveFailures,
  );
}

function updateKeyStatus(keyId: number, status: KeyStatus): void {
  getDb().prepare("UPDATE api_keys SET status = ?, last_checked_at = datetime('now') WHERE id = ?")
    .run(status, keyId);
}

function recoverAutoDisabledKey(keyId: number): boolean {
  const result = getDb().prepare(
    'UPDATE api_keys SET enabled = 1, auto_disabled = 0 WHERE id = ? AND auto_disabled = 1',
  ).run(keyId);
  if (result.changes > 0) console.log(`[Health] Auto-recovered key ${keyId} after a successful check`);
  return result.changes > 0;
}

function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const value = (err as { status?: unknown }).status;
  return typeof value === 'number' ? value : undefined;
}

export async function checkKeyHealth(keyId: number): Promise<KeyStatus> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId) as any;
  if (!row) return 'error';

  const provider = resolveProvider(row.platform as Platform, row.base_url);
  if (!provider) {
    const failures = readFailureCount(keyId) + 1;
    updateKeyStatus(keyId, 'error');
    writeDiagnostic(keyId, {
      network: 'unknown', api: 'error', auth: 'unknown', quota: 'unknown', model: 'error',
      message: diagnosticMessage(row.platform, 'provider'), consecutiveFailures: failures,
    });
    return 'error';
  }

  try {
    const apiKey = decrypt(row.encrypted_key, row.iv, row.auth_tag);
    if (!provider.keyless && !apiKey.trim()) {
      const failures = readFailureCount(keyId) + 1;
      updateKeyStatus(keyId, failures >= CONSECUTIVE_AUTH_FAILURES_TO_DISABLE ? 'invalid' : 'error');
      writeDiagnostic(keyId, {
        network: 'unknown', api: 'error', auth: 'failed', quota: 'unknown', model: 'unknown',
        message: diagnosticMessage(row.platform, 'missing'), consecutiveFailures: failures,
      });
      return failures >= CONSECUTIVE_AUTH_FAILURES_TO_DISABLE ? 'invalid' : 'error';
    }

    const isValid = await provider.validateKey(apiKey, {
      platform: row.platform as Platform,
      keyId,
      quotaPoolKey: inferQuotaPoolKey(row.platform as Platform, null),
      endpoint: 'models',
      origin: 'health',
    });

    if (isValid) {
      updateKeyStatus(keyId, 'healthy');
      recoverAutoDisabledKey(keyId);
      writeDiagnostic(keyId, {
        network: 'normal', api: 'normal', auth: 'normal', quota: 'normal', model: 'normal',
        message: diagnosticMessage(row.platform, 'healthy'), consecutiveFailures: 0,
      });
      return 'healthy';
    }

    const failures = readFailureCount(keyId) + 1;
    const confirmedInvalid = failures >= CONSECUTIVE_AUTH_FAILURES_TO_DISABLE;
    const status: KeyStatus = confirmedInvalid ? 'invalid' : 'error';
    updateKeyStatus(keyId, status);
    writeDiagnostic(keyId, {
      network: 'normal', api: 'error', auth: 'failed', quota: 'unknown', model: 'unknown',
      message: diagnosticMessage(row.platform, 'auth'), consecutiveFailures: failures,
    });

    if (confirmedInvalid && row.enabled === 1) {
      db.prepare('UPDATE api_keys SET enabled = 0, auto_disabled = 1 WHERE id = ?').run(keyId);
      console.log(`[Health] Auto-disabled key ${keyId} after ${failures} consecutive confirmed authentication failures`);
    }
    return status;
  } catch (err: any) {
    const statusCode = errorStatus(err);
    const previousFailures = readFailureCount(keyId);

    if (statusCode === 429) {
      updateKeyStatus(keyId, 'rate_limited');
      recoverAutoDisabledKey(keyId);
      writeDiagnostic(keyId, {
        network: 'normal', api: 'error', auth: 'normal', quota: 'insufficient', model: 'unknown',
        message: diagnosticMessage(row.platform, 'quota'), consecutiveFailures: 0,
      });
      return 'rate_limited';
    }

    const failures = previousFailures + 1;
    const network: DiagnosticStatus = statusCode === undefined ? 'error' : 'normal';
    console.error(
      `[Health] Key ${keyId} (${row.platform}, base=${row.base_url ?? 'default'}) ` +
      `transport error: ${err.message}`,
    );
    updateKeyStatus(keyId, 'error');
    writeDiagnostic(keyId, {
      network,
      api: 'error',
      auth: 'unknown',
      quota: 'unknown',
      model: statusCode === undefined ? 'unknown' : 'error',
      message: diagnosticMessage(row.platform, statusCode === undefined ? 'network' : 'provider'),
      consecutiveFailures: failures,
    });
    return 'error';
  }
}

let checkAllInFlight: Promise<void> | null = null;

export function checkAllKeys(): Promise<void> {
  if (checkAllInFlight) return checkAllInFlight;
  checkAllInFlight = (async () => {
    const db = getDb();
    // Include only keys that are active or were disabled by the health checker.
    // User-disabled keys remain untouched; auto-disabled keys keep getting probes
    // so a corrected key/network can recover without re-adding credentials.
    const keys = db.prepare(
      'SELECT id, platform FROM api_keys WHERE enabled = 1 OR auto_disabled = 1',
    ).all() as { id: number; platform: string }[];

    console.log(`[Health] Checking ${keys.length} keys...`);
    for (const key of keys) await checkKeyHealth(key.id);
    console.log('[Health] Check complete.');
  })().finally(() => {
    checkAllInFlight = null;
  });
  return checkAllInFlight;
}

let cancelHealthCheck: (() => void) | null = null;

export function startHealthChecker(scheduler: Scheduler): void {
  if (cancelHealthCheck) return;
  console.log(`[Health] Starting health checker (every ${CHECK_INTERVAL_MS / 1000}s)`);
  cancelHealthCheck = scheduler.every(CHECK_INTERVAL_MS, () =>
    checkAllKeys().catch(err => console.error('[Health] Check failed:', err)),
  );
}

export function stopHealthChecker(): void {
  if (cancelHealthCheck) {
    cancelHealthCheck();
    cancelHealthCheck = null;
  }
}
