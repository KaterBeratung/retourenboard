import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { InputError } from '../shared/model.js';
import { capabilities } from './permissions.js';
import { permissionsFor, hasPermission, PERMISSION_KEYS, LEGACY_PERMISSION_GROUPS } from '../shared/permissions.js';
const derive = promisify(scrypt);
function validPassword(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 256)
        throw new InputError('Passwort muss zwischen 12 und 256 Zeichen enthalten.');
    return value;
}
async function hashPassword(password) { const passwordSalt = randomBytes(32).toString('hex'); return { passwordSalt, passwordHash: (await derive(validPassword(password), passwordSalt, 64)).toString('hex') }; }
export async function verifyPassword(password, credentials) {
    if (typeof password !== 'string' || password.length > 256)
        return false;
    const actual = (await derive(password, credentials.passwordSalt, 64)), expected = Buffer.from(credentials.passwordHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function profile(row) { return row ? { id: row.id, username: row.username, displayName: row.displayName, role: row.role, active: !!row.active, createdAt: row.createdAt, updatedAt: row.updatedAt, permissions: { delete: !!row.canDelete, import: !!row.canImport, export: !!row.canExport, ...permissionsFor(row) }, capabilities: capabilities(row) } : null; }
function fields(input, old = null) {
    if (typeof input.username !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(input.username.trim()))
        throw new InputError('Benutzername: 3–64 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.');
    const displayName = input.displayName ?? '';
    if (typeof displayName !== 'string' || displayName.length > 100)
        throw new InputError('Anzeigename: maximal 100 Zeichen.');
    const role = input.role ?? 'member', active = input.active ?? true;
    if (!['admin', 'member', 'viewer'].includes(role))
        throw new InputError('Ungültige Rolle.');
    if (typeof active !== 'boolean')
        throw new InputError('Ungültiger Aktivstatus.');
    const username = input.username.trim();
    const permissions = Object.hasOwn(input, 'permissions') ? input.permissions : {};
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions) || Object.entries(permissions).some(([key, value]) => !PERMISSION_KEYS.includes(key) && !Object.hasOwn(LEGACY_PERMISSION_GROUPS, key) || typeof value !== 'boolean'))
        throw new InputError('Ungültige Berechtigungen.');
    const flags = {};
    for (const [key, column] of [['delete', 'canDelete'], ['import', 'canImport'], ['export', 'canExport']]) {
        const value = permissions[key] ?? (old && old.role === role ? !!old[column] : role !== 'viewer');
        if (typeof value !== 'boolean')
            throw new InputError('Ungültige Berechtigungen.');
        flags[column] = Number(role === 'admin' || (role === 'viewer' && key !== 'export' ? false : value));
    }
    const rights = permissionsFor(old && old.role === role ? old : { role, ...flags });
    for (const [alias, keys] of Object.entries(LEGACY_PERMISSION_GROUPS))
        if (Object.hasOwn(permissions, alias))
            for (const key of keys)
                rights[key] = permissions[alias];
    for (const key of PERMISSION_KEYS)
        if (Object.hasOwn(permissions, key))
            rights[key] = permissions[key];
    const normalized = permissionsFor({ role, permissions: rights });
    return { username, usernameKey: username.toLowerCase(), displayName: displayName.trim() || username, role, active, ...flags, permissionOverrides: JSON.stringify(normalized) };
}
export function createUsers(store) {
    const db = store.db;
    const credentialsById = async (id) => (await db.query("SELECT * FROM users WHERE id=$1 AND deletedAt IS NULL", [id])).rows[0] ?? null;
    const setupRequired = async () => (await db.query("SELECT COUNT(*) AS total FROM users WHERE deletedAt IS NULL", [])).rows[0].total === 0;
    async function transaction(callback) {
        try {
            return await store.transaction(async () => {
                await db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':accounts',0))");
                return callback();
            });
        }
        catch (error) {
            if (error.code === '23505')
                throw new InputError('Dieser Benutzername ist bereits vergeben.', 409);
            throw error;
        }
    }
    async function missing(id) {
        const old = await credentialsById(id);
        if (!old)
            throw new InputError('Konto nicht gefunden.', 404);
        return old;
    }
    async function create(input, first = false, beforeCommit = () => { }) {
        const value = fields(first ? { ...input, role: 'admin', active: true } : input), hash = await hashPassword(input.password);
        return transaction(async () => {
            await beforeCommit();
            if (first && !await setupRequired())
                throw new InputError('Die Ersteinrichtung ist bereits abgeschlossen.', 409);
            if (!first && await setupRequired())
                throw new InputError('Bitte zuerst den Administrator einrichten.');
            const now = new Date().toISOString();
            const r = await db.query("INSERT INTO users(username,usernameKey,displayName,role,active,passwordHash,passwordSalt,createdAt,updatedAt,canDelete,canImport,canExport,permissionOverrides) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id", [value.username, value.usernameKey, value.displayName, value.role, Number(value.active), hash.passwordHash, hash.passwordSalt, now, now, value.canDelete, value.canImport, value.canExport, value.permissionOverrides]);
            const after = profile(await credentialsById(Number(r.rows[0].id)));
            await store.recordChange?.({ entity: 'users', id: after.id, action: 'create', after });
            return after;
        });
    }
    return {
        setupRequired, credentialsById,
        credentialsByName: async (name) => typeof name === 'string' ? (await db.query("SELECT * FROM users WHERE usernameKey=$1 AND deletedAt IS NULL", [name.trim().toLowerCase()])).rows[0] ?? null : null,
        get: async (id) => profile(await credentialsById(id)), list: async () => (await db.query("SELECT * FROM users WHERE deletedAt IS NULL ORDER BY active DESC,usernameKey,id", [])).rows.map(row => profile(row)),
        createFirst: (input) => create(input, true), create: (input, beforeCommit) => create(input, false, beforeCommit),
        remove(id, actorId, beforeCommit = () => { }) {
            return transaction(async () => {
                await beforeCommit();
                const actor = await credentialsById(actorId), old = await missing(id);
                if (!actor?.active || actor.role !== 'admin')
                    throw new InputError('Diese Funktion ist nur für Administratoren verfügbar.', 403);
                if (old.active && old.role === 'admin' && Number((await db.query("SELECT COUNT(*) AS total FROM users WHERE active=1 AND role='admin' AND deletedAt IS NULL", [])).rows[0].total) <= 1)
                    throw new InputError('Mindestens ein aktiver Administrator muss erhalten bleiben.');
                if (id === actorId)
                    throw new InputError('Dein eigenes Konto kann nicht gelöscht werden.');
                const now = new Date().toISOString(), table = async (name) => !!(await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1", [name])).rows[0];
                // Keep business records and author foreign keys. The retained ID
                // cannot authenticate and never appears as a selectable account.
                for (const row of (await db.query("SELECT id FROM returns WHERE assignedUserId=$1", [id])).rows) {
                    await checkRecordRevision(db,'returns',row.id);
                    const before = await store.getReturn(row.id);
                    await db.query("UPDATE returns SET assignedUserId=NULL,assignedDisplayName='',updatedAt=$1 WHERE id=$2", [now, row.id]);
                    await advanceRecordRevision(db,'returns',row.id);
                    await store.recordChange?.({ entity: 'returns', id: row.id, action: 'update', before, after: await store.getReturn(row.id) });
                }
                if (await table('chat_channels') && await table('chat_members')) {
                    for (const group of (await db.query("SELECT id FROM chat_channels WHERE kind='group' AND ownerId=$1", [id])).rows) {
                        const candidates = (await db.query("SELECT u.* FROM users u JOIN chat_members m ON m.userId=u.id WHERE m.channelId=$1 AND m.joined=1 AND u.id<>$2 AND u.active=1 AND u.deletedAt IS NULL ORDER BY (u.role='admin') DESC,u.id", [group.id, id])).rows;
                        const successor = candidates.find(user => hasPermission(user, 'chatRead') && hasPermission(user, 'chatGroupsCreate'));
                        await db.query("UPDATE chat_channels SET ownerId=$1 WHERE id=$2", [successor?.id ?? null, group.id]);
                    }
                    await db.query("DELETE FROM chat_members WHERE userId=$1", [id]);
                }
                if (await table('chat_message_pins'))
                    await db.query("UPDATE chat_message_pins SET pinnedById=NULL WHERE pinnedById=$1", [id]);
                await db.query('DELETE FROM sso_identities WHERE userId=$1',[id]);
                for (const name of ['account_preferences', 'user_mfa', 'recovery_codes', 'mfa_enrollments', 'notifications'])
                    await db.query(`DELETE FROM ${name} WHERE userId=$1`, [id]);
                const tombstone = `deleted-${id}-${randomBytes(12).toString('hex')}`;
                await db.query("UPDATE users SET username=$1,usernameKey=$2,displayName='Gel\u00F6schtes Konto',role='viewer',active=0,passwordHash='',passwordSalt='',authVersion=authVersion+1,canDelete=0,canImport=0,canExport=0,permissionOverrides=$3,deletedAt=$4,updatedAt=$5 WHERE id=$6", [tombstone, tombstone, JSON.stringify(Object.fromEntries(PERMISSION_KEYS.map(key => [key, false]))), now, now, id]);
                await store.recordChange?.({ entity: 'users', id, action: 'delete', before: profile(old), after: {} });
                return { ok: true };
            });
        },
        async update(id, input, beforeCommit = () => { }) {
            await missing(id);
            const hash = Object.hasOwn(input, 'password') ? await hashPassword(input.password) : null;
            return transaction(async () => {
                await beforeCommit();
                const old = await missing(id), value = fields({ ...old, active: !!old.active, ...input }, old);
                if (old.active && old.role === 'admin' && (!value.active || value.role !== 'admin') && Number((await db.query("SELECT COUNT(*) AS total FROM users WHERE active=1 AND role='admin'", [])).rows[0].total) <= 1)
                    throw new InputError('Mindestens ein aktiver Administrator muss erhalten bleiben.');
                const version = old.authVersion + Number(!!hash || !!old.active !== value.active);
                await db.query("UPDATE users SET username=$1,usernameKey=$2,displayName=$3,role=$4,active=$5,passwordHash=$6,passwordSalt=$7,authVersion=$8,updatedAt=$9,canDelete=$10,canImport=$11,canExport=$12,permissionOverrides=$13 WHERE id=$14", [value.username, value.usernameKey, value.displayName, value.role, Number(value.active), hash?.passwordHash ?? old.passwordHash, hash?.passwordSalt ?? old.passwordSalt, version, new Date().toISOString(), value.canDelete, value.canImport, value.canExport, value.permissionOverrides, id]);
                await store.recordChange?.({ entity: 'users', id, action: hash ? 'passwordReset' : 'update', before: profile(old), after: profile(await credentialsById(id)) });
                return profile(await credentialsById(id));
            });
        },
        async changePassword(id, currentPassword, newPassword, beforeCommit = () => { }) {
            const old = await missing(id);
            if (!old.active || !await verifyPassword(currentPassword, old))
                throw new InputError('Das aktuelle Passwort ist nicht korrekt.', 401);
            const hash = await hashPassword(newPassword);
            await transaction(async () => {
                await beforeCommit();
                const current = await missing(id);
                if (!current.active || current.authVersion !== old.authVersion)
                    throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                await db.query("UPDATE users SET passwordHash=$1,passwordSalt=$2,authVersion=authVersion+1,updatedAt=$3 WHERE id=$4", [hash.passwordHash, hash.passwordSalt, new Date().toISOString(), id]);
                await store.recordChange?.({ entity: 'users', id, action: 'passwordChange' });
            });
        }
    };
}
import {checkRecordRevision,advanceRecordRevision} from './database/record-metadata.js';
