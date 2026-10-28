// Access grants intentionally stay outside portable business-data backups.
// Restoring business data creates this empty table and never revives an old link.
export const CUSTOMER_STATUS_MIGRATION:readonly string[]=[
 `CREATE TABLE return_shares(
 returnId BIGINT PRIMARY KEY REFERENCES returns(id) ON DELETE CASCADE,
 tokenHash TEXT UNIQUE CHECK(tokenHash IS NULL OR tokenHash ~ '^[a-f0-9]{64}$'),
 tokenEnc TEXT NOT NULL DEFAULT '',publicNote TEXT NOT NULL DEFAULT '' CHECK(char_length(publicNote)<=1000),
 expiresAt BIGINT NOT NULL CHECK(expiresAt>=0 AND expiresAt<=9007199254740991),
 revision BIGINT NOT NULL CHECK(revision>0 AND revision<=9007199254740991),
 creatorId BIGINT REFERENCES users(id) ON DELETE SET NULL,
 createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL
 )`
];

// Keep migration 6 immutable for installations that already have active links.
export const CUSTOMER_STATUS_OPTIONS_MIGRATION:readonly string[]=[
 `ALTER TABLE return_shares ADD COLUMN options JSONB NOT NULL DEFAULT '{"showProduct":true,"showUpdated":true,"showPublicNote":true}'::jsonb CHECK(jsonb_typeof(options)='object')`,
 `ALTER TABLE return_shares ADD COLUMN publishedComments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(publishedComments)='array' AND jsonb_array_length(publishedComments)<=20)`
];
