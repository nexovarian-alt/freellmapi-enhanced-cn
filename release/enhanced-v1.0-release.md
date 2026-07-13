# FreeLLMAPI Enhanced v1.0 发布说明

- 发布版本：FreeLLMAPI Enhanced v1.0
- 发布状态：功能冻结，供最终打包使用
- 冻结时间：2026-07-13（Asia/Shanghai）

## 已合并的验证改动

- `server/src/lib/proxy.ts`：支持 `HTTP_PROXY`、`HTTPS_PROXY`，默认未配置代理时保持直连。
- `Dockerfile`：运行时包含服务端依赖，支持代理所需的 `undici`。
- `Dockerfile`：在 runtime 阶段提供 `undici`、`socks-proxy-agent` 根路径可见性，并在构建时执行 import 验证，依赖缺失会使构建失败。
- `server/src/providers/google.ts`：Google AI Studio 密钥健康检查超时调整为 30000ms，并记录 provider、超时和实际耗时。
- `README.md`：增加代理配置说明。
- `release/FreeLLMAPI-Enhanced-安装教程.html`：增加普通用户安装、Provider 配置及可选代理说明。
- `freellmapi-enhanced-installer/install-freellmapi.sh`：首次生成并持久化 `ENCRYPTION_KEY`，使用已有数据目录时复用原密钥。

## 保持不变

- Provider 架构
- Router 与 Fallback
- Catalog 与模型池
- 数据库结构

## 已验证平台

- Google AI Studio（HTTPS 代理环境健康检查成功）
- Groq（代理环境恢复健康）
- OpenRouter
- 百度千帆
- 阿里云百炼

## 安装包内容

- 官方 FreeLLMAPI 源码与 Enhanced 修改
- Dockerfile
- `docs/install.sh`
- `README.md`
- `release/FreeLLMAPI-Enhanced-安装教程.html`
- 本发布说明与冻结记录
- 独立安装器包（`install-freellmapi.sh`、manifest、patch 和 Catalog 文件）

## 安全说明

- 安装包不包含任何 API Key、Setup Code 或生产数据库。
- 安装时使用独立数据目录；升级前请备份数据卷。
- 本次封装不部署生产环境。
