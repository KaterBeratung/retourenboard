import { InputError } from '../shared/model.js';
export function createNotifications({ store, preferences, mail, clock }: {
    store: any;
    preferences: any;
    mail: any;
    clock: {
        now(): number;
    };
}) {
    async function publish(event: any) {
        return store.transaction(async () => {
            const c = await preferences.get('notifications');
            if (!['newReturn', 'overdue', 'backupError'].includes(event.type) || !c[event.type])
                return;
            const count = event.payload.count ?? 1, title = event.type === 'backupError' ? 'Sicherung fehlgeschlagen' : event.type === 'overdue' ? 'Retoure überfällig' : count > 1 ? 'Retouren importiert' : 'Neue Retoure', message = event.type === 'backupError' ? 'Bitte die Sicherungen im Adminbereich prüfen.' : count > 1 ? `${count} Retouren wurden importiert.` : `${event.payload.returnNumber ?? 'Retoure'} ${event.type === 'overdue' ? 'hat die Bearbeitungsfrist überschritten.' : 'wurde angelegt.'}`, href = event.type === 'backupError' ? '/admin#backups' : '/#returns';
            if (c.inApp)
                for (const user of (await store.db.query("SELECT id FROM users WHERE active=1" + (event.type === 'backupError' ? " AND role='admin'" : ''), [])).rows)
                    await store.db.query("INSERT INTO notifications(eventKey,userId,kind,title,message,href,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id", [event.id, user.id, event.type, title, message, href, new Date(clock.now()).toISOString()]);
            await mail.enqueue({ id: event.id, type: event.type, title, message });
        });
    }
    async function drain() {
        return store.transaction(async () => {
            await store.db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notifications',0))");
            const initial: any[] = (await store.db.query("SELECT * FROM events WHERE processed=0 ORDER BY createdAt,id LIMIT 1000", [])).rows;
            const operations = [...new Set(initial.map(e => JSON.parse(e.payload).operationId).filter(Boolean))];
            const events = operations.length ? (await store.db.query(`SELECT * FROM events WHERE processed=0 AND (id IN (${initial.map((_,i) => '$'+(i+1)).join(',')}) OR (payload::jsonb->>'operationId') IN (${operations.map((_,i) => '$'+(initial.length+i+1)).join(',')})) ORDER BY createdAt,id`, [...initial.map(e => e.id), ...operations])).rows : initial;
            const groups = new Map<string, any>();
            for (const e of events) {
                const payload = JSON.parse(e.payload), key = payload.operationId ? e.type + ':' + payload.operationId : e.id;
                if (groups.has(key))
                    groups.get(key).payload.count++;
                else
                    groups.set(key, { id: key, type: e.type, payload: { ...payload, count: 1 } });
            }
            for (const event of groups.values())
                await publish(event);
            for (const event of events)
                await store.db.query("UPDATE events SET processed=1 WHERE id=$1", [event.id]);
        });
    }
    async function checkOverdue() {
        return store.transaction(async () => {
            // Serialize the snapshot as well as publication across independent workers.
            await store.db.query("SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':notifications',0))");
            const returns = await store.listReturns();
            const rows: any[] = returns.length ? (await store.db.query("SELECT r.id AS returnId,s.overdue,s.episode,s.dueDate,e.id AS legacy FROM returns r LEFT JOIN overdue_state s ON s.returnId=r.id LEFT JOIN events e ON e.id='overdue:' || r.id::text")).rows : [];
            const states = new Map<number, any>(rows.map(row => [row.returnId, row]));
            const changes: { returnId: number; overdue: number; episode: number; dueDate: string | null }[] = [];
            for (const ret of returns) {
                const old = states.get(ret.id), wasOverdue = old?.overdue ?? (old?.legacy ? 1 : 0);
                let episode = old?.episode ?? (old?.legacy ? 1 : 0);
                if (ret.overdue && !wasOverdue) {
                    episode++;
                    const id = `overdue:${ret.id}:${episode}`;
                    await store.db.query("INSERT INTO events(id,type,payload,createdAt) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [id, 'overdue', JSON.stringify({ id: ret.id, returnNumber: ret.returnNumber }), new Date(clock.now()).toISOString()]);
                }
                const overdue = ret.overdue ? 1 : 0, dueDate = ret.dueDate ?? null;
                if (old?.episode == null || old.overdue !== overdue || old.episode !== episode || old.dueDate !== dueDate)
                    changes.push({ returnId: ret.id, overdue, episode, dueDate });
            }
            for (let offset = 0; offset < changes.length; offset += 500) {
                const batch = changes.slice(offset, offset + 500);
                await store.db.query(`INSERT INTO overdue_state(returnId,overdue,episode,dueDate) VALUES ${batch.map((_, index) => `($${index * 4 + 1},$${index * 4 + 2},$${index * 4 + 3},$${index * 4 + 4})`).join(',')} ON CONFLICT(returnId) DO UPDATE SET overdue=excluded.overdue,episode=excluded.episode,dueDate=excluded.dueDate WHERE (overdue_state.overdue,overdue_state.episode,overdue_state.dueDate) IS DISTINCT FROM (excluded.overdue,excluded.episode,excluded.dueDate)`, batch.flatMap(row => [row.returnId, row.overdue, row.episode, row.dueDate]));
            }
            await drain();
        });
    }
    return { publish, drain, checkOverdue,
        async list(userId: number, query: any = {}) {
            await drain();
            const page = Number(query.page ?? 1), pageSize = Number(query.pageSize ?? 25);
            if (!Number.isInteger(page) || page < 1 || page > 100000 || ![10, 25, 50, 100].includes(pageSize))
                throw new InputError('Ungültige Nachrichtenseite.');
            const total = Number((await store.db.query("SELECT COUNT(*) AS n FROM notifications WHERE userId=$1", [userId])).rows[0].n), unread = Number((await store.db.query("SELECT COUNT(*) AS n FROM notifications WHERE userId=$1 AND readAt IS NULL", [userId])).rows[0].n), items = (await store.db.query("SELECT * FROM notifications WHERE userId=$1 ORDER BY id DESC LIMIT $2 OFFSET $3", [userId, pageSize, (page - 1) * pageSize])).rows;
            return { items, total, unread, page, pageSize };
        },
        async markRead(userId: number, id: number | 'all') {
            if (id === 'all')
                await store.db.query("UPDATE notifications SET readAt=$1 WHERE userId=$2 AND readAt IS NULL", [new Date(clock.now()).toISOString(), userId]);
            else if (!(await store.db.query("UPDATE notifications SET readAt=COALESCE(readAt,$1) WHERE userId=$2 AND id=$3", [new Date(clock.now()).toISOString(), userId, id])).rowCount)
                throw new InputError('Nachricht nicht gefunden.', 404);
            return { ok: true };
        } };
}
