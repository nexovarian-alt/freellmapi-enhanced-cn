# FreeLLMAPI Enhanced CN v1.1.0

This release focuses on stable delivery for ordinary users in China while preserving the official FreeLLMAPI architecture and UI layout.

## Added

- China network enhancement through `bootstrap-proxy.cjs`, `NODE_OPTIONS`, and `PROXY_URL`.
- Docker proxy defaults for Windows, macOS, NAS, and Linux.
- Provider diagnostics split into network, API, authentication, quota, and model status.
- Manual all-provider detection, post-save detection, three-strike authentication handling, and automatic recovery.

## Upgrade from v1.0.1

1. Keep the existing data volume/directory and the existing `ENCRYPTION_KEY`.
2. Pull image `ghcr.io/nexovarian-alt/freellmapi-enhanced-cn:v1.1.0`.
3. Add `NODE_OPTIONS=--require=/app/bootstrap-proxy.cjs` and, when needed, `PROXY_URL`.
4. Recreate only the application container. Do not delete the volume and do not run database initialization again.

The database migration is additive. Existing users, API keys, Provider settings, models, and routing configuration remain in place.

## Proxy examples

- Windows / macOS Docker Desktop: `PROXY_URL=http://host.docker.internal:7890`
- NAS / Linux: `PROXY_URL=http://192.168.1.2:7890` (replace with the proxy host LAN address)

The desktop proxy application must allow LAN connections. Never place provider API keys in logs, screenshots, or proxy URLs.
