import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {html,t} from '../dist/public/i18n.js';
import {h,icon} from '../dist/public/ui.js';
import {masterName,masterValue,workflowStatuses} from '../dist/public/inventory-display.js';
import {renderTableControls,applyTablePreferences,readTablePreferences} from '../dist/public/table-preferences.js';
import {workspaceCalendarDay} from '../dist/public/workspace-insights.js';
import {matchesReturnScope,inventoryFilterOptions,preserveListScroll} from '../dist/public/design.js';
import {serialKey} from '../dist/shared/serial-number.js';

// Exercise the shipped list rendering/filter predicates. The page's unrelated
// table and saved-view renderers are boundaries; the count behavior stays real.
function list(initial={}){
 const statuses=[{id:1,name:'Eingegangen',active:true,tone:'received'},{id:2,name:'In Prüfung',active:true,tone:'checking'},{id:3,name:'In Bearbeitung',active:true,tone:'working'},{id:4,name:'Abgeschlossen',active:true,isClosed:true,tone:'done'}];
 const row=(id,status,reason,serialNumber,assignedUserId,extra={})=>({id,status,statusId:statuses.find(s=>s.name===status).id,reason,serialNumber,assignedUserId,productName:'Gerät',isClosed:status==='Abgeschlossen',statusTone:statuses.find(s=>s.name===status).tone,...extra});
 const state={view:'returns',products:[],returns:[row(1,'In Bearbeitung','Defekt','SN-ALPHA',1,{overdue:true}),row(2,'In Bearbeitung','Defekt','SN-BETA',null),row(3,'Abgeschlossen','Sonstiges','SN-GAMMA',1)],masterdata:{statuses},search:'',category:'',assignee:'',status:'',scope:'',session:{user:{id:1}},...initial};
 const ctx={can:()=>true,session:state.session},source=readFileSync(new URL('../dist/public/app.js',import.meta.url),'utf8');
 const counterNodes=['','Eingegangen','In Prüfung','In Bearbeitung','Abgeschlossen'].map((name,i)=>({dataset:{statusCount:name},textContent:String([3,0,0,2,1][i])}));
 const doc={querySelectorAll:()=>counterNodes,querySelector:()=>({innerHTML:''})};
 const segment=source.slice(source.indexOf('function listPage()'),source.indexOf('function currentFilter()'));
 const funcs=new Function('document','state','ctx','html','t','h','icon','labels','createButton','renderSavedFilters','currentFilter','statuses','statusName','masterName','masterValue','matchesReturnScope','filteredTable','assigneeFilter','renderTableControls','workspaceCalendarDay','serialKey','inventoryFilterOptions',segment+';return {listPage,filteredItems,refreshStatusCounts:typeof refreshStatusCounts==="function"?refreshStatusCounts:undefined};')(doc,state,ctx,html,t,h,icon,{returns:t('Retouren')},()=>'',()=>'',()=>({view:'returns'}),()=>workflowStatuses(state.masterdata.statuses,state.returns),value=>masterName(state.masterdata,'statuses',value),masterName,masterValue,matchesReturnScope,()=>'',()=> '',renderTableControls,workspaceCalendarDay,serialKey,inventoryFilterOptions);
 const refreshSource=source.slice(source.indexOf('function refreshRows('),source.indexOf('function bindContent()'));
 const refreshRows=new Function('document','state','t','filteredTable','bindActions','bindViews','setText','filteredItems','refreshStatusCounts','applyTablePreferences','readTablePreferences','ctx','closeRecordMenus','preserveListScroll',refreshSource+';return refreshRows;')(doc,state,t,()=>'',()=>{},()=>{},()=>{},funcs.filteredItems,funcs.refreshStatusCounts,()=>{},readTablePreferences,ctx,()=>{},preserveListScroll);
 function counts(){const page=String(funcs.listPage()),group=page.slice(page.indexOf('class="status-tabs"'),page.indexOf('<section class="panel list-panel"'));return [...group.matchAll(/<button\b[^>]*data-status="([^"]*)"[^>]*>[\s\S]*?<span[^>]*>(\d+)<\/span>/g)].map(match=>[match[1],Number(match[2])]);}
 return {state,...funcs,counts,refreshRows,counterNodes};
}
const zeros=[['',0],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',0],['Abgeschlossen',0]];
test('changing a dropdown updates the existing counters together with the table',()=>{
 const view=list();view.state.assignee='2';view.refreshRows();assert.deepEqual(view.counterNodes.map(node=>node.textContent),['0','0','0','0','0']);
 view.state.assignee='';view.state.search='SN-ALPHA';view.refreshRows();assert.deepEqual(view.counterNodes.map(node=>node.textContent),['1','0','0','1','0']);
});
test('an assignee without returns shows zero in every status counter',()=>{
 const view=list({assignee:'2'});assert.deepEqual(view.filteredItems(),[]);assert.deepEqual(view.counts(),zeros);
});
test('search, reason and assignment combine before the status counters are computed',()=>{
 const view=list({search:'SN-GAMMA',category:'Sonstiges',assignee:'mine'});assert.deepEqual(view.filteredItems().map(r=>r.id),[3]);assert.deepEqual(view.counts(),[['',1],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',0],['Abgeschlossen',1]]);
});

test('Unicode serial search applies the shared device comparison before status counts',()=>{
 const view=list({search:'STRASSE-001'});view.state.returns[0].serialNumber='Straße-001';
 assert.deepEqual(view.filteredItems().map(row=>row.id),[1]);
 assert.deepEqual(view.counts(),[['',1],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',1],['Abgeschlossen',0]]);
});
test('counters retain available status choices when a status or status scope is selected',()=>{
 const view=list({assignee:'1',status:'In Bearbeitung',scope:'overdue'});assert.deepEqual(view.filteredItems().map(r=>r.id),[1]);assert.deepEqual(view.counts(),[['',2],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',1],['Abgeschlossen',1]]);
});
test('unassigned filtering and clearing filters restore the corresponding totals',()=>{
 const view=list({assignee:'unassigned'});assert.deepEqual(view.counts(),[['',1],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',1],['Abgeschlossen',0]]);
 view.state.assignee='';assert.deepEqual(view.counts(),[['',3],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',2],['Abgeschlossen',1]]);
});
test('today-filtered status counts exclude open returns due on other days',()=>{
 const view=list({scope:'today'});view.state.returns[0].dueDate=workspaceCalendarDay();view.state.returns[1].dueDate='2000-01-01';
 assert.deepEqual(view.counts(),[['',1],['Eingegangen',0],['In Prüfung',0],['In Bearbeitung',1],['Abgeschlossen',0]]);
});
