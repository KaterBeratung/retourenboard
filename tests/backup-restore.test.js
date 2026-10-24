import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runtimeFixture } from './helpers/runtime.js';
import { enableMfa, appCode } from './helpers/mfa.js';
import {appFromPrepared} from './helpers/backup-data.js';
import { create as archive } from '../dist/vendor/archive.js';
const restore = await import('../scripts/restore-backup.mjs').catch(() => ({}));
test('offline restore preserves accounts attachments and MFA with a separately supplied key', async (t) => {
    assert.equal(typeof restore.restoreBackup, 'function');
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup(), mfa = await enableMfa(f, auth, now), meta = await f.app.backups.create({ id: null, name: 'Test', source: 'system' }, 'manual');
    const target = join(f.dataDir, 'restored');
    await restore.restoreBackup({ archive: join(f.dataDir, 'backups', meta.filename), target, databaseConfig:f.databaseConfig, mfaKey: f.app.secrets.path('mfa') });
    const app=await appFromPrepared(t,target,{now:()=>now});
    try {
        now += 30000;
        const challenge = await app.auth.login({ username: 'Admin', password: 'Testkonto-Passwort!' }, 'test');
        assert.equal(challenge.mfaRequired, true);
        const login = await app.mfa.verifyChallenge(challenge.challengeId, appCode(mfa.secret, now), 'test');
        assert.ok((await app.auth.startSession(login.userId, { mfaVerified: true })).token);
    }
    finally {
        await app.close();
    }
    await assert.rejects(() => restore.restoreBackup({ archive: join(f.dataDir, 'backups', meta.filename), target,databaseConfig:f.databaseConfig }), /leer/);
});
test('restore rejects links and corrupt hashes before using an archive', async (t) => {
    assert.equal(typeof restore.restoreBackup, 'function');
    const f = await runtimeFixture(t), bad = join(f.dataDir, 'bad');
    mkdirSync(bad);
    writeFileSync(join(bad, 'retouren.sqlite'), 'bad');
    writeFileSync(join(bad, 'manifest.json'), JSON.stringify({ format: 1, database: 'retouren.sqlite', files: [{ path: 'retouren.sqlite', size: 3, sha256: '0'.repeat(64) }] }));
    const file = join(f.dataDir, 'bad.tar.gz');
    await archive({ cwd: bad, file, gzip: true }, ['manifest.json', 'retouren.sqlite']);
    await assert.rejects(() => restore.restoreBackup({ archive: file, target: join(f.dataDir, 'bad-target') }), /Prüfsumme/);
    writeFileSync(join(bad, 'manifest.json'), JSON.stringify({ format: 1, files: [{ path: '../outside', size: 0, sha256: '0'.repeat(64) }] }));
    await archive({ cwd: bad, file, gzip: true }, ['manifest.json']);
    await assert.rejects(() => restore.restoreBackup({ archive: file, target: join(f.dataDir, 'other-target') }));
});
