import type { SqlDatabase } from './database/types.js';
import { InputError } from '../shared/model.js';
import { verifyPassword } from './users.js';
import type { createMfa } from './mfa.js';
export function createAccountSettings(db: SqlDatabase, users: any, mfa: ReturnType<typeof createMfa>, { now = Date.now }: {
    now?: () => number;
} = {}) {
    const attempts = new Map<number, {
        count: number;
        expiresAt: number;
    }>();
    function reserve(userId: number) {
        const time = now();
        for (const [id, attempt] of attempts)
            if (attempt.expiresAt <= time)
                attempts.delete(id);
        const attempt = attempts.get(userId) ?? { count: 0, expiresAt: time + 900000 };
        if (attempt.count >= 10)
            throw new InputError('Zu viele Bestätigungsversuche. Bitte nach 15 Minuten erneut versuchen.', 429);
        attempt.count++;
        attempts.set(userId, attempt);
    }
    return {
        async profile(userId: number, input?: any) {
            if (input) {
                if (Object.keys(input).some(k => k !== 'displayName') || typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 100)
                    throw new InputError('Bitte einen Anzeigenamen mit höchstens 100 Zeichen eingeben.');
                await db.query("UPDATE users SET displayName=$1,updatedAt=$2 WHERE id=$3", [input.displayName.trim(), new Date().toISOString(), userId]);
            }
            return users.get(userId);
        },
        async preferences(userId: number, input?: any) {
            const old = (await db.query("SELECT value FROM account_preferences WHERE userId=$1", [userId])).rows[0], value = { theme: 'system', reduceMotion: false, ...(old ? JSON.parse(String(old.value)) : {}), ...input };
            if (input) {
                if (Object.keys(input).some(k => !['theme', 'reduceMotion', 'motionMode'].includes(k)) || !['system', 'light', 'dark'].includes(value.theme) || typeof value.reduceMotion !== 'boolean' || ('motionMode' in value && !['system', 'on', 'off'].includes(value.motionMode)))
                    throw new InputError('Ungültige Kontodarstellung.');
                if ('motionMode' in input) {
                    if ('reduceMotion' in input && input.reduceMotion !== (input.motionMode === 'off'))
                        throw new InputError('Ungültige Kontodarstellung.');
                    value.reduceMotion = input.motionMode === 'off';
                } else if ('reduceMotion' in input && 'motionMode' in value) {
                    // Older clients retain their ability to turn reduced motion on or off.
                    value.motionMode = input.reduceMotion ? 'off' : 'system';
                }
                await db.query("INSERT INTO account_preferences(userId,value) VALUES($1,$2) ON CONFLICT(userId) DO UPDATE SET value=excluded.value", [userId, JSON.stringify(value)]);
            }
            return value;
        },
        async verifyIdentity(userId: number, password: string, factor: string, beforeCommit: () => void) {
            reserve(userId);
            const account = await users.credentialsById(userId);
            if (!account?.active || !await verifyPassword(password, account))
                throw new InputError('Aktuelles Passwort ist nicht korrekt.', 401);
            await beforeCommit();
            const current = await users.credentialsById(userId);
            if (!current?.active || current.authVersion !== account.authVersion)
                throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.', 401);
            if ((await mfa.status(userId)).enabled)
                await mfa.verifyFactor(userId, factor);
            attempts.delete(userId);
        }
    };
}
