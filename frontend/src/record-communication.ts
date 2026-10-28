import {html} from './i18n.js';
import {icon} from './ui.js';
import {renderComments} from './comments.js';
import {renderCustomerShareControls,bindCustomerShareControls,type RecordKind} from './customer-status.js';
export function mountRecordCommunication(ctx:any,kind:RecordKind,item:any,host:HTMLElement){
 host.className='record-communication detail-section';host.innerHTML=String(html`<div class="record-communication-heading"><h3>${icon('chat')}Kommentare & Kundenstatus</h3><p class="muted">Kommentare bleiben intern, bis du sie ausdrücklich freigibst.</p></div><div data-record-comments></div><div data-record-sharing>${renderCustomerShareControls(ctx,kind)}</div>`);
 const sharing=bindCustomerShareControls(ctx,kind,item,host.querySelector('[data-record-sharing]'));
 renderComments(ctx,item.id,host.querySelector('[data-record-comments]'),{kind,onPaint:(log,rows)=>{void sharing.onComments(log,rows);}});
}
