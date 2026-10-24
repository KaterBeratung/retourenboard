export const nameKey=name=>name.trim().normalize('NFKC').toLocaleLowerCase('de-DE');
// Compatibility entry for explicit legacy work-copy tools only.
export {migrateDatabase} from './legacy-sqlite/legacy-migrate.js';
