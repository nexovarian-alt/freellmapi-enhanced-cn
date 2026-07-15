'use strict';

// Loaded with NODE_OPTIONS before the application starts. This covers native
// fetch/undici calls made anywhere in the Node process, including future
// provider adapters that do not know about the application's proxy helper.
const proxyUrl = (process.env.PROXY_URL || '').trim();

if (proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('PROXY_URL must start with http:// or https://');
    }
    let undici;
    try {
      undici = require('undici');
    } catch (error) {
      // npm workspaces may keep the dependency under server/node_modules in a
      // source checkout; the production image also verifies/symlinks it.
      if (error && error.code === 'MODULE_NOT_FOUND') {
        undici = require('./server/node_modules/undici');
      } else {
        throw error;
      }
    }
    const { ProxyAgent, setGlobalDispatcher } = undici;
    setGlobalDispatcher(new ProxyAgent({ uri: proxyUrl }));
    const safeUrl = new URL(proxyUrl);
    if (safeUrl.username || safeUrl.password) {
      safeUrl.username = '***';
      safeUrl.password = '***';
    }
    console.log(`[proxy-bootstrap] Node outbound proxy enabled: ${safeUrl.toString()}`);
  } catch (error) {
    console.error(`[proxy-bootstrap] Invalid proxy configuration: ${error.message}`);
    process.exit(1);
  }
}
