import { randomBytes, scryptSync } from 'node:crypto';
import { InputError } from '../shared/model.js';
import { verifyPassword } from './users.js';
export function createAuth({ users, now = Date.now, sessionHours = () => 8, secondFactor }) {
    const sessions = new Map(), attempts = new Map(), window = 15 * 60 * 1000;
    const dummySalt = randomBytes(32).toString('hex'), dummy = { passwordSalt: dummySalt, passwordHash: scryptSync(randomBytes(32).toString('hex'), dummySalt, 64).toString('hex') };
    function prune() { const time = now(); for (const [token, session] of sessions)
        if (session.expiresAt <= time)
            sessions.delete(token); for (const [ip, attempt] of attempts)
        if (attempt.expiresAt <= time)
            attempts.delete(ip); }
    function startSession(userId,{mfaVerified=false,userAgent='',accessScope='standard'}={}) {
        prune();
        const account = users.credentialsById(userId);
        if (!account?.active)
            throw new InputError('Anmeldedaten sind nicht korrekt.', 401);
        if(secondFactor?.needed(userId)&&!mfaVerified)throw new InputError('Bitte zweiten Anmeldeschritt abschließen.',401);
        if (sessions.size >= 1000)
            sessions.delete(sessions.keys().next().value);
        const token = randomBytes(32).toString('hex'), session = { id:randomBytes(24).toString('hex'),userId, authVersion: account.authVersion, csrfToken: randomBytes(32).toString('hex'), expiresAt: now() + sessionHours() * 60 * 60 * 1000,createdAt:now(),lastSeen:now(),userAgent:String(userAgent).slice(0,250),accessScope };
        sessions.set(token, session);
        return { token, csrfToken: session.csrfToken, expiresAt: session.expiresAt, user: users.get(userId) };
    }
    return {
        startSession,
        async login(input, ip,userAgent='',accessScope='standard') {
            prune();
            const username = typeof input?.username === 'string' && input.username.length <= 64 ? input.username.trim().toLowerCase() : '<invalid>';
            const attemptKey = JSON.stringify([ip,username]);
            const attempt = attempts.get(attemptKey) ?? { count: 0, expiresAt: now() + window };
            if (attempt.count >= 10)
                throw new InputError('Zu viele Fehlversuche. Bitte nach 15 Minuten erneut versuchen.', 429);
            attempt.count++;
            attempts.set(attemptKey, attempt);
            if (attempts.size > 10000)
                attempts.delete(attempts.keys().next().value);
            const account = typeof input?.username === 'string' && input.username.length <= 64 ? users.credentialsByName(input.username) : null;
            const valid = await verifyPassword(input?.password, account ?? dummy), current = account ? users.credentialsById(account.id) : null;
            if (!valid || !account || !current?.active || current.authVersion !== account.authVersion)
                throw new InputError('Anmeldedaten sind nicht korrekt.', 401);
            attempts.delete(attemptKey);
            if(secondFactor?.needed(current.id))return secondFactor.beginChallenge(current.id,ip);
            return startSession(current.id,{userAgent,accessScope});
        },
        getSession(token,recordActivity=true,accessScope) {
            prune();
            if (token === undefined)
                return null;
            const session = sessions.get(token);
            if (!session)
                return null;
            if(accessScope!==undefined&&session.accessScope!==accessScope)return null;
            const account = users.credentialsById(session.userId);
            if (!account?.active || account.authVersion !== session.authVersion) {
                sessions.delete(token);
                return null;
            }
            if(recordActivity)session.lastSeen=now();
            return { id:session.id,csrfToken: session.csrfToken, expiresAt: session.expiresAt, user: users.get(session.userId) };
        },
        listSessions(userId,currentToken){prune();const result=[];for(const [key,value]of sessions){if(value.userId!==userId||!this.getSession(key,false))continue;result.push({id:value.id,createdAt:value.createdAt,lastSeen:value.lastSeen,expiresAt:value.expiresAt,userAgent:value.userAgent,current:key===currentToken});}return result;},
        revoke(userId,{id,mode},currentToken){let found=false;for(const [key,value]of sessions)if(value.userId===userId&&(mode==='all'||mode==='others'&&key!==currentToken||id===value.id)){sessions.delete(key);found=true;}if(id&&!found)throw new InputError('Sitzung nicht gefunden.',404);},
        logoutAll(userId){for(const [key,value]of sessions)if(value.userId===userId)sessions.delete(key);},
        logout: (token) => token === undefined ? false : sessions.delete(token)
    };
}
