import { test } from './helpers/postgres-context.js';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './helpers/postgres-fixtures.js';
async function repository(store) { const { createUsers } = await import('../server/users.js'); return createUsers(store); }
const adminInput = { username: 'Chef', displayName: 'Administrator', password: 'Sicheres-Testpasswort!' };
test('first administrator is atomic and never opens again', async () => {
    const store = await createStore(':memory:');
    try {
        const users = await repository(store);
        assert.equal(await users.setupRequired(), true);
        const results = await Promise.allSettled([users.createFirst(adminInput), users.createFirst({ ...adminInput, username: 'Chef2' })]);
        assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
        assert.equal((await users.list()).length, 1);
        assert.equal((await users.list())[0].role, 'admin');
        assert.equal(await users.setupRequired(), false);
        await assert.rejects(async () => users.createFirst({ ...adminInput, username: 'Chef3' }));
    }
    finally {
        store.close();
    }
});
test('usernames are unique and profiles never contain credentials', async () => {
    const store = await createStore(':memory:');
    try {
        const users = await repository(store);
        await users.createFirst(adminInput);
        await assert.rejects(async () => users.create({ ...adminInput, username: ' cHeF ' }));
        const p = await users.create({ ...adminInput, username: 'Mitarbeiter', role: 'member' });
        assert.equal(p.role, 'member');
        assert.equal(p.passwordHash, undefined);
        assert.equal(p.passwordSalt, undefined);
        assert.equal(p.authVersion, undefined);
        const a = await users.credentialsByName('CHEF'), b = await users.credentialsByName('mitarbeiter');
        assert.notEqual(a.passwordHash, b.passwordHash);
        assert.notEqual(a.passwordSalt, b.passwordSalt);
        assert.equal(JSON.stringify(await users.list()).includes('passwordHash'), false);
        await assert.rejects(async () => users.create({ ...adminInput, username: 'abc', role: 'superadmin' }));
        await assert.rejects(async () => users.create({ ...adminInput, username: 'abc', password: 'zu kurz' }));
    }
    finally {
        store.close();
    }
});
test('last active admin survives deactivation and simultaneous demotions', async () => {
    const store = await createStore(':memory:');
    try {
        const users = await repository(store), a = await users.createFirst(adminInput);
        await assert.rejects(async () => users.update(a.id, { active: false }));
        await assert.rejects(async () => users.update(a.id, { role: 'member' }));
        const b = await users.create({ ...adminInput, username: 'ZweiterAdmin', role: 'admin' });
        const results = await Promise.allSettled([users.update(a.id, { role: 'member', password: 'Neues-Testpasswort1!' }), users.update(b.id, { role: 'member', password: 'Neues-Testpasswort2!' })]);
        assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
        assert.equal((await users.list()).filter(u => u.active && u.role === 'admin').length, 1);
    }
    finally {
        store.close();
    }
});
test('password changes verify old password, invalidate sessions and persist after reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'retouren-users-')), file = join(dir, 'users.sqlite');
    let store = await createStore(file);
    try {
        let users = await repository(store);
        const a = await users.createFirst(adminInput), before = await users.credentialsById(a.id);
        await assert.rejects(async () => users.changePassword(a.id, 'Falsch', 'Neues-Testpasswort!'));
        await users.changePassword(a.id, adminInput.password, 'Neues-Testpasswort!');
        const after = await users.credentialsById(a.id);
        assert.equal(after.authVersion, before.authVersion + 1);
        assert.notEqual(after.passwordHash, before.passwordHash);
        store.close();
        store = await createStore(file);
        users = await repository(store);
        assert.equal(await users.setupRequired(), false);
        assert.equal((await users.credentialsById(a.id)).passwordHash, after.passwordHash);
        const { verifyPassword } = await import('../server/users.js');
        assert.equal(await verifyPassword('Neues-Testpasswort!', await users.credentialsById(a.id)), true);
    }
    finally {
        store.close();
        rmSync(dir, { recursive: true, force: true });
    }
});
