import { InputError } from '../shared/model.js';
export async function handleServerRoute({ req, res, path, method, body, json, control, logs, owner, coordinator, verifyFactor, secondFactorRequired, beginMaintenance, record, backupBusy, nextOrigin }: any): Promise<boolean> {
    if (!path.startsWith('/api/admin/server'))
        return false;
    await owner();
    if (method === 'GET' && path === '/api/admin/server') {
        const status = control ? await control.status() : { available: false, mode: 'application', state: 'idle', message: 'Neustart benötigt den normalen Serverstart.' };
        const current = await owner();
        json({ ...status, requiresSecondFactor: await secondFactorRequired(current.user.id) });
        return true;
    }
    if (method === 'GET' && path === '/api/admin/server/logs') {
        let result;
        try {
            result = control ? await control.logs() : logs.read();
        }
        catch {
            throw new InputError('Dienstprotokoll konnte nicht gelesen werden. Erreichbarkeit des Serverdienstes prüfen.', 503);
        }
        await owner();
        json(result);
        return true;
    }
    if (method !== 'POST' || path !== '/api/admin/server/restart')
        throw new InputError('Endpunkt nicht gefunden.', 404);
    const input = await body();
    if (input.confirmed !== true)
        throw new InputError('Neustart bitte ausdrücklich bestätigen.');
    if (!control)
        throw new InputError('Neustart benötigt den normalen Serverstart.', 503);
    const initial = await owner();
    let reservation: any, release = () => { }, handedOff = false;
    try {
        await coordinator.run(async () => {
            await owner(initial);
            if (await backupBusy())
                throw new InputError('Eine Sicherung läuft bereits. Bitte kurz warten.', 409);
            await verifyFactor(initial.user.id, input.factor);
            await owner(initial);
            if (await backupBusy())
                throw new InputError('Eine Sicherung läuft bereits. Bitte kurz warten.', 409);
            release = beginMaintenance();
            try {
                reservation = await control.prepareRestart();
            }
            catch (error) {
                if (error instanceof InputError)
                    throw error;
                throw new InputError('Neustart konnte nicht vorbereitet werden. Serverstatus prüfen.', 503);
            }
            await owner(initial);
            await record(reservation);
        });
        if (res.destroyed || req.aborted) {
            await control.cancelRestart(reservation.id);
            release();
            return true;
        }
        const handoff = () => {
            if (handedOff)
                return;
            handedOff = true;
            void control.commitRestart(reservation.id).catch(() => { logs.write('error', 'Neustart fehlgeschlagen. Serverstatus und Dienstprotokoll prüfen.'); }).finally(() => release());
        };
        res.once('finish', handoff);
        res.once('close', () => {
            if (!handedOff) {
                if (res.writableFinished)
                    handoff();
                else {
                    void control.cancelRestart(reservation.id).catch(() => { });
                    release();
                }
            }
        });
        logs.write('info', 'Administrator hat einen Serverneustart angefordert.');
        json({ accepted: true, id: reservation.id, mode: reservation.mode, nextOrigin: await nextOrigin() }, 202);
    }
    catch (error) {
        if (reservation)
            await control.cancelRestart(reservation.id).catch(() => { });
        release();
        throw error;
    }
    return true;
}
