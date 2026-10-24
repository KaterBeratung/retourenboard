import type { SqlDatabase } from './database/types.js';
import { randomBytes, createHash } from 'node:crypto';
import { TOTP, Secret } from '../vendor/totp.js';
import { qrDataUrl } from '../vendor/qr.js';
import { InputError } from '../shared/model.js';
import type { createSecrets } from './secrets.js';
export type MfaProof = {
    userId: number;
    scope: 'account' | 'reset-enrollment';
    id: string;
};
const randomId = () => randomBytes(32).toString('hex');
const digest = (code: string) => createHash('sha256').update(code.replaceAll('-', '').toUpperCase()).digest('hex');
const codes = () => Array.from({ length: 10 }, () => randomBytes(16).toString('hex').toUpperCase().match(/.{1,8}/g)!.join('-'));
export function totpStep(secret: string, code: string, time: number): number | null {
    if (!/^\d{6}$/.test(code))
        return null;
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: code, timestamp: time, window: 1 });
    return delta === null ? null : Math.floor(time / 30000) + delta;
}
export function createMfa({ db, users, clock, secrets, record = () => { } }: {
    db: SqlDatabase;
    users: any;
    clock: {
        now(): number;
    };
    secrets: ReturnType<typeof createSecrets>;
    record?: (change: any) => void;
}) {
    const challenges = new Map<string, {
        userId: number;
        version: number;
        ip: string;
        expiresAt: number;
        failures: number;
        enrollment: boolean;
    }>();
    const attempts = new Map<string, {
        count: number;
        expiresAt: number;
    }>();
    const now = () => clock.now(), row = async (userId: number) => (await db.query("SELECT * FROM user_mfa WHERE userId=$1", [userId])).rows[0] as any;
    async function prune() {
        const time = now();
        for (const [id, c] of challenges)
            if (c.expiresAt <= time)
                challenges.delete(id);
        for (const [key, a] of attempts)
            if (a.expiresAt <= time)
                attempts.delete(key);
        await db.query("DELETE FROM mfa_enrollments WHERE expiresAt<=$1", [time]);
    }
    const attemptKeys = (userId: number, ip: string) => [`u:${userId}`, JSON.stringify(['client', userId, ip])];
    async function limit(userId: number, ip: string) {
        await prune();
        for (const key of attemptKeys(userId, ip))
            if ((attempts.get(key)?.count ?? 0) >= 10)
                throw new InputError('Zu viele 2FA-Fehlversuche. Bitte nach 15 Minuten erneut versuchen.', 429);
    }
    function fail(userId: number, ip: string) {
        for (const key of attemptKeys(userId, ip)) {
            const a = attempts.get(key) ?? { count: 0, expiresAt: now() + 900000 };
            a.count++;
            attempts.set(key, a);
        }
        if (attempts.size > 10000)
            attempts.delete(attempts.keys().next().value!);
    }
    function transaction<T>(job: () => T | Promise<T>): Promise<T> { return db.transaction(job); }
    async function bump(userId: number) { await db.query("UPDATE users SET authVersion=authVersion+1,updatedAt=$1 WHERE id=$2", [new Date(now()).toISOString(), userId]); await invalidate(userId); }
    async function invalidate(userId: number) {
        for (const [id, c] of challenges)
            if (c.userId === userId)
                challenges.delete(id);
        await db.query("DELETE FROM mfa_enrollments WHERE userId=$1", [userId]);
    }
    async function challenge(id: string, ip: string, enrollment: boolean) {
        await prune();
        const c = challenges.get(id), account = c ? await users.credentialsById(c.userId) : null;
        if (!c || c.ip !== ip || c.enrollment !== enrollment || !account?.active || account.authVersion !== c.version) {
            challenges.delete(id);
            throw new InputError('Anmeldeschritt abgelaufen. Bitte erneut anmelden.', 401);
        }
        await limit(c.userId, ip);
        return c;
    }
    async function verifyFactor(userId: number, code: string, ip = 'account') {
        await limit(userId, ip);
        const factor = await row(userId);
        if (!factor?.secretEnc)
            throw new InputError('2FA ist nicht eingerichtet.', 401);
        if (typeof code !== 'string' || code.length > 100) {
            fail(userId, ip);
            throw new InputError('2FA-Code ist ungültig. Bitte einen neuen Code oder Recoverycode eingeben.', 401);
        }
        const consumed = await db.query("UPDATE recovery_codes SET usedAt=$1 WHERE userId=$2 AND hash=$3 AND usedAt IS NULL", [new Date(now()).toISOString(), userId, digest(code)]);
        if (consumed.rowCount === 1)
            return;
        const step = totpStep(secrets.decrypt('mfa', String(userId), factor.secretEnc), code, now());
        if (step !== null && step > factor.lastStep && (await db.query("UPDATE user_mfa SET lastStep=$1 WHERE userId=$2 AND lastStep<$3", [step, userId, step])).rowCount === 1)
            return;
        fail(userId, ip);
        throw new InputError('2FA-Code ist ungültig oder bereits verwendet. Bitte den nächsten App-Code abwarten oder einen Recoverycode eingeben.', 401);
    }
    async function needed(userId: number) { const factor = await row(userId); return !!factor?.secretEnc || !!factor?.forceEnrollment; }
    return {
        needed, verifyFactor, invalidate,
        cancelChallenge(id:string){challenges.delete(id);},
        async status(userId: number) { const r = await row(userId); return { enabled: !!r?.secretEnc, enrollmentRequired: !!r?.forceEnrollment, keyAvailable: secrets.has('mfa'), recoveryCodesRemaining: Number((await db.query("SELECT COUNT(*) AS n FROM recovery_codes WHERE userId=$1 AND usedAt IS NULL", [userId])).rows[0]!.n) }; },
        async beginChallenge(userId: number, ip: string, expectedAuthVersion?: number) {
            await limit(userId, ip);
            const account = await users.credentialsById(userId);
            if (!account?.active || expectedAuthVersion !== undefined && account.authVersion !== expectedAuthVersion)
                throw new InputError('Konto ist nicht verfügbar.', 401);
            const id = randomId(), enrollment = !!(await row(userId))?.forceEnrollment, expiresAt = now() + 300000;
            const current=await users.credentialsById(userId);
            if(!current?.active||current.authVersion!==account.authVersion)throw new InputError('Anmeldeschritt abgelaufen. Bitte erneut anmelden.',401);
            challenges.set(id, { userId, version: account.authVersion, ip, expiresAt, failures: 0, enrollment });
            if (challenges.size > 1000)
                challenges.delete(challenges.keys().next().value!);
            return { challengeId: id, expiresAt, ...(enrollment ? { enrollmentRequired: true } : { mfaRequired: true }) };
        },
        async proofForEnrollment(id: string, ip: string): Promise<MfaProof> { const c = await challenge(id, ip, true); return { userId: c.userId, scope: 'reset-enrollment', id }; },
        async verifyChallenge(id: string, code: string, ip: string) {
            const c = await challenge(id, ip, false);
            try {
                await verifyFactor(c.userId, code, ip);
            }
            catch (error) {
                if (++c.failures >= 5)
                    challenges.delete(id);
                throw error;
            }
            if(challenges.get(id)!==c||c.expiresAt<=now())throw new InputError('Anmeldeschritt abgelaufen. Bitte erneut anmelden.',401);
            challenges.delete(id);
            return { userId: c.userId, authVersion: c.version };
        },
        async beginEnrollment(proof: MfaProof) {
            await prune();
            const secret = new Secret({ size: 20 }).base32;
            const enrolled = Number((await db.query("SELECT COUNT(*) AS n FROM user_mfa WHERE secretEnc IS NOT NULL", [])).rows[0]!.n) > 0;
            const enc = secrets.encrypt('mfa', String(proof.userId), secret, !enrolled), id = randomId(), expiresAt = Math.min(now() + 600000, proof.scope === 'reset-enrollment' ? challenges.get(proof.id)?.expiresAt ?? 0 : Infinity);
            const uri = new TOTP({ issuer: 'retourenboard.', label: (await users.get(proof.userId)).username, secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).toString();
            const qr = await qrDataUrl(uri);
            if (expiresAt <= now())
                throw new InputError('Einrichtung abgelaufen.', 401);
            await db.query("DELETE FROM mfa_enrollments WHERE userId=$1 AND scopeId=$2", [proof.userId, proof.id]);
            await db.query("INSERT INTO mfa_enrollments(id,userId,scopeId,scope,secretEnc,expiresAt) VALUES($1,$2,$3,$4,$5,$6)", [id, proof.userId, proof.id, proof.scope, enc, expiresAt]);
            return { enrollmentId: id, secret, qrDataUrl: qr, expiresAt };
        },
        async verifyEnrollment(proof: MfaProof, id: string, code: string) {
            await prune();
            const p = (await db.query("SELECT * FROM mfa_enrollments WHERE id=$1 AND userId=$2 AND scopeId=$3 AND scope=$4", [id, proof.userId, proof.id, proof.scope])).rows[0] as any;
            if (!p || p.confirmationId)
                throw new InputError('Einrichtung abgelaufen oder bereits bestätigt. Bitte neu beginnen.', 401);
            await limit(proof.userId, proof.id);
            const step = totpStep(secrets.decrypt('mfa', String(proof.userId), p.secretEnc), code, now());
            if (step === null) {
                fail(proof.userId, proof.id);
                throw new InputError('App-Code ist ungültig.', 401);
            }
            const recoveryCodes = codes(), confirmationId = randomId();
            await db.query("UPDATE mfa_enrollments SET confirmationId=$1,hashes=$2 WHERE id=$3", [confirmationId, JSON.stringify({ step, hashes: recoveryCodes.map(digest) }), id]);
            return { confirmationId, recoveryCodes };
        },
        async confirmEnrollment(proof: MfaProof, id: string, saved: boolean, ensureCurrent=()=>{}) {
            await prune();
            if (saved !== true)
                throw new InputError('Bitte zuerst die Sicherung der Recoverycodes bestätigen.');
            return transaction(async () => {
                const p = (await db.query("SELECT * FROM mfa_enrollments WHERE confirmationId=$1 AND userId=$2 AND scopeId=$3 AND scope=$4", [id, proof.userId, proof.id, proof.scope])).rows[0] as any;
                if (!p)
                    throw new InputError('Einrichtung abgelaufen.', 401);
                const value = JSON.parse(p.hashes);
                ensureCurrent();
                await db.query("INSERT INTO user_mfa(userId,secretEnc,lastStep,forceEnrollment) VALUES($1,$2,$3,0) ON CONFLICT(userId) DO UPDATE SET secretEnc=excluded.secretEnc,lastStep=excluded.lastStep,forceEnrollment=0", [proof.userId, p.secretEnc, value.step]);
                await db.query("DELETE FROM recovery_codes WHERE userId=$1", [proof.userId]);
                for (const hash of value.hashes)
                    await db.query("INSERT INTO recovery_codes(userId,hash) VALUES($1,$2)", [proof.userId, hash]);
                await bump(proof.userId);
                await record({ entity: 'mfa', id: proof.userId, action: 'enable', after: { enabled: true } });
                ensureCurrent();
                return { userId: proof.userId, enabled: true };
            });
        },
        replaceRecoveryCodes(userId: number) {
            return transaction(async () => {
                const values = codes();
                await db.query("DELETE FROM recovery_codes WHERE userId=$1", [userId]);
                for (const code of values)
                    await db.query("INSERT INTO recovery_codes(userId,hash) VALUES($1,$2)", [userId, digest(code)]);
                await record({ entity: 'mfa', id: userId, action: 'recoveryCodes' });
                return values;
            });
        },
        async disable(userId: number) { await transaction(async () => { await db.query("DELETE FROM user_mfa WHERE userId=$1", [userId]); await db.query("DELETE FROM recovery_codes WHERE userId=$1", [userId]); await bump(userId); await record({ entity: 'mfa', id: userId, action: 'disable', after: { enabled: false } }); }); },
        async reset(userId: number) { await transaction(async () => { await db.query("INSERT INTO user_mfa(userId,secretEnc,lastStep,forceEnrollment) VALUES($1,NULL,-1,1) ON CONFLICT(userId) DO UPDATE SET secretEnc=NULL,lastStep=-1,forceEnrollment=1", [userId]); await db.query("DELETE FROM recovery_codes WHERE userId=$1", [userId]); await bump(userId); await record({ entity: 'mfa', id: userId, action: 'reset' }); }); }
    };
}
