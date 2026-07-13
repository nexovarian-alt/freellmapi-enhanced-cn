# FreeLLMAPI Enhanced CN v1.0.0

FreeLLMAPI Enhanced CN is an unofficial community enhancement based on [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi). It preserves the upstream MIT License and copyright notices and is intended for personal self-hosting, learning, and experimentation.

## Included

- Native Baidu Qianfan and Alibaba Bailian provider support.
- Enhanced OpenAI-compatible request handling.
- HTTP/HTTPS proxy support for restricted networks such as NAS deployments.
- Google AI Studio health-check timeout adjustment for proxied networks.
- Persistent `ENCRYPTION_KEY` handling across container recreation.
- Installer output for the access URL and first-run Setup Code.
- Frozen domestic model pool and catalog protection.

## Important notes

- The installer uses the fixed `v1.0.0` image tag, not `latest`.
- Provider quotas, pricing, availability, and terms are controlled by each provider.
- Configure `PROXY_URL` only when the host network requires an HTTP proxy. Do not publish API keys, Setup Codes, database files, or `.env` files.
- Back up the persistent data directory and encryption key before upgrades.

## License

See [LICENSE](../LICENSE) and [NOTICE.md](../NOTICE.md).
