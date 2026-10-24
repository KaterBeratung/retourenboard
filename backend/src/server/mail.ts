import { readFileSync, writeFileSync, renameSync, unlinkSync, lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTransport } from '../vendor/smtp.js';
import { InputError } from '../shared/model.js';
export function createMail({ store, secrets, dataDir, preferences, clock, transportFactory = createTransport, coordinator }: {
    store: any;
    secrets: any;
    dataDir: string;
    preferences: any;
    clock: {
        now(): number;
    };
    transportFactory?: (options: any) => any;
    coordinator?: any;
}) {
    const secretPath = join(dataDir, 'secrets', 'smtp-password.enc');
    let pending: Promise<void> | null = null, closed = false;
    const transports = new Set<any>();
    const write = <T>(job: () => T): Promise<T> => coordinator ? coordinator.run(job) : Promise.resolve(job());
    function password() {
        if (!existsSync(secretPath))
            return '';
        const stat = lstatSync(secretPath);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new InputError('SMTP-Geheimnisspeicher ist ungültig.', 503);
        return secrets.decrypt('smtp', 'mail', readFileSync(secretPath, 'utf8'));
    }
    async function config() { return { ...await preferences.get('notifications'), passwordConfigured: existsSync(secretPath) }; }
    async function update(input: any) {
        const { password: newPassword, clearPassword, ...patch } = input;
        if (newPassword !== undefined && (typeof newPassword !== 'string' || !newPassword || newPassword.length > 512) || clearPassword !== undefined && typeof clearPassword !== 'boolean')
            throw new InputError('Ungültiges SMTP-Passwort.');
        if (newPassword && clearPassword)
            throw new InputError('Passwort entweder ändern oder entfernen.');
        return store.transaction(async () => {
            await preferences.update('notifications', patch);
            if (newPassword || clearPassword) {
                const old = existsSync(secretPath) ? readFileSync(secretPath) : null;
                if (old && lstatSync(secretPath).isSymbolicLink())
                    throw new InputError('Ungültiger Geheimnisspeicher.', 503);
                store.onRollback(() => {
                    if (old)
                        writeFileSync(secretPath, old, { mode: 0o600 });
                    else
                        try {
                            unlinkSync(secretPath);
                        }
                        catch { }
                });
                if (newPassword) {
                    const encrypted = secrets.encrypt('smtp', 'mail', newPassword, !old), temporary = secretPath + '.' + randomUUID() + '.part';
                    try {
                        writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 });
                        renameSync(temporary, secretPath);
                    }
                    finally {
                        try {
                            unlinkSync(temporary);
                        }
                        catch { }
                    }
                }
                else if (old)
                    unlinkSync(secretPath);
                await store.recordChange?.({ entity: 'mail', action: newPassword ? 'passwordSet' : 'passwordClear' });
            }
            store.onCommit(() => {
                for (const t of transports)
                    t.close();
            });
            return config();
        });
    }
    async function enqueue(event: any) {
        const c = await config();
        if (!c.emailEnabled || !c.eventTypes.includes(event.type))
            return;
        await store.db.query("INSERT INTO mail_outbox(eventKey,payload,nextAt,createdAt) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id", [event.id, JSON.stringify({ type: event.type, title: event.title, message: event.message }), clock.now(), new Date(clock.now()).toISOString()]);
    }
    async function send(event: any, options: any = {}) {
        if (closed)
            throw new InputError('Mailworker wird beendet.', 503);
        const c = await config();
        if (!c.emailEnabled)
            throw new InputError('E-Mail-Versand ist deaktiviert.');
        const transport = transportFactory({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpMode === 'tls', requireTLS: c.smtpMode === 'starttls', tls: { rejectUnauthorized: true, ...options.tls }, ...(c.smtpUser ? { auth: { user: c.smtpUser, pass: password() } } : {}), connectionTimeout: 10000, greetingTimeout: 10000, dnsTimeout: 10000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
        transports.add(transport);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const delivery = transport.sendMail({ from: c.from, bcc: c.recipients, subject: 'retourenboard. · ' + event.title, text: event.title + '\n\n' + event.message + '\n\n' + ((await store.settings?.get()).publicOrigin || 'Im Retourenboard anmelden.'), disableFileAccess: true, disableUrlAccess: true });
            const result = await Promise.race([delivery, new Promise<any>((_, reject) => { timer = setTimeout(() => { transport.close(); reject(new Error('SMTP-Zeitlimit')); }, options.timeoutMs ?? 30000); })]);
            if (Array.isArray(result?.rejected) && result.rejected.length)
                throw new Error('Einzelne Empfänger wurden abgelehnt.');
        }
        finally {
            if (timer)
                clearTimeout(timer);
            transport.close();
            transports.delete(transport);
        }
    }
    async function run() {
        await write(async () => await store.db.query("UPDATE mail_outbox SET state='failed',leaseUntil=NULL,lastError='Letzter Zustellversuch wurde unterbrochen.' WHERE state='sending' AND attempts>=5 AND leaseUntil<=$1", [clock.now()]));
        const configNow = await config();
        if (!configNow.emailEnabled) {
            await write(async () => await store.db.query("UPDATE mail_outbox SET state='cancelled' WHERE state IN ('pending','sending')", []));
            return;
        }
        const rows = (await store.db.query("SELECT * FROM mail_outbox WHERE attempts<5 AND ((state='pending' AND nextAt<=$1) OR (state='sending' AND leaseUntil<=$2)) ORDER BY id LIMIT 10", [clock.now(), clock.now()])).rows;
        for (const row of rows) {
            if (closed)
                break;
            const event = JSON.parse(row.payload), c = await config();
            if (!c.emailEnabled || !c.eventTypes.includes(event.type)) {
                await write(async () => await store.db.query("UPDATE mail_outbox SET state='cancelled' WHERE id=$1", [row.id]));
                continue;
            }
            const claim: any = await write(async () => await store.db.query("UPDATE mail_outbox SET state='sending',attempts=attempts+1,leaseUntil=$1 WHERE id=$2 AND attempts=$3 AND (state='pending' OR (state='sending' AND leaseUntil<=$4))", [clock.now() + 600000, row.id, row.attempts, clock.now()]));
            if (!claim.rowCount)
                continue;
            try {
                await send(event);
                await write(async () => await store.db.query("UPDATE mail_outbox SET state='sent',leaseUntil=NULL,lastError=NULL WHERE id=$1", [row.id]));
            }
            catch {
                const attempts = row.attempts + 1, delay = [60000, 300000, 900000, 3600000][attempts - 1] ?? 3600000;
                await write(async () => await store.db.query("UPDATE mail_outbox SET state=$1,nextAt=$2,leaseUntil=NULL,lastError=$3 WHERE id=$4", [attempts >= 5 ? 'failed' : 'pending', clock.now() + delay, `SMTP-Zustellung fehlgeschlagen (Versuch ${attempts}/5). Host, TLS und Zugang prüfen.`, row.id]));
            }
        }
    }
    return { config, update, enqueue,
        async tick() {
            if (closed)
                return Promise.resolve();
            if (!pending)
                pending = run().finally(() => pending = null);
            return pending;
        },
        async test(options: any = {}) {
            try {
                await send({ title: 'Testnachricht', message: 'Die SMTP-Verbindung deines Retourenboards funktioniert.' }, options);
                return { ok: true, recipients: (await config()).recipients };
            }
            catch {
                throw new InputError('SMTP-Test fehlgeschlagen. Host, TLS-Zertifikat und Zugang prüfen.', 503);
            }
        },
        async close() {
            closed = true;
            for (const t of transports)
                t.close();
            await pending?.catch(() => { });
        },
        status: async () => (await store.db.query("SELECT state,COUNT(*) AS count FROM mail_outbox GROUP BY state", [])).rows };
}
