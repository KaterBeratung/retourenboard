import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../dist/public/i18n.js';
const insights=await import('../dist/public/workspace-insights.js').catch(()=>({}));
const workflow=await import('../dist/public/workflow-actions.js');

test('action queues honor the return timezone, nullable assignment and closed state',()=>{
 assert.equal(typeof insights.workspaceActionModel,'function','Action queues are available');
 const rows=[{id:1,isClosed:false,assignedUserId:7,dueDate:'2026-10-14',nextStep:'Prüfen'},
  {id:2,isClosed:false,assignedUserId:null,dueDate:'2026-10-13'},
  {id:3,isClosed:true,assignedUserId:7,dueDate:'2026-10-14'},
  {id:4,isClosed:false,dueDate:'2026-02-30'},
  {id:5,isClosed:false,assignedUserId:8,dueDate:'2026-10-14'}];
 const model=insights.workspaceActionModel(rows,7,{now:Date.parse('2026-10-13T22:30:00Z'),timezone:'Europe/Berlin'});
 assert.equal(model.today,'2026-10-14');
 assert.deepEqual(model.groups.map(group=>group.items.map(row=>row.id)),[[1],[1,5],[2,4]]);
 assert.equal(rows[0].nextStep,'Prüfen');
 assert.equal(insights.workspaceActionModel(rows,undefined,{timezone:'bad',now:Date.parse('2026-10-13T22:30:00Z')}).groups[0].total,0);
});
test('analytics use documented completion time, omit missing or reversed dates and bucket in configured timezone',()=>{
 assert.equal(typeof insights.workspaceAnalytics,'function','Analytics are available');
 const rows=[
  {id:1,isClosed:true,createdAt:'2026-09-29T22:30:00Z',completedAt:'2026-09-30T22:30:00Z',reason:'Defekt'},
  {id:2,isClosed:true,createdAt:'2026-10-01T08:00:00Z',updatedAt:'2026-10-13T08:00:00Z',reason:'Defekt'},
  {id:3,isClosed:true,createdAt:'2026-10-10T08:00:00Z',completedAt:'2026-10-09T08:00:00Z',reason:'Falsch bestellt'},
  {id:4,isClosed:false,createdAt:'2026-10-11T08:00:00Z',completedAt:'2026-10-12T08:00:00Z'},
  {id:5,isClosed:true,createdAt:'bad',completedAt:null,reason:'Defekt'},
  {id:6,isClosed:true,createdAt:'2026-10-12T08:00:00Z',completedAt:'2026-10-20T08:00:00Z'}
 ];
 const analytics=insights.workspaceAnalytics(rows,{now:Date.parse('2026-10-13T08:00:00Z'),timezone:'Europe/Berlin'});
 assert.equal(analytics.averageCompletionDays,1);assert.equal(analytics.durationCount,1);assert.equal(analytics.closedWithoutCompletion,4);
 assert.equal(analytics.months.length,6);assert.equal(analytics.months.at(-1).key,'2026-10');
 assert.equal(analytics.months.at(-1).created,4);assert.equal(analytics.months.at(-1).completed,1);assert.equal(analytics.months.at(-2).created,1);
 assert.deepEqual(analytics.reasons[0],{reason:'Defekt',reasonId:null,count:3});
 assert.equal(insights.workspaceAnalytics([]).averageCompletionDays,null);
});
test('dashboard rendering provides escaped detail links and next steps in both languages',()=>{
 assert.equal(typeof insights.renderWorkspaceActions,'function');assert.equal(typeof insights.renderWorkspaceAnalytics,'function');
 const ctx={returns:[{id:4,returnNumber:'<unsafe>',productName:'Gerät',nextStep:'<img onerror=bad>',assignedUserId:7,isClosed:false}],session:{user:{id:7}},masterdata:{},config:{rules:{timezone:'Europe/Berlin'}}};
 const rendered=String(insights.renderWorkspaceActions(ctx)).replace(/<!--.*?-->/g,'');
 assert.match(rendered,/#returns\?detail=4/);assert.match(rendered,/Meine offenen Retouren/);assert.match(rendered,/&lt;img onerror=bad&gt;/);assert.doesNotMatch(rendered,/<img onerror/);
 try{setLanguage('en');assert.match(String(insights.renderWorkspaceActions(ctx)),/My open returns/);assert.match(String(insights.renderWorkspaceAnalytics(ctx)),/Average completion time/);}finally{setLanguage('de');}
});
test('status undo toast posts once, reloads, and does not cross an authentication change',async()=>{
 assert.equal(typeof workflow.offerStatusUndo,'function','Undo toast helper is available');
 const notifications=[],calls=[];let reloads=0;
 const ctx={session:{user:{id:7},csrfToken:'same'},unlocked:true,can:()=>true,toast:(message,action)=>notifications.push({message,action}),api:async(path,input)=>{calls.push({path,input});return {updated:1};},reload:async()=>reloads++};
 const result={undo:{token:'x'.repeat(43),expiresAt:new Date(Date.now()+12000).toISOString()}};
 workflow.offerStatusUndo(ctx,result,'Gespeichert');assert.equal(String(notifications[0].action.label),'Rückgängig');
 await notifications[0].action.onAction();await notifications[0].action.onAction();assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/returns/status/undo');assert.equal(reloads,1);
 workflow.offerStatusUndo(ctx,result,'Gespeichert');const oldAction=notifications.at(-1).action;ctx.authGeneration=1;await oldAction.onAction();assert.equal(calls.length,1);
});
test('overview previews two prioritized tasks while retaining the complete count and list route',()=>{
 const ctx={returns:[1,2,3].map(id=>({id,returnNumber:`TASK-${id}`,assignedUserId:7,isClosed:false})),session:{user:{id:7}},masterdata:{}};
 const rendered=String(insights.renderWorkspaceActions(ctx)).replace(/<!--.*?-->/g,'');
 assert.deepEqual([...rendered.matchAll(/href="#returns\?detail=(\d+)"/g)].map(match=>Number(match[1])),[1,2]);
 assert.match(rendered,/Meine offenen Retouren <span class="count-pill">3<\/span>/);
 assert.match(rendered,/#returns\?scope=open&amp;assignee=mine/);
});

test('monthly chart labels expose the same timezone-aware counts as the accessible data table',()=>{
 const ctx={returns:[
  {id:1,isClosed:true,createdAt:'2026-09-30T22:30:00Z',completedAt:'2026-10-03T10:00:00Z',reason:'Defekt'},
  {id:2,isClosed:true,createdAt:'2026-09-10T08:00:00Z',completedAt:'2026-10-02T10:00:00Z',reason:'Defekt'},
  {id:3,isClosed:false,createdAt:'2026-10-17T08:00:00Z',updatedAt:'2026-10-18T08:00:00Z',reason:'Sonstiges'}
 ],masterdata:{},config:{rules:{timezone:'Europe/Berlin'}},insightsNow:Date.parse('2026-10-18T12:00:00Z')};
 const markup=String(insights.renderWorkspaceAnalytics(ctx)).replace(/<!--.*?-->/g,'');
 assert.match(markup,/class="monthly-chart" role="img"/,'The monthly values have a chart representation');
 assert.match(markup,/Sept\. 26: Erfasst 1, Abgeschlossen 0/);
 assert.match(markup,/Okt\. 26: Erfasst 2, Abgeschlossen 2/);
 assert.match(markup,/<th scope="row">Sept\. 26<\/th><td>1<\/td><td>0<\/td>/);
 assert.match(markup,/<th scope="row">Okt\. 26<\/th><td>2<\/td><td>2<\/td>/);
 assert.equal((markup.match(/class="month-column"/g)??[]).length,6);
 const bars=[...markup.matchAll(/<rect class="month-bar (?:created|completed)-key"[^>]*height="([\d.]+)"/g)].map(match=>Number(match[1]));
 assert.equal(bars.length,12);
 assert.deepEqual(bars.slice(0,8),[0,0,0,0,0,0,0,0]);
 assert.equal(bars[9],0,'September has no completed returns');
 assert.ok(bars[8]>0&&bars[10]<=180);
 assert.equal(bars[10],bars[8]*2,'Two returns occupy twice the height of one return');
 assert.equal(bars[11],bars[10],'Equal created/completed counts have equal heights');
});

test('reason bars show shares of all returns rather than only the displayed top five and escape labels',()=>{
 const rows=['Defekt','Defekt','Defekt','A','B','C','D','<img src=x onerror=bad>'].map((reason,id)=>({id,reason}));
 const ctx={returns:rows,masterdata:{},insightsNow:Date.parse('2026-10-18T12:00:00Z')};
 const markup=String(insights.renderWorkspaceAnalytics(ctx)).replace(/<!--.*?-->/g,'');
 assert.match(markup,/class="reason-bar"/,'Reasons have a proportional bar representation');
 assert.match(markup,/Defekt: 3 \(37,5\s?%\)/,'Three of eight returns are 37.5%, even when only five reasons are shown');
 assert.match(markup,/&lt;img src=x onerror=bad&gt;/);
 assert.doesNotMatch(markup,/<img src=x/);
});

test('empty charts remain honest and their table and diagram descriptions are translated',()=>{
 const ctx={returns:[],masterdata:{},insightsNow:Date.parse('2026-10-18T12:00:00Z')};
 try{
  setLanguage('en');
  const markup=String(insights.renderWorkspaceAnalytics(ctx)).replace(/<!--.*?-->/g,'');
  assert.match(markup,/<summary>View data table<\/summary>/);
  assert.match(markup,/No returns in this period\./);
  assert.match(markup,/No documented completion yet/);
  assert.doesNotMatch(markup,/NaN|Infinity|height:[1-9][0-9.]*%/);
  assert.match(markup,/data-overview-card="completion" data-overview-empty="true"/);
  assert.match(markup,/data-overview-card="reasons" data-overview-empty="true"/);
  assert.match(markup,/data-overview-card="trend" data-overview-empty="true"/);
 }finally{setLanguage('de');}
});

test('monthly chart descriptions retain both languages for a language switch without rerendering',()=>{
 const ctx={returns:[{id:1,isClosed:false,createdAt:'2026-10-01T08:00:00Z'}],masterdata:{},insightsNow:Date.parse('2026-10-18T12:00:00Z')};
 const markup=String(insights.renderWorkspaceAnalytics(ctx));
 const chart=markup.match(/<div class="monthly-chart"[^>]+>/)?.[0];
 const encoded=chart?.match(/data-rb-i18n-aria-label="([^"]+)"/)?.[1];
 assert.ok(encoded,'In-place language changes need the chart description translation pair');
 const [de,en]=JSON.parse(decodeURIComponent(encoded));
 assert.match(de,/Okt\. 26: Erfasst 1, Abgeschlossen 0/);
 assert.match(en,/Oct 26: Created 1, Completed 0/);
});

test('chart geometry works with the application CSP without inline styles',()=>{
 const ctx={returns:[{id:1,isClosed:false,createdAt:'2026-10-01T08:00:00Z',reason:'Defekt'}],masterdata:{},insightsNow:Date.parse('2026-10-18T12:00:00Z')};
 const markup=String(insights.renderWorkspaceAnalytics(ctx));
 assert.doesNotMatch(markup,/\bstyle=/,'The app allows only external stylesheets; geometry must not depend on inline CSS');
 assert.match(markup,/<rect class="month-bar created-key"[^>]*height="45"/,'One of four scale units occupies a quarter of the 180-unit SVG');
 assert.match(markup,/<rect class="reason-bar"[^>]*width="100"/,'The only reason occupies its whole SVG track');
});
