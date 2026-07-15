import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';

const providerState = vi.hoisted(() => ({ mode: 'healthy' as 'healthy' | 'invalid' | 'network' | 'quota' }));

vi.mock('../../providers/index.js', () => ({
  resolveProvider: () => ({
    keyless: false,
    validateKey: async () => {
      if (providerState.mode === 'healthy') return true;
      if (providerState.mode === 'invalid') return false;
      if (providerState.mode === 'quota') throw Object.assign(new Error('rate limited'), { status: 429 });
      throw new Error('connect timeout');
    },
  }),
}));

const { checkKeyHealth, checkAllKeys } = await import('../../services/health.js');

beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0'.repeat(64);
});

beforeEach(() => {
  providerState.mode = 'healthy';
  initDb(':memory:');
});

function seedKey(enabled = 1): number {
  const encrypted = encrypt('test-provider-key');
  const result = getDb().prepare(`
    INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled)
    VALUES ('groq', 'test', ?, ?, ?, 'unknown', ?)
  `).run(encrypted.encrypted, encrypted.iv, encrypted.authTag, enabled);
  return Number(result.lastInsertRowid);
}

function keyRow(id: number) {
  return getDb().prepare(
    'SELECT status, enabled, auto_disabled FROM api_keys WHERE id = ?',
  ).get(id) as { status: string; enabled: number; auto_disabled: number };
}

function diagnosticRow(id: number) {
  return getDb().prepare(
    'SELECT * FROM provider_diagnostics WHERE key_id = ?',
  ).get(id) as any;
}

describe('provider health diagnostics and recovery', () => {
  it('uses three confirmed authentication failures before auto-disabling', async () => {
    const id = seedKey();
    providerState.mode = 'invalid';

    expect(await checkKeyHealth(id)).toBe('error');
    expect(keyRow(id)).toMatchObject({ status: 'error', enabled: 1, auto_disabled: 0 });
    expect(await checkKeyHealth(id)).toBe('error');
    expect(keyRow(id)).toMatchObject({ status: 'error', enabled: 1, auto_disabled: 0 });
    expect(await checkKeyHealth(id)).toBe('invalid');
    expect(keyRow(id)).toMatchObject({ status: 'invalid', enabled: 0, auto_disabled: 1 });
    expect(diagnosticRow(id)).toMatchObject({
      network_status: 'normal', auth_status: 'failed', consecutive_failures: 3,
    });
  });

  it('automatically recovers only a system-disabled key', async () => {
    const id = seedKey();
    providerState.mode = 'invalid';
    await checkKeyHealth(id);
    await checkKeyHealth(id);
    await checkKeyHealth(id);

    providerState.mode = 'healthy';
    await checkAllKeys();
    expect(keyRow(id)).toMatchObject({ status: 'healthy', enabled: 1, auto_disabled: 0 });
    expect(diagnosticRow(id).consecutive_failures).toBe(0);
  });

  it('does not enable a key that the user disabled', async () => {
    const id = seedKey(0);
    providerState.mode = 'healthy';
    await checkKeyHealth(id);
    expect(keyRow(id)).toMatchObject({ status: 'healthy', enabled: 0, auto_disabled: 0 });
  });

  it('reports transport failure without auto-disabling the key', async () => {
    const id = seedKey();
    providerState.mode = 'network';
    await checkKeyHealth(id);
    await checkKeyHealth(id);
    await checkKeyHealth(id);
    expect(keyRow(id)).toMatchObject({ status: 'error', enabled: 1, auto_disabled: 0 });
    expect(diagnosticRow(id)).toMatchObject({
      network_status: 'error', auth_status: 'unknown', consecutive_failures: 3,
    });
  });

  it('separates quota exhaustion from invalid authentication', async () => {
    const id = seedKey();
    providerState.mode = 'quota';
    expect(await checkKeyHealth(id)).toBe('rate_limited');
    expect(keyRow(id)).toMatchObject({ status: 'rate_limited', enabled: 1, auto_disabled: 0 });
    expect(diagnosticRow(id)).toMatchObject({
      network_status: 'normal', auth_status: 'normal', quota_status: 'insufficient',
    });
  });
});
