import type { SqlDatabase } from './database/types.js';
import { InputError, PRODUCT_COLUMNS, RETURN_IMPORT_COLUMNS as RETURN_COLUMNS } from '../shared/model.js';
export type CsvProfile = {
    id: number;
    revision: number;
    name: string;
    kind: 'products' | 'returns';
    delimiter: 'auto' | ';' | ',' | '\t';
    mapping: Record<string, string>;
    duplicates: 'error' | 'skip' | 'update';
};
export function resolveProfile(profile: CsvProfile, headers: string[]) {
    if (new Set(headers).size !== headers.length)
        throw new InputError('CSV-Überschriften sind nicht eindeutig.');
    return Object.fromEntries(Object.entries(profile.mapping).map(([field, header]) => {
        const index = headers.indexOf(header);
        if (index < 0)
            throw new InputError(`Profilspalte „${header}“ fehlt in der CSV-Datei.`);
        return [field, index];
    }));
}
export function createCsvProfiles(db: SqlDatabase) {
    const display = (row: any): CsvProfile => ({ ...JSON.parse(row.value), id: row.id, revision: row.revision, name: row.name, kind: row.kind });
    async function get(id: number) {
        const row = (await db.query("SELECT * FROM csv_profiles WHERE id=$1", [id])).rows[0];
        if (!row)
            throw new InputError('CSV-Profil nicht gefunden.', 404);
        return display(row);
    }
    async function save(input: any, id?: number) {
        if (Object.keys(input).some(k => !['name', 'kind', 'delimiter', 'mapping', 'duplicates', 'id', 'revision'].includes(k)) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !['products', 'returns'].includes(input.kind) || !['auto', ';', ',', '\t'].includes(input.delimiter) || !['error', 'skip', 'update'].includes(input.duplicates))
            throw new InputError('Ungültiges CSV-Profil.');
        const columns = input.kind === 'products' ? PRODUCT_COLUMNS : RETURN_COLUMNS, map = input.mapping;
        if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).length > 50 || Object.entries(map).some(([k, v]) => !Object.hasOwn(columns, k) || typeof v !== 'string' || !v.trim() || v.length > 250) || new Set(Object.values(map)).size !== Object.keys(map).length)
            throw new InputError('Profil benötigt eindeutige Spaltennamen.');
        const required = input.duplicates === 'update' ? ['sku'] : input.kind === 'products' ? ['sku', 'name'] : ['sku', 'serialNumber'];
        if (required.some(k => !map[k]))
            throw new InputError('Pflichtspalten fehlen im Profil.');
        const value = JSON.stringify({ delimiter: input.delimiter, mapping: map, duplicates: input.duplicates }), date = new Date().toISOString();
        if (id) {
            await get(id);
            await db.query("UPDATE csv_profiles SET name=$1,kind=$2,revision=revision+1,value=$3,updatedAt=$4 WHERE id=$5", [input.name.trim(), input.kind, value, date, id]);
        }
        else {
            id = Number((await db.query("INSERT INTO csv_profiles(name,kind,value,createdAt,updatedAt) VALUES($1,$2,$3,$4,$5) RETURNING id", [input.name.trim(), input.kind, value, date, date])).rows[0].id);
        }
        return get(id);
    }
    return { get, save, list: async () => (await db.query("SELECT * FROM csv_profiles ORDER BY name,id LIMIT 100", [])).rows.map(display), async remove(id: number) { await get(id); await db.query("DELETE FROM csv_profiles WHERE id=$1", [id]); return { deleted: true }; } };
}
