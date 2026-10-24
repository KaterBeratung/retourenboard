// Legacy SQLite compatibility: operates on migration/restore work copies only.
import type {DatabaseSync} from 'node:sqlite';

export const userSchema=`CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,usernameKey TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),
  active INTEGER NOT NULL DEFAULT 1,passwordHash TEXT NOT NULL,passwordSalt TEXT NOT NULL,
  authVersion INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,
  canDelete INTEGER NOT NULL DEFAULT 1 CHECK(canDelete IN (0,1)),
  canImport INTEGER NOT NULL DEFAULT 1 CHECK(canImport IN (0,1)),
  canExport INTEGER NOT NULL DEFAULT 1 CHECK(canExport IN (0,1))
)`;

export function migrateFeatures(db:DatabaseSync):void{
  if(db.prepare("SELECT name FROM migrations WHERE name='features-1.4'").get())return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const columns=db.prepare('PRAGMA table_info(users)').all().map(r=>r.name);
    if(!columns.includes('canDelete')){
      db.exec(`ALTER TABLE users RENAME TO users_pre14; ${userSchema};
        INSERT INTO users(id,username,usernameKey,displayName,role,active,passwordHash,passwordSalt,authVersion,createdAt,updatedAt)
          SELECT id,username,usernameKey,displayName,role,active,passwordHash,passwordSalt,authVersion,createdAt,updatedAt FROM users_pre14;
        DROP TABLE users_pre14;`);
    }
    db.exec(`CREATE TABLE app_preferences(section TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE account_preferences(userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,value TEXT NOT NULL);
      CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,createdAt TEXT NOT NULL,actorId INTEGER,actorName TEXT NOT NULL,source TEXT NOT NULL,entity TEXT NOT NULL,entityId TEXT,action TEXT NOT NULL,operationId TEXT,changes TEXT NOT NULL);
      CREATE INDEX audit_entity ON audit(entity,entityId,id);
      CREATE TABLE events(id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,createdAt TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE csv_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,value TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
      CREATE TABLE user_mfa(userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,secretEnc TEXT,lastStep INTEGER NOT NULL DEFAULT -1,forceEnrollment INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE recovery_codes(userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,hash TEXT NOT NULL,usedAt TEXT,PRIMARY KEY(userId,hash));
      CREATE TABLE mfa_enrollments(id TEXT PRIMARY KEY,userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,scopeId TEXT NOT NULL,scope TEXT NOT NULL,secretEnc TEXT NOT NULL,expiresAt INTEGER NOT NULL,confirmationId TEXT,hashes TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,eventKey TEXT NOT NULL,userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,href TEXT,createdAt TEXT NOT NULL,readAt TEXT,UNIQUE(userId,eventKey));
      CREATE INDEX notifications_user ON notifications(userId,id);
      CREATE TABLE mail_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,eventKey TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,nextAt INTEGER NOT NULL,leaseUntil INTEGER,lastError TEXT,createdAt TEXT NOT NULL);
      CREATE TABLE backup_jobs(id TEXT PRIMARY KEY,mode TEXT NOT NULL,state TEXT NOT NULL,createdAt TEXT NOT NULL,finishedAt TEXT,filename TEXT,size INTEGER,error TEXT,metadata TEXT);
      INSERT INTO migrations(name) VALUES('features-1.4'); COMMIT;`);
  }catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
}

export function migrateAccountDeletion(db:DatabaseSync):void{
  if(db.prepare("SELECT 1 FROM migrations WHERE name='users-account-deletion-v1'").get())return;
  const nested=db.isTransaction;if(!nested)db.exec('BEGIN IMMEDIATE');
  try{
    if(!db.prepare('PRAGMA table_info(users)').all().some(column=>column.name==='deletedAt'))db.exec('ALTER TABLE users ADD COLUMN deletedAt TEXT');
    db.prepare('INSERT INTO migrations(name) VALUES(?)').run('users-account-deletion-v1');
    if(!nested)db.exec('COMMIT');
  }catch(error){if(!nested&&db.isTransaction)db.exec('ROLLBACK');throw error;}
}
