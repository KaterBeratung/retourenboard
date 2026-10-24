// Frozen 3.2.57 compatibility contract. Never used by runtime repositories.
export const LEGACY_TABLES=[
 {name:'app_logo',sql:'CREATE TABLE app_logo(storedName TEXT NOT NULL)',columns:[{cid:0,name:'storedName',type:'TEXT',notnull:1,dflt_value:null,pk:0,hidden:0}],foreignKeys:[]},
 {
  "type": "table",
  "name": "account_preferences",
  "tableName": "account_preferences",
  "sql": "CREATE TABLE account_preferences(userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,value TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "userId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "value",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "userId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "app_preferences",
  "tableName": "app_preferences",
  "sql": "CREATE TABLE app_preferences(section TEXT PRIMARY KEY,value TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "section",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "value",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "attachments",
  "tableName": "attachments",
  "sql": "CREATE TABLE attachments (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,returnId INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,\n    originalName TEXT NOT NULL,storedName TEXT NOT NULL UNIQUE,mediaType TEXT NOT NULL,size INTEGER NOT NULL,createdAt TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "returnId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "originalName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "storedName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "mediaType",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "size",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "returns",
    "from": "returnId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "audit",
  "tableName": "audit",
  "sql": "CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,createdAt TEXT NOT NULL,actorId INTEGER,actorName TEXT NOT NULL,source TEXT NOT NULL,entity TEXT NOT NULL,entityId TEXT,action TEXT NOT NULL,operationId TEXT,changes TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "actorId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "actorName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "source",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "entity",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "entityId",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "action",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "operationId",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 9,
    "name": "changes",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "backup_jobs",
  "tableName": "backup_jobs",
  "sql": "CREATE TABLE backup_jobs(id TEXT PRIMARY KEY,mode TEXT NOT NULL,state TEXT NOT NULL,createdAt TEXT NOT NULL,finishedAt TEXT,filename TEXT,size INTEGER,error TEXT,metadata TEXT)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "mode",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "state",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "finishedAt",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "filename",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "size",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "error",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "metadata",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "chat_attachments",
  "tableName": "chat_attachments",
  "sql": "CREATE TABLE chat_attachments(\n   id INTEGER PRIMARY KEY AUTOINCREMENT,messageId INTEGER NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,\n   originalName TEXT NOT NULL,storedName TEXT NOT NULL UNIQUE,mediaType TEXT NOT NULL,size INTEGER NOT NULL CHECK(size>0),createdAt TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "messageId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "originalName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "storedName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "mediaType",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "size",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "chat_messages",
    "from": "messageId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "chat_channels",
  "tableName": "chat_channels",
  "sql": "CREATE TABLE chat_channels(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('public','group','direct')),visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),name TEXT NOT NULL,ownerId INTEGER REFERENCES users(id),directKey TEXT UNIQUE,createdAt TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "kind",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "visibility",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "ownerId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "directKey",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "ownerId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "chat_members",
  "tableName": "chat_members",
  "sql": "CREATE TABLE chat_members(channelId INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,lastReadId INTEGER NOT NULL DEFAULT 0,joined INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(channelId,userId))",
  "columns": [
   {
    "cid": 0,
    "name": "channelId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "userId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "lastReadId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "joined",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "userId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   },
   {
    "id": 1,
    "seq": 0,
    "table": "chat_channels",
    "from": "channelId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "chat_message_pins",
  "tableName": "chat_message_pins",
  "sql": "CREATE TABLE chat_message_pins(messageId INTEGER PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,pinnedById INTEGER REFERENCES users(id) ON DELETE SET NULL,pinnedAt TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "messageId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "pinnedById",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "pinnedAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "pinnedById",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "SET NULL",
    "match": "NONE"
   },
   {
    "id": 1,
    "seq": 0,
    "table": "chat_messages",
    "from": "messageId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "chat_messages",
  "tableName": "chat_messages",
  "sql": "CREATE TABLE chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,channelId INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,authorId INTEGER NOT NULL REFERENCES users(id),text TEXT NOT NULL,mentions TEXT NOT NULL DEFAULT '[]',createdAt TEXT NOT NULL,editedAt TEXT,deleted INTEGER NOT NULL DEFAULT 0)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "channelId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "authorId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "text",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "mentions",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'[]'",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "editedAt",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "deleted",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "authorId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 1,
    "seq": 0,
    "table": "chat_channels",
    "from": "channelId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "csv_profiles",
  "tableName": "csv_profiles",
  "sql": "CREATE TABLE csv_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,value TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "kind",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "revision",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "value",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "updatedAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "currency_rates",
  "tableName": "currency_rates",
  "sql": "CREATE TABLE currency_rates (id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "value",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "events",
  "tableName": "events",
  "sql": "CREATE TABLE events(id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,createdAt TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "type",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "payload",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "processed",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "mail_outbox",
  "tableName": "mail_outbox",
  "sql": "CREATE TABLE mail_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,eventKey TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,nextAt INTEGER NOT NULL,leaseUntil INTEGER,lastError TEXT,createdAt TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "eventKey",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "payload",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "state",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'pending'",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "attempts",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "nextAt",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "leaseUntil",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "lastError",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "masterdata",
  "tableName": "masterdata",
  "sql": "CREATE TABLE masterdata (\n      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL, nameKey TEXT NOT NULL,\n      code TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,\n      isDefault INTEGER NOT NULL DEFAULT 0, isClosed INTEGER NOT NULL DEFAULT 0, tone TEXT NOT NULL DEFAULT 'received',\n      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, builtinKey TEXT NOT NULL DEFAULT '', UNIQUE(kind,nameKey))",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "kind",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "nameKey",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "code",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "notes",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "active",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "isDefault",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "isClosed",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 9,
    "name": "tone",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'received'",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 10,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 11,
    "name": "updatedAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 12,
    "name": "builtinKey",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "mfa_enrollments",
  "tableName": "mfa_enrollments",
  "sql": "CREATE TABLE mfa_enrollments(id TEXT PRIMARY KEY,userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,scopeId TEXT NOT NULL,scope TEXT NOT NULL,secretEnc TEXT NOT NULL,expiresAt INTEGER NOT NULL,confirmationId TEXT,hashes TEXT NOT NULL DEFAULT '[]')",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "userId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "scopeId",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "scope",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "secretEnc",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "expiresAt",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "confirmationId",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "hashes",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'[]'",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "userId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "migrations",
  "tableName": "migrations",
  "sql": "CREATE TABLE migrations (name TEXT PRIMARY KEY)",
  "columns": [
   {
    "cid": 0,
    "name": "name",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "notifications",
  "tableName": "notifications",
  "sql": "CREATE TABLE notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,eventKey TEXT NOT NULL,userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,href TEXT,createdAt TEXT NOT NULL,readAt TEXT,UNIQUE(userId,eventKey))",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "eventKey",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "userId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "kind",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "title",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "message",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "href",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "readAt",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "userId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "overdue_state",
  "tableName": "overdue_state",
  "sql": "CREATE TABLE overdue_state(returnId INTEGER PRIMARY KEY,overdue INTEGER NOT NULL,episode INTEGER NOT NULL,dueDate TEXT)",
  "columns": [
   {
    "cid": 0,
    "name": "returnId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "overdue",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "episode",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "dueDate",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "product_images",
  "tableName": "product_images",
  "sql": "CREATE TABLE product_images (\n      productId INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,\n      originalName TEXT NOT NULL, mediaType TEXT NOT NULL, data BLOB NOT NULL, revision TEXT NOT NULL\n    )",
  "columns": [
   {
    "cid": 0,
    "name": "productId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "originalName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "mediaType",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "data",
    "type": "BLOB",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "revision",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "products",
    "from": "productId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "products",
  "tableName": "products",
  "sql": "CREATE TABLE products (\n      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE,\n      ean TEXT NOT NULL, manufacturer TEXT NOT NULL, supplier TEXT NOT NULL, category TEXT NOT NULL,\n      priceCents INTEGER NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,\n      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL\n    , supplierId INTEGER REFERENCES masterdata(id), manufacturerId INTEGER REFERENCES masterdata(id), categoryId INTEGER REFERENCES masterdata(id))",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "name",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "sku",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "ean",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "manufacturer",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "supplier",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "category",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "priceCents",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "description",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 9,
    "name": "active",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 10,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 11,
    "name": "updatedAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 12,
    "name": "supplierId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 13,
    "name": "manufacturerId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 14,
    "name": "categoryId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "masterdata",
    "from": "categoryId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 1,
    "seq": 0,
    "table": "masterdata",
    "from": "manufacturerId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 2,
    "seq": 0,
    "table": "masterdata",
    "from": "supplierId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "recovery_codes",
  "tableName": "recovery_codes",
  "sql": "CREATE TABLE recovery_codes(userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,hash TEXT NOT NULL,usedAt TEXT,PRIMARY KEY(userId,hash))",
  "columns": [
   {
    "cid": 0,
    "name": "userId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "hash",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 2,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "usedAt",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "userId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "return_comments",
  "tableName": "return_comments",
  "sql": "CREATE TABLE return_comments(id INTEGER PRIMARY KEY AUTOINCREMENT,returnId INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,authorId INTEGER NOT NULL REFERENCES users(id),text TEXT NOT NULL,mentions TEXT NOT NULL DEFAULT '[]',createdAt TEXT NOT NULL,editedAt TEXT,deleted INTEGER NOT NULL DEFAULT 0)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "returnId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "authorId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "text",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "mentions",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'[]'",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "editedAt",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "deleted",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "authorId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 1,
    "seq": 0,
    "table": "returns",
    "from": "returnId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "returns",
  "tableName": "returns",
  "sql": "CREATE TABLE returns (\n      id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER NOT NULL REFERENCES products(id),\n      returnNumber TEXT UNIQUE, serialNumber TEXT NOT NULL, orderNumber TEXT NOT NULL,\n      receiptDate TEXT NOT NULL, quantity INTEGER NOT NULL, reason TEXT NOT NULL,\n      condition TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, notes TEXT NOT NULL,\n      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL\n    , supplierId INTEGER REFERENCES masterdata(id), reasonId INTEGER REFERENCES masterdata(id), conditionId INTEGER REFERENCES masterdata(id), statusId INTEGER REFERENCES masterdata(id), resolutionId INTEGER REFERENCES masterdata(id), supplier TEXT NOT NULL DEFAULT '', customerReference TEXT NOT NULL DEFAULT '', trackingNumber TEXT NOT NULL DEFAULT '', replacementSerialNumber TEXT NOT NULL DEFAULT '', assignedUserId INTEGER, assignedDisplayName TEXT NOT NULL DEFAULT '', nextStep TEXT NOT NULL DEFAULT '')",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "productId",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "returnNumber",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "serialNumber",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "orderNumber",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "receiptDate",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "quantity",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "reason",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "condition",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 9,
    "name": "status",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 10,
    "name": "resolution",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 11,
    "name": "notes",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 12,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 13,
    "name": "updatedAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 14,
    "name": "supplierId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 15,
    "name": "reasonId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 16,
    "name": "conditionId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 17,
    "name": "statusId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 18,
    "name": "resolutionId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 19,
    "name": "supplier",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 20,
    "name": "customerReference",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 21,
    "name": "trackingNumber",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 22,
    "name": "replacementSerialNumber",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 23,
    "name": "assignedUserId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 24,
    "name": "assignedDisplayName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 25,
    "name": "nextStep",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "''",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "masterdata",
    "from": "resolutionId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 1,
    "seq": 0,
    "table": "masterdata",
    "from": "statusId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 2,
    "seq": 0,
    "table": "masterdata",
    "from": "conditionId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 3,
    "seq": 0,
    "table": "masterdata",
    "from": "reasonId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 4,
    "seq": 0,
    "table": "masterdata",
    "from": "supplierId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   },
   {
    "id": 5,
    "seq": 0,
    "table": "products",
    "from": "productId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "NO ACTION",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "server_settings",
  "tableName": "server_settings",
  "sql": "CREATE TABLE server_settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "value",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 },
 {
  "type": "table",
  "name": "user_mfa",
  "tableName": "user_mfa",
  "sql": "CREATE TABLE user_mfa(userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,secretEnc TEXT,lastStep INTEGER NOT NULL DEFAULT -1,forceEnrollment INTEGER NOT NULL DEFAULT 0)",
  "columns": [
   {
    "cid": 0,
    "name": "userId",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "secretEnc",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "lastStep",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "-1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "forceEnrollment",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "0",
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": [
   {
    "id": 0,
    "seq": 0,
    "table": "users",
    "from": "userId",
    "to": "id",
    "on_update": "NO ACTION",
    "on_delete": "CASCADE",
    "match": "NONE"
   }
  ]
 },
 {
  "type": "table",
  "name": "users",
  "tableName": "users",
  "sql": "CREATE TABLE users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,usernameKey TEXT NOT NULL UNIQUE,\n  displayName TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member','viewer')),\n  active INTEGER NOT NULL DEFAULT 1,passwordHash TEXT NOT NULL,passwordSalt TEXT NOT NULL,\n  authVersion INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,\n  canDelete INTEGER NOT NULL DEFAULT 1 CHECK(canDelete IN (0,1)),\n  canImport INTEGER NOT NULL DEFAULT 1 CHECK(canImport IN (0,1)),\n  canExport INTEGER NOT NULL DEFAULT 1 CHECK(canExport IN (0,1))\n, permissionOverrides TEXT NOT NULL DEFAULT '{}', deletedAt TEXT)",
  "columns": [
   {
    "cid": 0,
    "name": "id",
    "type": "INTEGER",
    "notnull": 0,
    "dflt_value": null,
    "pk": 1,
    "hidden": 0
   },
   {
    "cid": 1,
    "name": "username",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 2,
    "name": "usernameKey",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 3,
    "name": "displayName",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 4,
    "name": "role",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 5,
    "name": "active",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 6,
    "name": "passwordHash",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 7,
    "name": "passwordSalt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 8,
    "name": "authVersion",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 9,
    "name": "createdAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 10,
    "name": "updatedAt",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 11,
    "name": "canDelete",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 12,
    "name": "canImport",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 13,
    "name": "canExport",
    "type": "INTEGER",
    "notnull": 1,
    "dflt_value": "1",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 14,
    "name": "permissionOverrides",
    "type": "TEXT",
    "notnull": 1,
    "dflt_value": "'{}'",
    "pk": 0,
    "hidden": 0
   },
   {
    "cid": 15,
    "name": "deletedAt",
    "type": "TEXT",
    "notnull": 0,
    "dflt_value": null,
    "pk": 0,
    "hidden": 0
   }
  ],
  "foreignKeys": []
 }
] as const;
