// Legacy SQLite compatibility: operates on migration/restore work copies only.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { InputError } from '../../shared/model.js';
import {migrateFeatures,migrateAccountDeletion,userSchema} from './legacy-features-migrate.js';
import {capabilities,migratePermissions} from './legacy-permissions.js';
import {permissionsFor,hasPermission,PERMISSION_KEYS,LEGACY_PERMISSION_GROUPS} from '../../shared/permissions.js';
const derive = promisify(scrypt);
function validPassword(value) { if (typeof value !== 'string' || value.length < 12 || value.length > 256)
    throw new InputError('Passwort muss zwischen 12 und 256 Zeichen enthalten.'); return value; }
async function hashPassword(password) { const passwordSalt = randomBytes(32).toString('hex'); return { passwordSalt, passwordHash: (await derive(validPassword(password), passwordSalt, 64)).toString('hex') }; }
export async function verifyPassword(password, credentials) {
    if (typeof password !== 'string' || password.length > 256)
        return false;
    const actual = (await derive(password, credentials.passwordSalt, 64)), expected = Buffer.from(credentials.passwordHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function profile(row) { return row ? { id: row.id, username: row.username, displayName: row.displayName, role: row.role, active: !!row.active, createdAt: row.createdAt, updatedAt: row.updatedAt, permissions:{delete:!!row.canDelete,import:!!row.canImport,export:!!row.canExport,...permissionsFor(row)},capabilities:capabilities(row) } : null; }
function fields(input, old = null) {
    if (typeof input.username !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(input.username.trim()))
        throw new InputError('Benutzername: 3–64 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.');
    const displayName = input.displayName ?? '';
    if (typeof displayName !== 'string' || displayName.length > 100)
        throw new InputError('Anzeigename: maximal 100 Zeichen.');
    const role = input.role ?? 'member', active = input.active ?? true;
    if (!['admin','member','viewer'].includes(role))
        throw new InputError('Ungültige Rolle.');
    if (typeof active !== 'boolean')
        throw new InputError('Ungültiger Aktivstatus.');
    const username = input.username.trim();
    const permissions=Object.hasOwn(input,'permissions')?input.permissions:{};
    if (!permissions || typeof permissions!=='object' || Array.isArray(permissions) || Object.entries(permissions).some(([key,value])=>!PERMISSION_KEYS.includes(key)&&!Object.hasOwn(LEGACY_PERMISSION_GROUPS,key)||typeof value!=='boolean'))throw new InputError('Ungültige Berechtigungen.');
    const flags={};
    for(const [key,column]of [['delete','canDelete'],['import','canImport'],['export','canExport']]){
        const value=permissions[key]??(old&&old.role===role?!!old[column]:role!=='viewer');
        if(typeof value!=='boolean')throw new InputError('Ungültige Berechtigungen.');
        flags[column]=Number(role==='admin'||(role==='viewer'&&key!=='export'?false:value));
    }
    const rights=permissionsFor(old&&old.role===role?old:{role,...flags});
    for(const [alias,keys]of Object.entries(LEGACY_PERMISSION_GROUPS))if(Object.hasOwn(permissions,alias))for(const key of keys)rights[key]=permissions[alias];
    for(const key of PERMISSION_KEYS)if(Object.hasOwn(permissions,key))rights[key]=permissions[key];
    const normalized=permissionsFor({role,permissions:rights});
    return { username, usernameKey: username.toLowerCase(), displayName: displayName.trim() || username, role, active, ...flags,permissionOverrides:JSON.stringify(normalized) };
}
export function createUsers(store) {
    const db = store.db;
    db.exec(userSchema.replace('CREATE TABLE users','CREATE TABLE IF NOT EXISTS users'));
    migrateFeatures(db);
    migratePermissions(db);
    migrateAccountDeletion(db);
    const credentialsById = (id) => db.prepare('SELECT * FROM users WHERE id=? AND deletedAt IS NULL').get(id) ?? null;
    const setupRequired = () => db.prepare('SELECT COUNT(*) AS total FROM users WHERE deletedAt IS NULL').get().total === 0;
    function transaction(callback) { try {
        return store.transaction(callback);
    }
    catch (error) {
        if (String(error.message).includes('UNIQUE constraint'))
            throw new InputError('Dieser Benutzername ist bereits vergeben.', 409);
        throw error;
    } }
    function missing(id) { const old = credentialsById(id); if (!old)
        throw new InputError('Konto nicht gefunden.', 404); return old; }
    async function create(input, first = false, beforeCommit = () => { }) {
        const value = fields(first ? { ...input, role: 'admin', active: true } : input), hash = await hashPassword(input.password);
        return transaction(() => {
            beforeCommit();
            if (first && !setupRequired())
                throw new InputError('Die Ersteinrichtung ist bereits abgeschlossen.', 409);
            if (!first && setupRequired())
                throw new InputError('Bitte zuerst den Administrator einrichten.');
            const now = new Date().toISOString();
            const r = db.prepare('INSERT INTO users(username,usernameKey,displayName,role,active,passwordHash,passwordSalt,createdAt,updatedAt,canDelete,canImport,canExport,permissionOverrides) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(value.username, value.usernameKey, value.displayName, value.role, Number(value.active), hash.passwordHash, hash.passwordSalt, now, now,value.canDelete,value.canImport,value.canExport,value.permissionOverrides);
            const after=profile(credentialsById(Number(r.lastInsertRowid)));store.recordChange?.({entity:'users',id:after.id,action:'create',after});return after;
        });
    }
    return {
        setupRequired, credentialsById,
        credentialsByName: (name) => typeof name === 'string' ? db.prepare('SELECT * FROM users WHERE usernameKey=? AND deletedAt IS NULL').get(name.trim().toLowerCase()) ?? null : null,
        get: (id) => profile(credentialsById(id)), list: () => db.prepare('SELECT * FROM users WHERE deletedAt IS NULL ORDER BY active DESC,usernameKey,id').all().map(row => profile(row)),
        createFirst: (input) => create(input, true), create: (input, beforeCommit) => create(input, false, beforeCommit),
        remove(id,actorId,beforeCommit=()=>{}) {
            return transaction(()=>{
                beforeCommit();const actor=credentialsById(actorId),old=missing(id);
                if(!actor?.active||actor.role!=='admin')throw new InputError('Diese Funktion ist nur für Administratoren verfügbar.',403);
                if(old.active&&old.role==='admin'&&Number(db.prepare("SELECT COUNT(*) AS total FROM users WHERE active=1 AND role='admin' AND deletedAt IS NULL").get().total)<=1)throw new InputError('Mindestens ein aktiver Administrator muss erhalten bleiben.');
                if(id===actorId)throw new InputError('Dein eigenes Konto kann nicht gelöscht werden.');
                const now=new Date().toISOString(),table=name=>!!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name);
                // Keep business records and author foreign keys. The retained ID
                // cannot authenticate and never appears as a selectable account.
                for(const row of db.prepare('SELECT id FROM returns WHERE assignedUserId=?').all(id)){
                    const before=store.getReturn(row.id);
                    db.prepare("UPDATE returns SET assignedUserId=NULL,assignedDisplayName='',updatedAt=? WHERE id=?").run(now,row.id);
                    store.recordChange?.({entity:'returns',id:row.id,action:'update',before,after:store.getReturn(row.id)});
                }
                if(table('chat_channels')&&table('chat_members')){
                    for(const group of db.prepare("SELECT id FROM chat_channels WHERE kind='group' AND ownerId=?").all(id)){
                        const candidates=db.prepare("SELECT u.* FROM users u JOIN chat_members m ON m.userId=u.id WHERE m.channelId=? AND m.joined=1 AND u.id<>? AND u.active=1 AND u.deletedAt IS NULL ORDER BY (u.role='admin') DESC,u.id").all(group.id,id);
                        const successor=candidates.find(user=>hasPermission(user,'chatRead')&&hasPermission(user,'chatGroupsCreate'));
                        db.prepare('UPDATE chat_channels SET ownerId=? WHERE id=?').run(successor?.id??null,group.id);
                    }
                    db.prepare('DELETE FROM chat_members WHERE userId=?').run(id);
                }
                if(table('chat_message_pins'))db.prepare('UPDATE chat_message_pins SET pinnedById=NULL WHERE pinnedById=?').run(id);
                for(const name of ['account_preferences','user_mfa','recovery_codes','mfa_enrollments','notifications'])db.prepare(`DELETE FROM ${name} WHERE userId=?`).run(id);
                const tombstone=`deleted-${id}-${randomBytes(12).toString('hex')}`;
                db.prepare("UPDATE users SET username=?,usernameKey=?,displayName='Gelöschtes Konto',role='viewer',active=0,passwordHash='',passwordSalt='',authVersion=authVersion+1,canDelete=0,canImport=0,canExport=0,permissionOverrides=?,deletedAt=?,updatedAt=? WHERE id=?").run(tombstone,tombstone,JSON.stringify(Object.fromEntries(PERMISSION_KEYS.map(key=>[key,false]))),now,now,id);
                store.recordChange?.({entity:'users',id,action:'delete',before:profile(old),after:{}});
                return {ok:true};
            });
        },
        async update(id, input, beforeCommit = () => { }) {
            missing(id);
            const hash = Object.hasOwn(input, 'password') ? await hashPassword(input.password) : null;
            return transaction(() => {
                beforeCommit();
                const old = missing(id), value = fields({ ...old, active: !!old.active, ...input },old);
                if (old.active && old.role === 'admin' && (!value.active || value.role !== 'admin') && Number(db.prepare("SELECT COUNT(*) AS total FROM users WHERE active=1 AND role='admin'").get().total) <= 1)
                    throw new InputError('Mindestens ein aktiver Administrator muss erhalten bleiben.');
                const version = old.authVersion + Number(!!hash || !!old.active !== value.active);
                db.prepare('UPDATE users SET username=?,usernameKey=?,displayName=?,role=?,active=?,passwordHash=?,passwordSalt=?,authVersion=?,updatedAt=?,canDelete=?,canImport=?,canExport=?,permissionOverrides=? WHERE id=?').run(value.username, value.usernameKey, value.displayName, value.role, Number(value.active), hash?.passwordHash ?? old.passwordHash, hash?.passwordSalt ?? old.passwordSalt, version, new Date().toISOString(),value.canDelete,value.canImport,value.canExport,value.permissionOverrides,id);
                store.recordChange?.({entity:'users',id,action:hash?'passwordReset':'update',before:profile(old),after:profile(credentialsById(id))});
                return profile(credentialsById(id));
            });
        },
        async changePassword(id, currentPassword, newPassword, beforeCommit = () => { }) {
            const old = missing(id);
            if (!old.active || !await verifyPassword(currentPassword, old))
                throw new InputError('Das aktuelle Passwort ist nicht korrekt.', 401);
            const hash = await hashPassword(newPassword);
            transaction(() => {
                beforeCommit();
                const current = missing(id);
                if (!current.active || current.authVersion !== old.authVersion)
                    throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
                db.prepare('UPDATE users SET passwordHash=?,passwordSalt=?,authVersion=authVersion+1,updatedAt=? WHERE id=?').run(hash.passwordHash, hash.passwordSalt, new Date().toISOString(), id);
                store.recordChange?.({entity:'users',id,action:'passwordChange'});
            });
        }
    };
}
