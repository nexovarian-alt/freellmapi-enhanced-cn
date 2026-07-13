import type { Db } from '../types.js';

/** Domestic free-model pool state (data-only; no provider or router changes). */
export const ENHANCED_DOMESTIC_POOL_VERSION = 'enhanced-domestic-pool-20260713';

type ModelSeed = [string, string, string, number, number, number | null, number, number, boolean];

// [platform, model_id, display_name, intelligence_rank, speed_rank, context_window,
//  supports_vision, supports_tools, enabled]
const MODELS: ModelSeed[] = [
  ['baidu-qianfan', 'ernie-4.5-turbo-128k', 'ERNIE 4.5 Turbo 128K', 2, 6, 131072, 1, 1, true],
  ['baidu-qianfan', 'ernie-speed-128k', 'ERNIE Speed 128K', 3, 2, 131072, 0, 1, false],
  ['baidu-qianfan', 'ernie-lite-128k', 'ERNIE Lite 128K', 2, 3, 131072, 0, 1, false],
  ['baidu-qianfan', 'deepseek-v3.2', 'DeepSeek V3.2', 2, 5, 131072, 0, 1, false],
  ['aliyun-bailian', 'qwen-plus', 'Qwen Plus', 2, 2, 131072, 0, 1, true],
  ['aliyun-bailian', 'qwen-flash', 'Qwen Flash', 3, 1, 131072, 1, 1, true],
  ['aliyun-bailian', 'deepseek-v3', 'DeepSeek V3', 2, 3, 65536, 0, 1, true],
  ['aliyun-bailian', 'deepseek-r1', 'DeepSeek R1', 1, 8, 65536, 0, 1, true],
  ['aliyun-bailian', 'qwen-max', 'Qwen Max', 1, 6, 32768, 0, 1, true],
  ['aliyun-bailian', 'qwen-long', 'Qwen Long', 2, 6, 1000000, 0, 1, true],
  ['aliyun-bailian', 'deepseek-v3.1', 'DeepSeek V3.1', 2, 4, 131072, 0, 1, true],
  ['aliyun-bailian', 'qwen3-coder-plus', 'Qwen3 Coder Plus', 3, 4, 131072, 0, 1, true],
  ['aliyun-bailian', 'qwen3.5-plus', 'Qwen3.5 Plus', 3, 4, 131072, 0, 1, true],
  ['aliyun-bailian', 'qwen3.7-plus', 'Qwen3.7 Plus', 2, 5, 131072, 0, 1, true],
  ['aliyun-bailian', 'qwen-turbo', 'Qwen Turbo', 2, 3, 131072, 0, 1, false],
  ['aliyun-bailian', 'qwen3.7-max', 'Qwen3.7 Max', 1, 7, 131072, 0, 1, false],
];

export function up(db: Db): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO models
      (platform, model_id, display_name, intelligence_rank, speed_rank, size_label,
       monthly_token_budget, context_window, enabled, supports_vision, supports_tools)
    VALUES (?, ?, ?, ?, ?, 'Medium', 'Free tier', ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE models SET display_name = ?, intelligence_rank = ?, speed_rank = ?,
      context_window = ?, enabled = ?, supports_vision = ?, supports_tools = ?
    WHERE platform = ? AND model_id = ?
  `);

  db.transaction(() => {
    for (const [platform, modelId, displayName, intelligence, speed, context, vision, tools, enabled] of MODELS) {
      insert.run(platform, modelId, displayName, intelligence, speed, context, enabled ? 1 : 0, vision, tools);
      update.run(displayName, intelligence, speed, context, enabled ? 1 : 0, vision, tools, platform, modelId);
    }
  })();
}

export function down(_db: Db): void {
  // Intentionally non-destructive: pool records remain available for rollback/re-enable.
}
