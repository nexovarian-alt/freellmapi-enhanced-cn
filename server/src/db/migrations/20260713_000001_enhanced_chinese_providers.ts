import type { Db } from '../types.js';

/**
 * Enhanced Installer: seed Chinese domestic provider models.
 *
 * Baidu Qianfan (百度千帆) — ERNIE series
 * Aliyun Bailian (阿里云百炼/DashScope) — Qwen + DeepSeek series
 *
 * These are registered as LOCAL_MODEL_PROVIDERS so catalog-sync
 * never deletes them (the remote free-tier catalog does not include
 * Chinese domestic providers).
 */

// Models: [platform, model_id, display_name, intelligence, speed, size, rpm, rpd, tpm, tpd, budget, ctx, vision, tools]
export const ENHANCED_CATALOG_VERSION = 'enhanced-v1.0-frozen';

const MODELS: [string, string, string, number, number, string, number | null, number | null, number | null, number | null, string, number | null, number, number][] = [
  // Google AI Studio stable ID verified in the enhanced runtime
  ['google', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', 18, 3, 'Medium', 15, 20, 250000, null, '~3M', 1048576, 1, 1],
  // Baidu Qianfan
  ['baidu-qianfan', 'ernie-4.5-turbo-128k', 'ERNIE 4.5 Turbo 128K（千帆）', 2, 6, 'Large', 30, 500, 200000, 1000000, '~500K tokens/day', 131072, 1, 1],

  // Aliyun Bailian (DashScope compatible-mode)
  ['aliyun-bailian', 'qwen-plus', 'Qwen-Plus（百炼）', 2, 5, 'Medium', 60, 1000, null, null, 'Free tier', 131072, 0, 1],
  ['aliyun-bailian', 'qwen-flash', 'Qwen-Flash（百炼）', 3, 2, 'Medium', 100, 2000, null, null, 'Free tier', 131072, 1, 1],
  ['aliyun-bailian', 'deepseek-v3', 'DeepSeek-V3（百炼）', 2, 5, 'Large', 60, 1000, null, null, 'Free tier', 65536, 0, 1],
  ['aliyun-bailian', 'deepseek-r1', 'DeepSeek-R1（百炼）', 1, 7, 'Large', 30, 500, null, null, 'Free tier', 65536, 0, 1],
];

export function up(db: Db): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO models
      (platform, model_id, display_name, intelligence_rank, speed_rank, size_label,
       rpm_limit, rpd_limit, tpm_limit, tpd_limit, monthly_token_budget, context_window,
       enabled, supports_vision, supports_tools)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);

  const insertFallback = db.prepare(`
    INSERT OR IGNORE INTO fallback_config (model_db_id, priority, enabled)
    SELECT id, ?, 1 FROM models WHERE platform = ? AND model_id = ?
  `);

  const maxPriority = (db.prepare('SELECT COALESCE(MAX(priority), 0) AS mx FROM fallback_config').get() as { mx: number }).mx;

  db.transaction(() => {
    let priority = maxPriority + 1;
    for (const [platform, modelId, displayName, intel, speed, size, rpm, rpd, tpm, tpd, budget, ctx, vision, tools] of MODELS) {
      insert.run(platform, modelId, displayName, intel, speed, size, rpm, rpd, tpm, tpd, budget, ctx, vision, tools);
      insertFallback.run(priority, platform, modelId);
      priority++;
    }
  })();
}

export function down(db: Db): void {
  const deleteFallback = db.prepare(`
    DELETE FROM fallback_config
     WHERE model_db_id IN (SELECT id FROM models WHERE platform IN ('baidu-qianfan','aliyun-bailian'))
  `);
  const deleteModels = db.prepare("DELETE FROM models WHERE platform IN ('google','baidu-qianfan','aliyun-bailian') AND model_id IN ('gemini-3.1-flash-lite','ernie-4.5-turbo-128k','ernie-speed-128k','ernie-lite-128k','qwen-plus','qwen-turbo','qwen-long','qwen-max','qwen-flash','deepseek-v3','deepseek-r1')");
  db.transaction(() => {
    deleteFallback.run();
    deleteModels.run();
  })();
}
