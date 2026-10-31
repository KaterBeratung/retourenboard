import { InputError } from '../shared/model.js';
import { ssoBrowserToken } from './sso-routes.js';
import { jsonBody } from './request-body.js';
import { NOT_HANDLED } from './route-result.js';
export async function handleAccountRoute(ctx) {
    const { req, res, path, method, token, access, ip, cookie, json, body, mutate, requireSession, requireAdmin, sessionBody, isMaintenance, coordinator, users, auth, mfa, sso, accountSettings, settings, store, audit } = ctx;
    if (method === 'POST' && path === '/api/setup') {
        if (!await users.setupRequired())
            throw new InputError('Die Ersteinrichtung ist bereits abgeschlossen.', 409);
        const setupInput = await jsonBody(req);
        const account = await coordinator.run(async () => users.createFirst(setupInput)), login = await auth.startSession(account.id, { accessScope: access.scope });
        res.setHeader('Set-Cookie', cookie(login.token, (await settings.get()).sessionHours * 60 * 60));
        return json(await sessionBody(login), 201);
    }
    if (method === 'POST' && path === '/api/login') {
        sso.invalidate(ssoBrowserToken(req,access.secure,access.scope));
        const body = await jsonBody(req);
        const login = await auth.login(body, ip, req.headers['user-agent'], access.scope);
        if (!login.token)
            return json(login);
        res.setHeader('Set-Cookie', cookie(login.token, (await settings.get()).sessionHours * 60 * 60));
        return json(await sessionBody(login));
    }
    async function issueMfaSession(login,checkpoint,challengeId){try{sso.registerChallengeSession(challengeId,login);const hours=(await settings.get()).sessionHours,payload=await sessionBody(login);checkpoint();res.setHeader('Set-Cookie',cookie(login.token,hours*3600));return json(payload);}catch(error){auth.logout(login.token);throw error;}}
    async function fullLogin(userId,checkpoint=()=>{},challengeId) {checkpoint();auth.logoutAll(userId);const login=await auth.startSession(userId,{mfaVerified:true,userAgent:req.headers['user-agent'],accessScope:access.scope});return issueMfaSession(login,checkpoint,challengeId);}
    if (method === 'POST' && path.startsWith('/api/login/mfa')) {
        const input = await body();
        const checkpoint=sso.challengeCheckpoint(input.challengeId,ssoBrowserToken(req,access.secure,access.scope));
        return await coordinator.run(async () => {
            checkpoint();
            if (isMaintenance())
                throw new InputError('Wiederherstellung läuft. Bitte kurz warten.', 503);
            if (path === '/api/login/mfa') {
                const result = await mfa.verifyChallenge(input.challengeId, input.code, ip);
                const login = await auth.startSession(result.userId, { expectedAuthVersion: result.authVersion, mfaVerified: true, userAgent: req.headers['user-agent'], accessScope: access.scope });
                return issueMfaSession(login,checkpoint,input.challengeId);
            }
            const proof = await mfa.proofForEnrollment(input.challengeId, ip);
            if (path.endsWith('/setup')){const value=await mfa.beginEnrollment(proof);checkpoint();return json(value);}
            if (path.endsWith('/verify')){const value=await mfa.verifyEnrollment(proof,input.enrollmentId,input.code);checkpoint();return json(value);}
            if (path.endsWith('/confirm')) {
                await mfa.confirmEnrollment(proof, input.confirmationId, input.saved,checkpoint);
                return fullLogin(proof.userId,checkpoint,input.challengeId);
            }
        });
    }
    if (path === '/api/account/profile') {
        if (method === 'GET')
            return json(await accountSettings.profile((await requireSession()).user.id));
        if (method === 'PUT') {
            const input = await body();
            return json(await mutate(async () => accountSettings.profile((await requireSession()).user.id, input)));
        }
    }
    if (path === '/api/account/preferences') {
        if (method === 'GET')
            return json(await accountSettings.preferences((await requireSession()).user.id));
        if (method === 'PUT') {
            const input = await body();
            return json(await mutate(async () => accountSettings.preferences((await requireSession()).user.id, input)));
        }
    }
    if (path === '/api/account/sessions' && method === 'GET')
        return json(await auth.listSessions((await requireSession()).user.id, token));
    if (path === '/api/account/sessions/revoke' && method === 'POST') {
        const input = await body();
        if (!['all', 'others'].includes(input.mode) && typeof input.id !== 'string')
            throw new InputError('Bitte Sitzung oder Widerrufsart auswählen.');
        return await mutate(async () => {
            const current = await requireSession();
            await accountSettings.verifyIdentity(current.user.id, input.password, input.factor, requireSession);
            await store.transaction(async () => { auth.revoke(current.user.id, input, token); await audit.record({ entity: 'users', id: current.user.id, action: 'sessionsRevoke' }); });
            if (input.mode === 'all')
                res.setHeader('Set-Cookie', cookie('', 0));
            return json({ ok: true });
        });
    }
    if (path === '/api/account/mfa' && method === 'GET')
        return json(await mfa.status((await requireSession()).user.id));
    if (path.startsWith('/api/account/mfa/') && method === 'POST') {
        const input = await body();
        return await mutate(async () => {
            const current = await requireSession(), proof = { userId: current.user.id, scope: 'account', id: current.id };
            if (path.endsWith('/setup')) {
                await accountSettings.verifyIdentity(proof.userId, input.password, input.factor, requireSession);
                const result = await mfa.beginEnrollment(proof);
                await requireSession();
                return json(result);
            }
            if (path.endsWith('/verify'))
                return json(await mfa.verifyEnrollment(proof, input.enrollmentId, input.code));
            if (path.endsWith('/confirm')) {
                await mfa.confirmEnrollment(proof, input.confirmationId, input.saved);
                return fullLogin(proof.userId);
            }
            if (path.endsWith('/disable')) {
                await accountSettings.verifyIdentity(proof.userId, input.password, input.factor, requireSession);
                await mfa.disable(proof.userId);
                return fullLogin(proof.userId);
            }
            if (path.endsWith('/recovery-codes')) {
                await accountSettings.verifyIdentity(proof.userId, input.password, input.factor, requireSession);
                if (!(await mfa.status(proof.userId)).enabled)
                    throw new InputError('Bitte zuerst 2FA aktivieren.');
                return json({ recoveryCodes: await mfa.replaceRecoveryCodes(proof.userId) });
            }
            throw new InputError('Endpunkt nicht gefunden.', 404);
        });
    }
    const resetMfaPath = path.match(/^\/api\/users\/([1-9]\d*)\/mfa\/reset$/);
    if (resetMfaPath && method === 'POST') {
        await requireAdmin();
        const input = await body();
        return await mutate(async () => {
            const current = await requireAdmin(), id = Number(resetMfaPath[1]);
            if (input.confirmed !== true || id === current.user.id)
                throw new InputError('Für das eigene Konto bitte die Kontoeinstellungen verwenden. Reset eines anderen Kontos ausdrücklich bestätigen.');
            if (!await users.get(id))
                throw new InputError('Konto nicht gefunden.', 404);
            await accountSettings.verifyIdentity(current.user.id, input.password, input.factor, requireAdmin);
            await mfa.reset(id);
            auth.logoutAll(id);
            return json({ ok: true });
        });
    }
    if (method === 'POST' && path === '/api/logout') {
        auth.logout(token);
        res.setHeader('Set-Cookie', cookie('', 0));
        return json(await sessionBody(null));
    }
    if (method === 'POST' && path === '/api/account/password') {
        const value = await body(), current = await requireSession();
        await mutate(async () => { await accountSettings.verifyIdentity(current.user.id, value.currentPassword, value.factor, requireSession); await users.changePassword(current.user.id, value.currentPassword, value.newPassword, requireSession); await mfa.invalidate(current.user.id); auth.logoutAll(current.user.id); });
        auth.logout(token);
        res.setHeader('Set-Cookie', cookie('', 0));
        return json(await sessionBody(null));
    }
    return NOT_HANDLED;
}
