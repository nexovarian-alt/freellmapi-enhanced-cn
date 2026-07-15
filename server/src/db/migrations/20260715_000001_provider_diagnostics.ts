import type { Db } from '../types.js';

function hasColumn(db: Db, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

/**
 * Additive v1.1 diagnostics state. Existing key rows, encrypted credentials,
 * provider settings, and enabled flags are preserved exactly as-is.
 */
export function up(db: Db): void {
  if (!hasColumn(db, 'api_keys', 'auto_disabled')) {
    db.prepare('ALTER TABLE api_keys ADD COLUMN auto_disabled INTEGER NOT NULL DEFAULT 0').run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_diagnostics (
      key_id INTEGER PRIMARY KEY REFERENCES api_keys(id) ON DELETE CASCADE,
      network_status TEXT NOT NULL DEFAULT 'unknown',
      api_status TEXT NOT NULL DEFAULT 'unknown',
      auth_status TEXT NOT NULL DEFAULT 'unknown',
      quota_status TEXT NOT NULL DEFAULT 'unknown',
      model_status TEXT NOT NULL DEFAULT 'unknown',
      message TEXT NOT NULL DEFAULT '',
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function down(db: Db): void {
  db.prepare('DROP TABLE IF EXISTS provider_diagnostics').run();
  if (hasColumn(db, 'api_keys', 'auto_disabled')) {
    db.prepare('ALTER TABLE api_keys DROP COLUMN auto_disabled').run();
  }
}
