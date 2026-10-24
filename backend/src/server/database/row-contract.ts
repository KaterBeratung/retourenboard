import {TABLE_CONTRACTS} from './schema.js';
// PostgreSQL identifiers are unquoted lowercase; the API retains established field names.
const aliases=['providerLabel','catalogPriceCents','reopenReason','productName','imageVersion','imageName','authorName','authorUsername','authorActive','ownerName','actorName','assignedName','pinnedByName','pinnedAt','memberCount','unreadCount','lastMessageId','lastMessageAt','lastMessageText','lastMessageAuthorId','latestId','administratorCount','mfaEnabled','mfaRequired','eventId','fromStatus','toStatus','fromStatusId','toStatusId','commentId','attachmentId'];
const names=new Map([...TABLE_CONTRACTS.flatMap(t=>t.columns.map(c=>c.name)),...aliases].map(name=>[name.toLowerCase(),name]));
export function normalizeDatabaseRow<Row>(row:Record<string,unknown>):Row{return Object.fromEntries(Object.entries(row).map(([name,value])=>[names.get(name)??name,value])) as Row;}
