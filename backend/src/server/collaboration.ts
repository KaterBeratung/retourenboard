import {InputError} from '../shared/model.js';
import {hasPermission,type PermissionKey} from '../shared/permissions.js';
import {createChatAttachments} from './chat-attachments.js';
import type {IncomingMessage} from 'node:http';

type User={id:number;username:string;displayName:string;role:any;active:boolean;permissions:any};
type Channel={id:number;kind:string;visibility:string;name:string;ownerId:number|null;directKey:string|null;createdAt:string};
const missing=()=>new InputError('Unterhaltung nicht gefunden.',404);
function id(value:any):number{if(!Number.isSafeInteger(value)||value<1)throw new InputError('Ungültige Zuordnung.');return value;}
function text(value:any,max=4000):string{if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new InputError(`Bitte einen Text mit 1–${max} Zeichen eingeben.`);return value.trim();}

export function createCollaboration({store,users,preferences,now=Date.now,dataDir,limits}:{store:any;users:any;preferences:any;now?:()=>number;dataDir?:string;limits?:()=>{uploadMaxMb:number}}){
  const db=store.db;
  store.transaction(()=>db.exec(`
    CREATE TABLE IF NOT EXISTS chat_channels(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL CHECK(kind IN ('public','group','direct')),visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),name TEXT NOT NULL,ownerId INTEGER REFERENCES users(id),directKey TEXT UNIQUE,createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_members(channelId INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,lastReadId INTEGER NOT NULL DEFAULT 0,joined INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(channelId,userId));
    CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,channelId INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,authorId INTEGER NOT NULL REFERENCES users(id),text TEXT NOT NULL,mentions TEXT NOT NULL DEFAULT '[]',createdAt TEXT NOT NULL,editedAt TEXT,deleted INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS chat_messages_channel ON chat_messages(channelId,id);
    CREATE TABLE IF NOT EXISTS chat_message_pins(messageId INTEGER PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,pinnedById INTEGER REFERENCES users(id) ON DELETE SET NULL,pinnedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS return_comments(id INTEGER PRIMARY KEY AUTOINCREMENT,returnId INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,authorId INTEGER NOT NULL REFERENCES users(id),text TEXT NOT NULL,mentions TEXT NOT NULL DEFAULT '[]',createdAt TEXT NOT NULL,editedAt TEXT,deleted INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS return_comments_return ON return_comments(returnId,id);
    INSERT OR IGNORE INTO chat_channels(kind,visibility,name,directKey,createdAt) VALUES('public','public','Teamchat','public:team','${new Date(now()).toISOString()}');
  `));
  if(!db.prepare('PRAGMA table_info(chat_members)').all().some((r:any)=>r.name==='joined'))db.exec('ALTER TABLE chat_members ADD COLUMN joined INTEGER NOT NULL DEFAULT 1');
  const chatFiles=createChatAttachments({store,dataDir,limits});
  // SQLite's built-in LIKE only folds ASCII. Normalize Unicode as well so
  // German and English searches use the same literal, case-insensitive match.
  db.function('chat_text_matches',{deterministic:true},(value:string,query:string)=>Number(value.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())));
  const at=()=>new Date(now()).toISOString();
  const rate=new Map<number,{n:number;until:number}>();
  function right(user:User,key:PermissionKey){if(!user?.active||!hasPermission(user,key))throw new InputError('Du hast keine Berechtigung für diese Aktion.',403);}
  function accessible(user:User,c:Channel){return !!user?.active&&hasPermission(user,'chatRead')&&(c.visibility==='public'||!!db.prepare('SELECT 1 FROM chat_members WHERE channelId=? AND userId=?').get(c.id,user.id));}
  function channel(user:User,channelId:number):Channel{right(user,'chatRead');const c=db.prepare('SELECT * FROM chat_channels WHERE id=?').get(id(channelId));if(!c||!accessible(user,c))throw missing();return c;}
  function memberIds(channelId:number):number[]{return db.prepare('SELECT userId FROM chat_members WHERE channelId=? AND joined=1').all(channelId).map((m:any)=>m.userId);}
  function existingReturn(returnId:number){const ret=store.getReturn(id(returnId));if(!ret)throw new InputError('Retoure nicht gefunden.',404);return ret;}
  function basic(user:User){return {id:user.id,username:user.username,displayName:user.displayName,chatAvailable:hasPermission(user,'chatRead')};}
  function directory(){return users.list().filter((u:User)=>u.active).map(basic);}
  function participants(c:Channel){return memberIds(c.id).map((n:number)=>users.get(n)).filter(Boolean).map((u:User)=>({...basic(u),active:u.active}));}
  function canManage(user:User,c:Channel){return c.kind==='group'&&(c.ownerId===user.id&&hasPermission(user,'chatGroupsCreate')||c.visibility==='public'&&hasPermission(user,'chatModerate'));}
  function canPin(user:User,c:Channel,row:any){return !row.deleted&&(row.authorId===user.id&&hasPermission(user,'chatSend')||canManage(user,c)||c.visibility==='public'&&hasPermission(user,'chatModerate'));}
  function channelView(user:User,c:Channel){
    const last=db.prepare('SELECT * FROM chat_messages WHERE channelId=? ORDER BY id DESC LIMIT 1').get(c.id),seen=db.prepare('SELECT lastReadId FROM chat_members WHERE channelId=? AND userId=?').get(c.id,user.id)?.lastReadId??0;
    const unread=Number(db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE channelId=? AND id>? AND authorId<>? AND deleted=0').get(c.id,seen,user.id).n);
    const members=participants(c),other=c.kind==='direct'?members.find((u:any)=>u.id!==user.id):null;
    return {id:c.id,kind:c.kind,visibility:c.visibility,name:other?.displayName??c.name,ownerId:c.ownerId,members,joined:memberIds(c.id).includes(user.id),canManage:canManage(user,c),unread,lastMessage:last?{id:last.id,text:last.deleted?'Nachricht gelöscht':last.text?last.text.slice(0,180):chatFiles.list(last.id)[0]?.originalName??'',createdAt:last.createdAt}:null};
  }
  function activeMembers(values:any,ownerId:number){
    if(!Array.isArray(values)||values.length>49)throw new InputError('Eine Gruppe darf höchstens 50 Personen enthalten.');
    const ids=[...new Set([ownerId,...values.map(id)])];
    for(const n of ids){const u=users.get(n);if(!u?.active||!hasPermission(u,'chatRead'))throw new InputError('Alle Gruppenmitglieder benötigen ein aktives Konto mit Chat-Zugriff.');}
    return ids;
  }
  function mentions(value:string,allowed:(u:User)=>boolean){
    const found=new Map<number,any>(),all=users.list().filter((u:User)=>u.active&&allowed(u));
    for(const match of value.matchAll(/(?<![\w@])@([A-Za-z0-9._-]{3,64})/g)){
      const key=match[1].toLowerCase();const user=all.find((u:User)=>u.username.toLowerCase()===key)||all.find((u:User)=>u.username.toLowerCase()===key.replace(/[.-]+$/,''));
      if(user)found.set(user.id,{id:user.id,username:user.username,displayName:user.displayName});
    }
    return [...found.values()];
  }
  function notify(eventKey:string,userId:number,kind:string,href:string){
    if(!preferences.get('notifications').inApp)return;
    const title=kind==='returnMention'?'In einem Kommentar erwähnt':kind==='chatMention'?'Im Chat erwähnt':'Neue Chatnachricht';
    db.prepare('INSERT OR IGNORE INTO notifications(eventKey,userId,kind,title,message,href,createdAt) VALUES(?,?,?,?,?,?,?)').run(eventKey,userId,kind,title,kind==='returnMention'?'Ein Kommentar zu einer Retoure wartet auf dich.':'Öffne die Unterhaltung, um die Nachricht zu lesen.',href,at());
  }
  function notifyChat(user:User,c:Channel,messageId:number,refs:any[],normal:boolean){
    const targets=new Set<number>(normal&&c.kind!=='public'?memberIds(c.id):[]);
    for(const ref of refs)targets.add(ref.id);
    for(const target of targets){const u=users.get(target);if(target!==user.id&&accessible(u,c))notify(`chat:${c.id}:${messageId}:${target}`,target,refs.some(r=>r.id===target)?'chatMention':'chatMessage',`/chat#channel-${c.id}`);}
  }
  function limit(user:User){let item=rate.get(user.id);if(!item||item.until<now()){if(rate.size>1000)for(const [n,v]of rate)if(v.until<now())rate.delete(n);item={n:0,until:now()+60000};rate.set(user.id,item);}if(++item.n>120)throw new InputError('Zu viele Nachrichten. Bitte kurz warten.',429);}
  function messageView(user:User,row:any,moderate:boolean,write:PermissionKey){const author=users.get(row.authorId),chat=write==='chatSend',c=chat?db.prepare('SELECT * FROM chat_channels WHERE id=?').get(row.channelId):null;return {id:row.id,author:{id:row.authorId,username:author?.username??'',displayName:author?.displayName??'Gelöschtes Konto',active:!!author?.active},text:row.deleted?'':row.text,mentions:row.deleted?[]:JSON.parse(row.mentions),createdAt:row.createdAt,editedAt:row.editedAt,deleted:!!row.deleted,...(chat?{attachments:row.deleted?[]:chatFiles.list(row.id),pinned:!row.deleted&&!!db.prepare('SELECT 1 FROM chat_message_pins WHERE messageId=?').get(row.id),canPin:!!c&&canPin(user,c,row)}:{}),canEdit:!row.deleted&&!!row.text&&row.authorId===user.id&&hasPermission(user,write),canDelete:!row.deleted&&(row.authorId===user.id&&hasPermission(user,write)||moderate)};}
  function history(user:User,table:string,field:string,value:number,query:any,moderate:boolean,write:PermissionKey){
    const before=query.before===undefined?null:Number(query.before),after=query.after===undefined?null:Number(query.after);
    if(before!==null)id(before);if(after!==null&&(!Number.isSafeInteger(after)||after<0))throw new InputError('Ungültige Lesemarkierung.');
    if([before!==null,after!==null,query.ids!==undefined].filter(Boolean).length>1)throw new InputError('Bitte nur einen Verlaufsausschnitt anfragen.');
    const total=Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${field}=?`).get(value).n);
    if(query.ids!==undefined){
      if(typeof query.ids!=='string'||query.ids.length>4000||!/^\d+(,\d+)*$/.test(query.ids))throw new InputError('Ungültige Nachrichtenauswahl.');
      const ids=[...new Set(query.ids.split(',').map((n:string)=>id(Number(n))))];if(ids.length>200)throw new InputError('Zu viele Nachrichten ausgewählt.');
      const rows=db.prepare(`SELECT * FROM ${table} WHERE ${field}=? AND id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`).all(value,...ids);
      return {items:rows.map((r:any)=>messageView(user,r,moderate,write)),hasMore:false,total};
    }
    const rows=db.prepare(`SELECT * FROM ${table} WHERE ${field}=?${before!==null?' AND id<?':after!==null?' AND id>?':''} ORDER BY id ${after!==null?'ASC':'DESC'} LIMIT 51`).all(value,...(before!==null?[before]:after!==null?[after]:[])),page=rows.slice(0,50);
    return {items:(after!==null?page:page.reverse()).map((r:any)=>messageView(user,r,moderate,write)),hasMore:rows.length>50,total};
  }
  const api={
    directory,
    dispose:()=>chatFiles.dispose(),
    assertAttachmentAccess(user:User,attachmentId:number){const item=chatFiles.get(id(attachmentId)),message=db.prepare('SELECT * FROM chat_messages WHERE id=? AND deleted=0').get(item.messageId);if(!message)throw missing();channel(user,message.channelId);return item;},
    async readAttachment(user:User,attachmentId:number){return chatFiles.read(api.assertAttachmentAccess(user,attachmentId));},
    async uploadAttachment(channelId:number,req:IncomingMessage,getUser:()=>User,coordinate:(job:()=>any)=>Promise<any>|any){return chatFiles.upload(id(channelId),req,()=>{const user=getUser();channel(user,channelId);right(user,'chatSend');},item=>{const user=getUser(),c=channel(user,channelId);right(user,'chatSend');limit(user);const n=Number(db.prepare("INSERT INTO chat_messages(channelId,authorId,text,mentions,createdAt) VALUES(?,?,'','[]',?)").run(c.id,user.id,at()).lastInsertRowid);chatFiles.insert(n,item);notifyChat(user,c,n,[],true);return messageView(user,db.prepare('SELECT * FROM chat_messages WHERE id=?').get(n),c.visibility==='public'&&hasPermission(user,'chatModerate'),'chatSend');},coordinate);},
    channels(user:User){right(user,'chatRead');return db.prepare('SELECT * FROM chat_channels').all().filter((c:Channel)=>accessible(user,c)).map((c:Channel)=>channelView(user,c)).sort((a:any,b:any)=>(b.lastMessage?.id??0)-(a.lastMessage?.id??0)||a.id-b.id);},
    getChannel(user:User,channelId:number){const c=channel(user,channelId);return {...channelView(user,c),pins:api.pins(user,c.id).items};},
    createChannel(user:User,input:any){return store.transaction(()=>{
      right(user,'chatRead');let n:number;
      if(input.kind==='direct'){
        right(user,'chatSend');
        const target=users.get(id(input.userId));if(!target?.active||!hasPermission(target,'chatRead')||target.id===user.id)throw new InputError('Bitte eine andere Person mit aktivem Chat-Zugriff wählen.');
        const key=[user.id,target.id].sort((a,b)=>a-b).join(':');const existing=db.prepare('SELECT id FROM chat_channels WHERE directKey=?').get(key);if(existing)return api.getChannel(user,existing.id);
        n=Number(db.prepare("INSERT INTO chat_channels(kind,visibility,name,directKey,createdAt) VALUES('direct','private','Privatnachricht',?,?)").run(key,at()).lastInsertRowid);
        for(const person of [user.id,target.id])db.prepare('INSERT INTO chat_members(channelId,userId) VALUES(?,?)').run(n,person);
      }else if(input.kind==='group'){
        right(user,'chatGroupsCreate');const name=text(input.name,80),visibility=input.visibility??'private';if(!['public','private'].includes(visibility))throw new InputError('Ungültige Sichtbarkeit.');
        const ids=activeMembers(input.memberIds??[],user.id);n=Number(db.prepare("INSERT INTO chat_channels(kind,visibility,name,ownerId,createdAt) VALUES('group',?,?,?,?)").run(visibility,name,user.id,at()).lastInsertRowid);for(const person of ids)db.prepare('INSERT INTO chat_members(channelId,userId) VALUES(?,?)').run(n,person);
      }else throw new InputError('Bitte Privatnachricht oder Gruppe wählen.');
      return api.getChannel(user,n);
    });},
    updateChannel(user:User,channelId:number,input:any){return store.transaction(()=>{
      const c=channel(user,channelId);if(!canManage(user,c))throw new InputError('Nur die Gruppenleitung darf Mitglieder verwalten.',403);
      if(Object.hasOwn(input,'visibility')&&input.visibility!==c.visibility)throw new InputError('Die Sichtbarkeit einer bestehenden Gruppe bleibt unverändert.');
      if(Object.hasOwn(input,'name'))db.prepare('UPDATE chat_channels SET name=? WHERE id=?').run(text(input.name,80),c.id);
      if(Object.hasOwn(input,'memberIds')){const ids=activeMembers(input.memberIds,c.ownerId!);for(const n of memberIds(c.id))if(!ids.includes(n)){db.prepare('DELETE FROM chat_members WHERE channelId=? AND userId=?').run(c.id,n);db.prepare("DELETE FROM notifications WHERE userId=? AND kind IN ('chatMessage','chatMention') AND href=?").run(n,`/chat#channel-${c.id}`);}for(const n of ids)db.prepare('INSERT INTO chat_members(channelId,userId) VALUES(?,?) ON CONFLICT(channelId,userId) DO UPDATE SET joined=1').run(c.id,n);}
      return api.getChannel(user,c.id);
    });},
    join(user:User,channelId:number){const c=channel(user,channelId);if(c.kind!=='group'||c.visibility!=='public')throw missing();db.prepare('INSERT INTO chat_members(channelId,userId) VALUES(?,?) ON CONFLICT(channelId,userId) DO UPDATE SET joined=1').run(c.id,user.id);return api.getChannel(user,c.id);},
    leave(user:User,channelId:number){const c=channel(user,channelId);if(c.kind!=='group')throw new InputError('Nur Gruppen können verlassen werden.');if(c.ownerId===user.id)throw new InputError('Als Gruppenleitung kannst du die Gruppe nicht verlassen.');if(c.visibility==='public')db.prepare('UPDATE chat_members SET joined=0 WHERE channelId=? AND userId=?').run(c.id,user.id);else db.prepare('DELETE FROM chat_members WHERE channelId=? AND userId=?').run(c.id,user.id);db.prepare("DELETE FROM notifications WHERE userId=? AND kind IN ('chatMessage','chatMention') AND href=?").run(user.id,`/chat#channel-${c.id}`);return {ok:true};},
    messages(user:User,channelId:number,query:any={}){const c=channel(user,channelId);return history(user,'chat_messages','channelId',c.id,query,c.visibility==='public'&&hasPermission(user,'chatModerate'),'chatSend');},
    searchMessages(user:User,channelId:number,query:any={}){
      const c=channel(user,channelId),value=text(query.q,200),before=query.before===undefined?null:id(Number(query.before));
      if(query.after!==undefined||query.ids!==undefined)throw new InputError('Bitte nur einen Verlaufsausschnitt anfragen.');
      const found=db.prepare(`SELECT * FROM chat_messages WHERE channelId=? AND deleted=0 AND chat_text_matches(text,?)=1${before!==null?' AND id<?':''} ORDER BY id DESC LIMIT 51`).all(c.id,value,...(before!==null?[before]:[])),page=found.slice(0,50);
      return {items:page.map((row:any)=>messageView(user,row,c.visibility==='public'&&hasPermission(user,'chatModerate'),'chatSend')),hasMore:found.length>50,nextBefore:found.length>50?page.at(-1).id:null};
    },
    pins(user:User,channelId:number){const c=channel(user,channelId),rows=db.prepare('SELECT m.* FROM chat_messages m JOIN chat_message_pins p ON p.messageId=m.id WHERE m.channelId=? AND m.deleted=0 ORDER BY p.pinnedAt DESC,m.id DESC LIMIT 50').all(c.id);return {items:rows.map((row:any)=>messageView(user,row,c.visibility==='public'&&hasPermission(user,'chatModerate'),'chatSend'))};},
    pinMessage(user:User,messageId:number,input:any){return store.transaction(()=>{
      const row=db.prepare('SELECT * FROM chat_messages WHERE id=?').get(id(messageId));if(!row)throw missing();const c=channel(user,row.channelId);
      if(row.deleted)throw new InputError('Nachricht wurde bereits gelöscht.',409);
      if(!canPin(user,c,row))throw new InputError('Du darfst diese Nachricht nicht anheften.',403);
      if(!input||typeof input.pinned!=='boolean')throw new InputError('Ungültige Anheftung.');
      if(input.pinned){
        const existing=db.prepare('SELECT 1 FROM chat_message_pins WHERE messageId=?').get(row.id);
        if(!existing&&Number(db.prepare('SELECT COUNT(*) AS n FROM chat_message_pins p JOIN chat_messages m ON m.id=p.messageId WHERE m.channelId=? AND m.deleted=0').get(c.id).n)>=50)throw new InputError('Pro Unterhaltung können höchstens 50 Nachrichten angeheftet werden.');
        db.prepare('INSERT OR IGNORE INTO chat_message_pins(messageId,pinnedById,pinnedAt) VALUES(?,?,?)').run(row.id,user.id,at());
      }else db.prepare('DELETE FROM chat_message_pins WHERE messageId=?').run(row.id);
      return messageView(user,row,c.visibility==='public'&&hasPermission(user,'chatModerate'),'chatSend');
    });},
    postMessage(user:User,channelId:number,input:any){return store.transaction(()=>{const c=channel(user,channelId);right(user,'chatSend');const value=text(input.text),refs=mentions(value,u=>accessible(u,c));limit(user);const n=Number(db.prepare('INSERT INTO chat_messages(channelId,authorId,text,mentions,createdAt) VALUES(?,?,?,?,?)').run(c.id,user.id,value,JSON.stringify(refs),at()).lastInsertRowid);notifyChat(user,c,n,refs,true);return messageView(user,db.prepare('SELECT * FROM chat_messages WHERE id=?').get(n),false,'chatSend');});},
    changeMessage(user:User,messageId:number,input:any,remove=false){return store.transaction(()=>{const row=db.prepare('SELECT * FROM chat_messages WHERE id=?').get(id(messageId));if(!row)throw missing();const c=channel(user,row.channelId),own=row.authorId===user.id&&hasPermission(user,'chatSend'),moderate=c.visibility==='public'&&hasPermission(user,'chatModerate');if(!own&&!(remove&&moderate))throw new InputError('Du darfst diese Nachricht nicht ändern.',403);if(row.deleted)throw new InputError('Nachricht wurde bereits gelöscht.',409);if(remove){chatFiles.removeMessage(row.id);db.prepare('DELETE FROM chat_message_pins WHERE messageId=?').run(row.id);db.prepare('UPDATE chat_messages SET deleted=1,editedAt=? WHERE id=?').run(at(),row.id);}else{if(!row.text&&chatFiles.list(row.id).length)throw new InputError('Dateinachrichten können nur gelöscht werden.');const value=text(input.text),refs=mentions(value,u=>accessible(u,c));db.prepare('UPDATE chat_messages SET text=?,mentions=?,editedAt=? WHERE id=?').run(value,JSON.stringify(refs),at(),row.id);notifyChat(user,c,row.id,refs,false);}return messageView(user,db.prepare('SELECT * FROM chat_messages WHERE id=?').get(row.id),moderate,'chatSend');});},
    markRead(user:User,channelId:number,input:any){const c=channel(user,channelId),last=db.prepare('SELECT MAX(id) AS n FROM chat_messages WHERE channelId=?').get(c.id).n??0,target=input.messageId===undefined?last:id(input.messageId);if(target>last||target&& !db.prepare('SELECT 1 FROM chat_messages WHERE channelId=? AND id=?').get(c.id,target))throw new InputError('Ungültige Lesemarkierung.');db.prepare('INSERT INTO chat_members(channelId,userId,lastReadId,joined) VALUES(?,?,?,?) ON CONFLICT(channelId,userId) DO UPDATE SET lastReadId=MAX(lastReadId,excluded.lastReadId)').run(c.id,user.id,target,c.kind==='group'&&c.visibility==='public'?0:1);return {ok:true};},
    comments(user:User,returnId:number,query:any={}){existingReturn(returnId);return history(user,'return_comments','returnId',returnId,query,hasPermission(user,'commentsModerate'),'commentsCreate');},
    postComment(user:User,returnId:number,input:any){return store.transaction(()=>{right(user,'commentsCreate');existingReturn(returnId);const value=text(input.text),refs=mentions(value,()=>true);limit(user);const n=Number(db.prepare('INSERT INTO return_comments(returnId,authorId,text,mentions,createdAt) VALUES(?,?,?,?,?)').run(returnId,user.id,value,JSON.stringify(refs),at()).lastInsertRowid);for(const target of refs)if(target.id!==user.id)notify(`comment:${returnId}:${n}:${target.id}`,target.id,'returnMention',`/#returns?detail=${returnId}`);return messageView(user,db.prepare('SELECT * FROM return_comments WHERE id=?').get(n),hasPermission(user,'commentsModerate'),'commentsCreate');});},
    changeComment(user:User,returnId:number,commentId:number,input:any,remove=false){return store.transaction(()=>{existingReturn(returnId);const row=db.prepare('SELECT * FROM return_comments WHERE id=? AND returnId=?').get(id(commentId),returnId);if(!row)throw new InputError('Kommentar nicht gefunden.',404);const own=row.authorId===user.id&&hasPermission(user,'commentsCreate'),moderate=hasPermission(user,'commentsModerate');if(!own&&!(remove&&moderate))throw new InputError('Du darfst diesen Kommentar nicht ändern.',403);if(row.deleted)throw new InputError('Kommentar wurde bereits gelöscht.',409);if(remove)db.prepare('UPDATE return_comments SET deleted=1,editedAt=? WHERE id=?').run(at(),row.id);else{const value=text(input.text),refs=mentions(value,()=>true);db.prepare('UPDATE return_comments SET text=?,mentions=?,editedAt=? WHERE id=?').run(value,JSON.stringify(refs),at(),row.id);for(const target of refs)if(target.id!==user.id)notify(`comment:${returnId}:${row.id}:${target.id}`,target.id,'returnMention',`/#returns?detail=${returnId}`);}return messageView(user,db.prepare('SELECT * FROM return_comments WHERE id=?').get(row.id),moderate,'commentsCreate');});},
    pruneNotifications(user:User){for(const item of db.prepare("SELECT id,href FROM notifications WHERE userId=? AND kind IN ('chatMessage','chatMention','returnMention')").all(user.id)){let allowed=false;const chat=item.href.match(/^\/chat#channel-(\d+)$/),ret=item.href.match(/^\/#returns\?detail=(\d+)$/);if(chat){const c=db.prepare('SELECT * FROM chat_channels WHERE id=?').get(Number(chat[1]));allowed=!!c&&accessible(user,c);}else if(ret)allowed=!!db.prepare('SELECT 1 FROM returns WHERE id=?').get(Number(ret[1]));if(!allowed)db.prepare('DELETE FROM notifications WHERE id=?').run(item.id);}}
  };
  return api;
}
