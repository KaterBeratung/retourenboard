import { join, resolve } from 'node:path';
import { lstatSync, readFileSync,existsSync } from 'node:fs';
import {assertLegacyCutover} from './database/legacy-guard.js';
import {readDatabaseConfig} from './database/config.js';
import {openDatabase} from './database/connection.js';
import {acquireRuntimeLease} from './database/runtime-lease.js';
import {createActivation} from './migration/activation.js';
import {stageRestore} from './migration/restore-stage.js';
import { createApp } from './app.js';
import { createRestoreController, type PreparedRestore, type RestoreOwner } from './restore-controller.js';

import { InputError } from '../shared/model.js';

import { createServerLog } from './server-log.js';
import { createUpdateClient } from './update-client.js';
import {UPDATE_MARKER} from './update-linux.js';
import { randomUUID } from 'node:crypto';
export function createRuntime(options: any) {
    const dataDir=resolve(options.dataDir??'data'),config=options.databaseConfig??readDatabaseConfig();
    let management:any,transaction:any,runtimeLease:any,markerTimer:ReturnType<typeof setInterval>|undefined;
    const activeSchema=options.internalSchema??'retourenboard';
    let app: any, closed = false, activation: Promise<void> | null = null, lastActivation: Promise<void> = Promise.resolve(), lastFailure = '';
    const attempts = new Map<string, {
        n: number;
        until: number;
    }>();
    const clock = { now: options.now ?? Date.now };
    const serverLog = createServerLog({ now: clock.now }), service = options.updateService ?? createUpdateClient();
    const managedService = options.managedService ?? (process.platform === 'linux' && dataDir === '/var/lib/retourenboard');
    let restartState: any = { state: 'idle' }, lastRestart: Promise<void> = Promise.resolve();
    async function controlStatus() {
        const remote = await service.serverStatus?.();
        if (managedService)
            return { ...remote, available: remote?.available === true, mode: 'service', message: remote?.message || (!remote?.available ? 'Serverdienst nicht erreichbar. Aktuelles Linux-Installskript ausführen.' : undefined) };
        if (restartState.state === 'prepared' && restartState.expiresAt <= clock.now())
            restartState = { state: 'idle' };
        return { available: !closed, mode: 'application', ...restartState, message: restartState.message || 'Startet die Anwendung neu. Der Node.js-Prozess bleibt aktiv.' };
    }
    const serverControl = { status: controlStatus,
        async logs() {
            if (managedService) {
                const status = await controlStatus();
                if (status.available)
                    return await service.logs();
                return { ...serverLog.read(), message: 'Dienstprotokoll nicht erreichbar. Es werden nur Anwendungsereignisse angezeigt.' };
            }
            return serverLog.read();
        },
        async prepareRestart() {
            if (closed || activation)
                throw new InputError('Eine Serverwartung läuft bereits.', 409);
            const status = await controlStatus();
            if (!status.available)
                throw new InputError(status.message, 503);
            if (['prepared', 'restarting'].includes(status.state))
                throw new InputError('Ein Neustart läuft bereits.', 409);
            if (managedService)
                return service.prepareRestart();
            const update = await service.status?.();
            if (update?.recoveryRequired || update && !['idle', 'complete', 'failed'].includes(update.state))
                throw new InputError('Ein Update läuft oder benötigt Wiederherstellung.', 409);
            restartState = { id: randomUUID(), state: 'prepared', expiresAt: clock.now() + 15000 };
            return { mode: 'application', ...restartState };
        },
        async cancelRestart(id: string) {
            if (managedService)
                return service.cancelRestart(id);
            if (restartState.state === 'prepared' && restartState.id === id)
                restartState = { state: 'idle' };
        },
        async commitRestart(id: string) {
            if (managedService) {
                await service.commitRestart(id);
                for (let i = 0; i < 120; i++) {
                    const status = await service.serverStatus();
                    if (status.state === 'complete')
                        return;
                    if (status.state === 'failed' || !status.available)
                        throw Error('Dienstneustart fehlgeschlagen.');
                    await new Promise(r => setTimeout(r, 500));
                }
                throw Error('Dienstneustart dauert zu lange.');
            }
            if ((await controlStatus()).state !== 'prepared' || restartState.id !== id || activation || closed)
                throw new InputError('Ungültiger oder abgelaufener Neustartauftrag.', 409);
            restartState = { id, state: 'restarting' };
            activation = (async () => {
                const old = app, activeNetwork = { ...old.network }, actualPort = old.server.address().port;
                let desired: any;
                try {
                    desired = await old.settings.network();
                    await old.jobs.close();
                    await old.backups.close();
                    await old.mail.close();
                    await old.close();
                    await listen(undefined, desired.port === 0 ? actualPort : undefined);
                    restartState = { id, state: 'complete', message: 'Neustart abgeschlossen.' };
                    serverLog.write('info', 'Neustart abgeschlossen. Erneute Anmeldung erforderlich.');
                }
                catch (error) {
                    await app?.close();
                    await listen(activeNetwork, actualPort);
                    restartState = { id, state: 'failed', message: 'Neustart fehlgeschlagen. Die vorherige Verbindung wurde wieder aktiviert.' };
                    serverLog.write('error', restartState.message);
                    throw error;
                }
            })();
            lastRestart = activation;
            try {
                await activation;
            }
            finally {
                activation = null;
            }
        }
    };
    const controller = createRestoreController({databaseConfig:config, dataDir, clock, currentMfaKey: () => {
            try {
                const path = join(dataDir, 'secrets', 'mfa.key');
                if (lstatSync(join(dataDir, 'secrets')).isSymbolicLink() || lstatSync(path).isSymbolicLink())
                    return;
                const value = readFileSync(path);
                if (value.length === 32)
                    return value;
            }
            catch { }
            return;
        } });
    const adapter = { controller,
        limitIdentity(owner: RestoreOwner) {
            const key = String(owner.userId);
            let item = attempts.get(key);
            if (!item || item.until <= clock.now()) {
                if (attempts.size > 1000)
                    for (const [k, v] of attempts)
                        if (v.until <= clock.now())
                            attempts.delete(k);
                item = { n: 0, until: clock.now() + 900000 };
                attempts.set(key, item);
            }
            if (++item.n > 10)
                throw new InputError('Zu viele Bestätigungsversuche. Bitte in 15 Minuten erneut versuchen.', 429);
        },
        activateRestore: async (prepared: PreparedRestore) => activateRestore(prepared), recordFailure: (_error: unknown) => { lastFailure = 'Wiederherstellung fehlgeschlagen; der vorherige Bestand wurde wieder aktiviert.'; console.error(lastFailure); } };
    async function listen(activeNetwork?: any, listenerPort?: number, maintenance=options.maintenance??existsSync(join(dataDir,UPDATE_MARKER))) {
        app = await createApp({ ...options, databaseConfig:config, runtimeLease, maintenance, dataDir, updateService: service, serverControl, serverLog, activeNetwork, runtime: adapter });
        try {
            options.onApp?.(app);
            await new Promise<void>((resolve, reject) => { app.server.once('error', reject); app.server.listen(listenerPort ?? activeNetwork?.port ?? app.network.port, options.host ?? '127.0.0.1', () => { app.server.removeListener('error', reject); resolve(); }); });
            serverLog.write('info', `Anwendungsserver gestartet. Interner Port ${app.server.address().port}.`);
        }
        catch (error) {
            await app.close();
            throw error;
        }
    }
    async function activateRestore(prepared: PreparedRestore) {
        if (activation)
            throw new InputError('Eine Wiederherstellung läuft bereits.', 409);
        if (closed)
            throw new InputError('Server wird beendet.', 503);
        activation = (async () => {
            const old = app, activeNetwork = { ...old.network, port: old.server.address().port };
            let staged:{schema:string;files:string}|undefined,committed=false;
            try {
                // Stop background work before carrying final account security and backup-catalog state.
                await old.jobs.close();
                await old.backups.close();
                await old.mail.close();
                staged=await old.coordinator.run(()=>stageRestore({config,preparedDir:prepared.preparedDir,old,activeNetwork,now:clock.now}));
                await old.close();
                if(!staged)throw Error('Wiederherstellungsstufe fehlt.');
                await transaction.activate({schema:staged.schema,files:staged.files,kind:'restore'});
                await listen(activeNetwork,undefined,true);
                await app.store.db.query('SELECT 1');
                await transaction.commit();
                committed=true;
                await transaction.cleanup().catch(()=>serverLog.write('warn','Vorherige Wiederherstellungsstufe konnte noch nicht bereinigt werden.'));
                await app.releaseStartupMaintenance();
                lastFailure = '';
            }
            catch (error) {
                await app?.close();
                if(committed||await transaction.recover()==='committed'){
                    await listen(activeNetwork);
                    throw error;
                }
                await transaction.cleanup();
                if(staged)await management.query('DROP SCHEMA IF EXISTS "'+staged.schema+'" CASCADE');
                await listen(activeNetwork);
                throw error;
            }
        })();
        lastActivation = activation;
        try {
            await activation;
        }
        finally {
            controller.discard(prepared.id);
            activation = null;
        }
    }
    return { async start() { management=await openDatabase(config,activeSchema); try{runtimeLease=await acquireRuntimeLease(config,activeSchema,()=>{void app?.jobs.close().catch(()=>{});void app?.mail.close().catch(()=>{});});transaction=createActivation({database:management,dataDir,activeSchema});await transaction.recover();await assertLegacyCutover(management,options.legacySourcePath??join(dataDir,'retouren.sqlite'));await listen();if(existsSync(join(dataDir,UPDATE_MARKER))){markerTimer=setInterval(()=>{if(!closed&&!existsSync(join(dataDir,UPDATE_MARKER))){clearInterval(markerTimer);void app.releaseStartupMaintenance().catch(()=>serverLog.write('error','Wartung konnte nicht beendet werden.'));}},1000);markerTimer.unref();}}catch(error){await runtimeLease?.close();await management.close();throw error;} }, current: () => app, activateRestore, waitForRestore: async () => { await lastActivation; }, waitForRestart: async () => { await lastRestart; }, lastFailure: () => lastFailure,
        async close() {
            closed = true;
            clearInterval(markerTimer);
            try {
                await activation;
            }
            catch { }
            await controller.close();
            await app?.close();
            await runtimeLease?.close();await management?.close();
        }
    };
}
