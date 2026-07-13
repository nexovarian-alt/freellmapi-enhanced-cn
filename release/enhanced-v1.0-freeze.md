# FreeLLMAPI Enhanced v1.0 冻结记录

- 冻结时间：2026-07-13（Asia/Shanghai）
- 版本：FreeLLMAPI Enhanced v1.0

## Provider

- `baidu-qianfan`（百度千帆）
- `aliyun-bailian`（阿里云百炼）

## 国内模型池

### 百度千帆：启用

- `ernie-4.5-turbo-128k`

### 阿里云百炼：启用

- `qwen-flash`
- `qwen-plus`
- `deepseek-v3`
- `deepseek-v3.1`
- `deepseek-r1`
- `qwen-max`
- `qwen-long`
- `qwen3-coder-plus`
- `qwen3.5-plus`
- `qwen3.7-plus`

### 暂禁用但保留

- 百度：`ernie-speed-128k`、`ernie-lite-128k`、`deepseek-v3.2`
- 阿里：`qwen-turbo`、`qwen3.7-max`

暂禁用模型仅停止调度，不删除数据库记录；后续可在重新验证可用性后恢复启用。

## 已验证模型

- 百度：`ernie-4.5-turbo-128k`
- 阿里：`qwen-flash`、`qwen-plus`、`deepseek-v3`、`deepseek-r1`
- 阿里补测：`qwen-long`、`deepseek-v3.1`、`qwen3-coder-plus`、`qwen3.5-plus`
- 历史成功验证：`qwen-max`、`qwen3.7-plus`

## 后续升级规则

1. 不修改 Provider、Router、Fallback 核心逻辑。
2. 新模型必须先确认官方免费额度、兼容接口和真实调用结果。
3. 不可用或额度不明确的模型只设置为禁用，不删除记录。
4. 任何版本升级必须创建新的迁移和冻结记录，并使用全新测试数据卷验收。
