const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function renderWebsiteLegal(source,configuration){
 if(!configuration||typeof configuration!=='object'||Array.isArray(configuration))throw Error('Website legal configuration must be an object');
 const fields={};
 for(const key of ['operatorName','email','hostingProvider','hostingCountry','logRetention','additionalLegalInformation']){
  const value=configuration[key]??'';if(typeof value!=='string'||value.length>4000)throw Error('Invalid website legal field: '+key);fields[key]=value.trim();
 }
 const address=configuration.address??[];
 if(!Array.isArray(address)||address.length>8||address.some(line=>typeof line!=='string'||line.length>300))throw Error('Invalid website legal address');
 const lines=address.map(line=>line.trim()).filter(Boolean);
 if(fields.email&&!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fields.email))throw Error('Invalid website legal email');
 const complete=Boolean(fields.operatorName&&lines.length&&fields.email&&fields.hostingProvider&&fields.hostingCountry&&fields.logRetention);
 const missing='<span>Noch nicht hinterlegt.</span>';
 const operator=fields.operatorName?`<p>${escape(fields.operatorName)}</p>`:missing;
 const addressHtml=lines.length?`<p>${lines.map(escape).join('<br>')}</p>`:missing;
 const email=fields.email?`<p><a href="mailto:${escape(fields.email)}">${escape(fields.email)}</a></p>`:missing;
 const replacements={
  '@@LEGAL_STATUS@@':complete?'':'<aside class="legal-draft"><strong>Entwurf – Betreiberangaben fehlen.</strong><p>Diese Angaben müssen vor der Veröffentlichung mit dem tatsächlichen Betreiber und Hosting vervollständigt werden.</p></aside>',
  '@@OPERATOR@@':operator+addressHtml+email,
  '@@HOSTING@@':fields.hostingProvider&&fields.hostingCountry?`<p>${escape(fields.hostingProvider)} · ${escape(fields.hostingCountry)}</p>`:missing,
  '@@LOG_RETENTION@@':fields.logRetention?`<p>${escape(fields.logRetention)}</p>`:missing,
  '@@ADDITIONAL_LEGAL@@':fields.additionalLegalInformation?`<p class="legal-lines">${escape(fields.additionalLegalInformation)}</p>`:'',
 };
 for(const [key,value]of Object.entries(replacements))source=source.replaceAll(key,value);
 return {html:source,complete};
}
