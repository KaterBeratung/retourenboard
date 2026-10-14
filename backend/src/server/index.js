import { resolve } from 'node:path';
import { createRuntime } from './runtime.js';
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT muss zwischen 1 und 65535 liegen.');
const runtime = createRuntime({
    dbPath: resolve(process.env.DB_PATH || 'data/retouren.sqlite'),
    automaticVersionCheck:true,
    secureCookies: process.env.SECURE_COOKIES === 'true', publicOrigin: process.env.PUBLIC_ORIGIN || '', port, host, production: process.env.NODE_ENV === 'production',
    trustedProxies:(process.env.TRUSTED_PROXIES||'').split(',').map(value=>value.trim()).filter(Boolean)
});
await runtime.start();
console.log(`retourenboard. läuft auf http://${host}:${runtime.current().server.address().port}`);
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => { await runtime.close(); process.exit(0); });
