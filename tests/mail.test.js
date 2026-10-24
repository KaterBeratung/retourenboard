import test from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { runtimeFixture } from './helpers/runtime.js';
import { smtpFixture, ca } from './helpers/smtp-server.js';
import { createTransport } from '../dist/vendor/smtp.js';
const module = await import('../dist/server/mail.js').catch(() => ({}));
test('mail remains off until configured and stores passwords outside the database', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup();
    const status = await f.request('/api/admin/notifications', 'GET', undefined, auth);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).passwordConfigured, false);
    const saved = await f.request('/api/admin/notifications', 'PUT', { emailEnabled: true, smtpHost: 'localhost', smtpPort: 465, smtpMode: 'tls', smtpUser: 'test', password: 'Fixture-only-secret', from: 'board@example.test', recipients: ['admin@example.test'] }, auth);
    assert.equal(saved.status, 200);
    const data = await saved.json();
    assert.equal(data.passwordConfigured, true);
    assert.equal(JSON.stringify(data).includes('Fixture-only-secret'), false);
    assert.equal(JSON.stringify((await f.app.store.db.query("SELECT * FROM app_preferences", [])).rows).includes('Fixture-only-secret'), false);
    assert.equal(JSON.stringify((await f.app.store.db.query("SELECT * FROM audit", [])).rows).includes('Fixture-only-secret'), false);
});
test('real local SMTP requires trusted TLS and rejects a server without STARTTLS', async (t) => {
    const f = await runtimeFixture(t), { auth } = await f.setup(), tls = await smtpFixture(t);
    await f.request('/api/admin/notifications', 'PUT', { emailEnabled: true, smtpHost: '127.0.0.1', smtpPort: tls.port, smtpMode: 'tls', from: 'board@example.test', recipients: ['one@example.test', 'two@example.test'] }, auth);
    const trusted = module.createMail({ store: f.app.store, secrets: f.app.secrets, dataDir: f.dataDir, preferences: f.app.preferences, clock: { now: Date.now }, transportFactory: opts => createTransport({ ...opts, tls: { ...opts.tls, ca } }) });
    await trusted.test();
    assert.equal(tls.messages.length, 1);
    assert.equal(tls.messages[0].includes('Bcc:'), false);
    assert.equal(tls.messages[0].includes('two@example.test'), false);
    const plain = await smtpFixture(t, { tls: false });
    await f.request('/api/admin/notifications', 'PUT', { smtpPort: plain.port, smtpMode: 'starttls' }, auth);
    await assert.rejects(() => trusted.test(), e => e.status === 503);
    assert.equal(plain.messages.length, 0);
    await trusted.close();
});
test('expired fifth delivery lease fails safely after a worker restart', async (t) => {
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    await f.request('/api/admin/notifications', 'PUT', { emailEnabled: true, smtpHost: 'localhost', smtpPort: 465, smtpMode: 'tls', from: 'board@example.test', recipients: ['admin@example.test'] }, auth);
    await f.app.mail.enqueue({ id: 'interrupted', type: 'newReturn', title: 'Test', message: 'RET' });
    await f.app.store.db.query("UPDATE mail_outbox SET state='sending',attempts=5,leaseUntil=$1 WHERE eventKey='interrupted'", [now - 1]);
    await f.app.mail.tick();
    assert.equal((await f.app.store.db.query("SELECT state FROM mail_outbox WHERE eventKey='interrupted'", [])).rows[0].state, 'failed');
});
test('persistent mail queue retries with TLS required and hides recipient addresses', async (t) => {
    assert.equal(typeof module.createMail, 'function');
    let now = 1791374400000;
    const f = await runtimeFixture(t, { now: () => now }), { auth } = await f.setup();
    await f.request('/api/admin/notifications', 'PUT', { emailEnabled: true, smtpHost: 'localhost', smtpPort: 587, smtpMode: 'starttls', from: 'board@example.test', recipients: ['one@example.test', 'two@example.test'] }, auth);
    const messages = [], options = [];
    let fail = true;
    const mail = module.createMail({ store: f.app.store, secrets: f.app.secrets, dataDir: f.dataDir, preferences: f.app.preferences, clock: { now: () => now }, transportFactory: opts => {
            options.push(opts);
            return { sendMail: async (message) => {
                    messages.push(message);
                    if (fail)
                        throw new Error('Fixture-only-secret');
                    return { accepted: message.bcc };
                }, close() { } };
        } });
    await mail.enqueue({ id: 'event-1', type: 'newReturn', title: 'Neue Retoure', message: 'RET-1' });
    await mail.tick();
    let row = (await f.app.store.db.query("SELECT * FROM mail_outbox WHERE eventKey=$1", ['event-1'])).rows[0];
    assert.equal(row.state, 'pending');
    assert.equal(row.attempts, 1);
    assert.equal(row.nextAt, now + 60000);
    assert.equal(row.lastError.includes('Fixture-only-secret'), false);
    assert.equal(options[0].requireTLS, true);
    assert.equal(options[0].tls.rejectUnauthorized, true);
    assert.equal(messages[0].to, undefined);
    assert.deepEqual(messages[0].bcc, ['one@example.test', 'two@example.test']);
    now += 60000;
    fail = false;
    await mail.tick();
    row = (await f.app.store.db.query("SELECT * FROM mail_outbox WHERE eventKey=$1", ['event-1'])).rows[0];
    assert.equal(row.state, 'sent');
    await mail.close();
});
