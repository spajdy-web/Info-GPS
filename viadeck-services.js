/* ViaDeck 0.7.1 – services, shared duty editing, layovers and long-press controls.
   Loaded only after authenticated ViaDeck core. Does not run for public Live viewer. */
(()=>{
'use strict';
const KEY='gps-info-v071-services';
const SESSION_KEY='vd071-running-service-'+(window.VD_ACCESS?.uid||'unknown');
const $=id=>document.getElementById(id);
const CLONE=x=>JSON.parse(JSON.stringify(x));
const MAX_ENTRIES=80,MAX_SERVICES=100,MAX_BYTES=1400000;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(path)=>`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icoCalendar=icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m-3 4h3"/>');
function validHH(x){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(x||''));}
function mins(x){if(!validHH(x))return NaN;const [a,b]=x.split(':').map(Number);return a*60+b;}
function clock(ms){return new Date(ms).toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'});}
function dateLocal(ms=Date.now()){const d=new Date(ms),p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function startOfDay(d){const x=new Date(d+'T00:00:00');return x.getTime();}
function fmtMinutes(t){const seconds=Math.max(0,Math.ceil(t/1000));const total=Math.ceil(seconds/60);return total>=60?Math.floor(total/60)+' h '+String(total%60).padStart(2,'0')+' min':total+' min';}
function routeChoices(){return [...routes,...vdSharedRoutes].filter(r=>r&&r.steps?.length>=2);}
function copyRoute(r){if(!r)return null;const v=CLONE(r);if(!v||!v.id||!Array.isArray(v.steps)||v.steps.length<2)return null;return v;}
function normEntry(e){if(!e||!validHH(e.time)||!e.routeId)return null;
 const snap=copyRoute(e.routeSnapshot);if(!snap)return null;
 return {id:String(e.id||routeUID()).slice(0,100),routeId:String(e.routeId).slice(0,130),routeSnapshot:snap,time:e.time,day:Math.max(0,Math.min(3,Number(e.day)||0)),layoverMode:e.layoverMode==='library'?'library':'countdown',layoverDestinationId:typeof e.layoverDestinationId==='string'?e.layoverDestinationId:'',layoverDestinationSnapshot:e.layoverDestinationSnapshot&&typeof e.layoverDestinationSnapshot==='object'?CLONE(e.layoverDestinationSnapshot):null};
}
function normService(s){if(!s||!s.id)return null;return {id:String(s.id).slice(0,130),name:String(s.name||'Nepomenovaná služba').slice(0,80),items:(Array.isArray(s.items)?s.items:[]).slice(0,MAX_ENTRIES).map(normEntry).filter(Boolean),updatedAt:Number(s.updatedAt)||Date.now()};}
function normStore(x){return {items:(Array.isArray(x?.items)?x.items:[]).slice(0,MAX_SERVICES).map(normService).filter(Boolean),mode:x?.mode==='auto'?'auto':'manual'};}
let store;try{store=normStore(JSON.parse(localStorage.getItem(KEY)||'{}'));}catch{store=normStore({});}
let draft=null,draftShared=false,active=null,manualUntil=0,sharedEditRouteId='';
function writeStore(){const value=JSON.stringify(store);if(value.length>MAX_BYTES)throw Error('Knižnica služieb je príliš veľká. Zmenši počet trás v službách.');localStorage.setItem(KEY,value);}
function allServices(){const shared=(window.VD_ACCESS?.sharedServices||[]).map(normService).filter(Boolean);return [...store.items.map(s=>({...s,_shared:false})),...shared.map(s=>({...s,_shared:true}))];}
function serviceById(id){return allServices().find(s=>s.id===id)||null;}
function notify(t){if(typeof toast==='function')toast(t);else alert(t);}
function selectRoutes(){return routeChoices().map(r=>`<option value="${esc(r.id)}">${esc((r.line?r.line+' · ':'')+r.name+(vdSharedRoutes.some(x=>x.id===r.id)?' · spoločná':''))}</option>`).join('');}
function destOptions(selected){return `<option value="">— Vyber cieľ —</option>`+(selected&&!vdDestinations.some(d=>d.id===selected)?`<option value="${esc(selected)}" selected>Uložený cieľ (už nie je v knižnici)</option>`:'')+vdDestinations.map(d=>`<option value="${esc(d.id)}" ${d.id===selected?'selected':''}>${esc([d.line,d.text].filter(Boolean).join(' · ')||d.code||d.id)}</option>`).join('');}
function createUI(){
 if($('screen-services'))return;
 const style=document.createElement('style');style.textContent=`
 .vd071-list,.vd071-editor{max-width:1020px;margin:0 auto;padding:16px 13px 85px}
 .vd071-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:15px}
 .vd071-head h1,.vd071-head h2{margin:0;font-size:23px}
 .vd071-grid{display:grid;gap:12px}.vd071-card{background:#102a3b;border:1px solid #37566b;border-radius:14px;padding:15px;display:flex;flex-direction:column;gap:8px}
 .vd071-card h3{font-size:17px;margin:0}.vd071-muted{font-size:12px;color:#a9c1d1}.vd071-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
 .vd071-btn{cursor:pointer;border:1px solid #56869c;background:#143d51;color:#e4f9ff;padding:9px 12px;border-radius:10px;font-weight:700;font:inherit;min-height:39px}
 .vd071-btn.primary{background:#147d9b;color:white;border-color:#3bb4d3}.vd071-btn.warn{color:#ffa1a8;border-color:#974b59;background:#401c27}
 .vd071-btn:disabled{opacity:.45;cursor:not-allowed}.vd071-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}
 .vd071-field{display:block;color:#b3d2e1;font-size:12px;font-weight:650}.vd071-field input,.vd071-field select{display:block;width:100%;background:#0c1d29;color:#f3fbff;border:1px solid #51758c;border-radius:8px;padding:10px;margin-top:5px;min-height:42px;font:inherit;font-size:14px}
 .vd071-entry{background:#112e3c;border:1px solid #365567;border-radius:13px;padding:12px;margin:12px 0;display:grid;gap:11px}
 .vd071-entry-title{display:flex;justify-content:space-between;align-items:center;gap:8px}.vd071-entry-title strong{font-size:15px}
 .vd071-section{border-top:1px solid #315064;padding-top:13px;margin-top:15px}.vd071-note{padding:12px;background:#0b2333;border-left:3px solid #43c9d5;color:#bedde5;border-radius:7px;font-size:12px;line-height:1.6}
 #vd071-status{position:relative;margin:10px 0;padding:10px 12px;border:1px solid #3d7187;border-radius:9px;background:#10394c;color:#effaff}
 #vd071-layover{margin-top:5px;color:#ffd887;font-size:11px;font-weight:800;letter-spacing:.03em}
 .vd071-modal{max-width:min(96vw,470px);border:1px solid #52869a;border-radius:16px;background:#102635;color:#eaf8fc;padding:21px;max-height:90vh;overflow:auto}
 .vd071-modal::backdrop{background:#000b}.vd071-modal .vd071-field{margin-top:12px}
 @media(max-width:390px){.vd071-row{grid-template-columns:1fr}.vd071-head h1,.vd071-head h2{font-size:20px}.vd071-btn{padding:8px 9px}}
 `;document.head.append(style);
 const screen=document.createElement('section');screen.id='screen-services';screen.className='screen';screen.hidden=true;screen.innerHTML=`<div class="vd071-list" id="vd071-list"><div class="vd071-head"><div><div class="screen-eyebrow">KNIŽNICA SLUŽIEB</div><h1>Služby <span class="count-pill" id="vd071-count">0</span></h1></div><button type="button" class="vd071-btn primary" id="vd071-create">+ Pridať službu</button></div><p class="description">Služba spája uložené trasy s plánovanými časmi odchodov. Funguje aj offline, pretože si ukladá kópie použitých trás.</p><div class="vd071-grid" id="vd071-cards"></div></div><div class="vd071-editor" id="vd071-editor" hidden></div>`;
 const after=$('screen-settings');(after?.parentNode||document.querySelector('main')).insertBefore(screen,after||null);
 const nav=document.createElement('button');nav.className='navbtn';nav.dataset.screen='services';nav.type='button';nav.setAttribute('aria-label','Služby');nav.innerHTML=icoCalendar+'<span>Služby</span>';nav.querySelector('svg')?.setAttribute('style','width:23px;height:23px');
 document.querySelector('.bottomnav .nav-inner')?.insertBefore(nav,document.querySelector('[data-screen="settings"]'));
 nav.addEventListener('click',()=>switchScreen('services'));
 $('vd071-create').addEventListener('click',()=>openEditor());
 const details=document.createElement('details');details.className='panel settings-accordion';details.innerHTML=`<summary class="settings-summary"><span>Služby · automatické prepínanie trás</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="settings-contents"><p class="description">Pri manuálnom režime ViaDeck iba pripraví ďalšiu trasu. V automatickom režime ju aktivuje podľa plánovaného odchodu. Dlhé podržanie šípok funguje vždy.</p><label class="vd071-field">Režim prechodu<select id="vd071-mode"><option value="manual">Manuálne – prepína vodič</option><option value="auto">Automaticky – podľa časov služby</option></select></label></div>`;
 $('screen-settings')?.append(details);$('vd071-mode').value=store.mode;
 $('vd071-mode').addEventListener('change',e=>{store.mode=e.target.value==='auto'?'auto':'manual';try{writeStore();}catch(err){notify(err.message);}if(active)active.mode=store.mode;saveSession();notify('Režim služieb: '+(store.mode==='auto'?'automatický':'manuálny')+'.');});
 const modal=document.createElement('dialog');modal.id='vd071-start-dialog';modal.className='vd071-modal';modal.innerHTML=`<h2>Spustiť službu</h2><p class="vd071-muted" id="vd071-start-name"></p><label class="vd071-field">Dátum prvého odchodu<input type="date" id="vd071-start-date" required></label><label class="vd071-field">Začať od trasy<select id="vd071-start-index"></select></label><p class="vd071-note">Časy jednotlivých trás zostávajú podľa služby. Prechod automaticky alebo ručne určuje nastavenie vodiča.</p><div class="vd071-actions"><button class="vd071-btn primary" id="vd071-start-confirm" type="button">▶ Spustiť</button><button class="vd071-btn" id="vd071-start-cancel" type="button">Zrušiť</button></div>`;document.body.append(modal);
 $('vd071-start-cancel').onclick=()=>modal.close();$('vd071-start-confirm').onclick=()=>{const id=modal.dataset.serviceId,day=$('vd071-start-date').value,idx=Number($('vd071-start-index').value);try{launchService(serviceById(id),day,idx);modal.close();}catch(e){notify('Službu sa nepodarilo spustiť: '+e.message);}};
 const done=document.createElement('button');done.type='button';done.className='vd071-btn';done.id='vd071-manual-finish';done.textContent='✓ Trasa dokončená · prestoj';done.hidden=true;done.style.cssText='margin:7px 0 0;width:100%;font-size:12px';done.onclick=()=>{if(!active)return;routeCompleted=true;update();tick();saveSession();notify('Trasa označená ako dokončená.');};$('routeProgressFooter')?.after(done);
 const info=document.createElement('small');info.id='vd071-layover';info.hidden=true;$('routeDestinationDots')?.parentNode?.append(info);
 installLongPress();renderServices();
}
function renderServices(){if(!$('vd071-cards'))return;const items=allServices();$('vd071-count').textContent=items.length;const host=$('vd071-cards');host.replaceChildren();
 for(const s of items){const card=document.createElement('article');card.className='vd071-card';const name=document.createElement('h3');name.textContent=s.name+(s._shared?' · SPOLOČNÁ':'');
 const times=s.items.map(e=>e.time),meta=document.createElement('div');meta.className='vd071-muted';meta.textContent=s.items.length+' trás · '+(times.length?times[0]+' – '+times[times.length-1]:'bez trás')+(s._shared?' · spoločná databáza':' · osobná');
 const actions=document.createElement('div');actions.className='vd071-actions';
 const action=(label,fn,cls='')=>{const b=document.createElement('button');b.type='button';b.className='vd071-btn '+cls;b.textContent=label;b.onclick=fn;actions.append(b);return b;};
 action('▶ Spustiť',()=>prepareStart(s),'primary').disabled=!s.items.length;
 if(!s._shared)action('Upraviť',()=>openEditor(s));
 action('Kópia',()=>{if(store.items.length>=MAX_SERVICES)return notify('Limit '+MAX_SERVICES+' služieb.');const c=CLONE(s);c.id=routeUID();c.name=s.name+' · kópia';c.updatedAt=Date.now();delete c._shared;store.items.push(c);try{writeStore();renderServices();}catch(e){store.items.pop();notify(e.message);}});
 if(!s._shared){if(window.VD_ACCESS?.owner)action('Zverejniť',()=>publishService(s));action('×',()=>{if(active?.id===s.id)return notify('Najskôr ukonči aktívnu službu.');if(!confirm('Odstrániť osobnú službu „'+s.name+'“?'))return;store.items=store.items.filter(x=>x.id!==s.id);writeStore();renderServices();},'warn');}
 else if(window.VD_ACCESS?.owner)action('Spravovať',()=>location.assign('./viadeck-admin.html#vd-admin-services'));
 card.append(name,meta,actions);host.append(card);
 }
 if(!items.length){const empty=document.createElement('p');empty.className='vd071-note';empty.textContent='Zatiaľ nemáš žiadne služby. Vytvor prvú a pridaj existujúce trasy.';host.append(empty);}
}
function addEntry(){if(!draft)return;if(draft.items.length>=MAX_ENTRIES)return notify('Najviac '+MAX_ENTRIES+' trás v službe.');const r=routeChoices()[0];if(!r)return notify('Najprv vytvor aspoň jednu trasu.');let t='04:00',day=0;const prev=draft.items.at(-1);if(prev){const n=mins(prev.time)+15;t=String(Math.floor(n/60)%24).padStart(2,'0')+':'+String(n%60).padStart(2,'0');day=prev.day+(n>=1440?1:0);}draft.items.push({id:routeUID(),routeId:r.id,routeSnapshot:copyRoute(r),time:t,day,layoverMode:'countdown',layoverDestinationId:'',layoverDestinationSnapshot:null});renderEditor();}
function openEditor(s=null,shared=false){draft=s?normService(s):{id:routeUID(),name:'',items:[],updatedAt:Date.now()};draftShared=!!shared;
 if(!draft)return notify('Služba má neplatné údaje.');$('vd071-list').hidden=true;$('vd071-editor').hidden=false;switchScreen('services');renderEditor();}
function renderEditor(){if(!draft)return;const host=$('vd071-editor');host.replaceChildren();
 const head=document.createElement('div');head.className='vd071-head';head.innerHTML=`<div><div class="screen-eyebrow">${draftShared?'SPOLOČNÁ SLUŽBA':'OSOBNÁ SLUŽBA'}</div><h2>${esc(draft.name||'Nová služba')}</h2></div><button type="button" class="vd071-btn" id="vd071-close-editor">× Zavrieť</button>`;host.append(head);
 head.querySelector('button').onclick=closeEditor;
 const name=document.createElement('label');name.className='vd071-field';name.textContent='Názov / číslo služby';const input=document.createElement('input');input.value=draft.name;input.placeholder='Napr. 93/3';input.maxLength=80;input.addEventListener('input',()=>{draft.name=input.value;head.querySelector('h2').textContent=input.value||'Nová služba';});name.append(input);host.append(name);
 const hint=document.createElement('p');hint.className='vd071-note';hint.textContent='Každý riadok je jedno vykonanie existujúcej trasy. Čas patrí odchodu z prvej zastávky. Deň +1 používaj pri jazde po polnoci. Prestoj sa vypočíta medzi trasami.';host.append(hint);
 const entries=document.createElement('div');host.append(entries);const choices=selectRoutes();
 draft.items.forEach((e,i)=>{
  const item=document.createElement('article');item.className='vd071-entry';const opts=routeChoices().some(r=>r.id===e.routeId)?choices:choices+`<option value="${esc(e.routeId)}">${esc(e.routeSnapshot?.name||e.routeId)} · uložená kópia</option>`;
  item.innerHTML=`<div class="vd071-entry-title"><strong>${i+1}. Trasa · ${esc(e.routeSnapshot?.name||'')}</strong><div class="vd071-actions"><button class="vd071-btn" type="button" data-up aria-label="Posunúť vyššie">↑</button><button class="vd071-btn" type="button" data-down aria-label="Posunúť nižšie">↓</button><button class="vd071-btn warn" type="button" data-remove aria-label="Odobrať trasu">×</button></div></div><div class="vd071-row"><label class="vd071-field">Trasa<select data-route>${opts}</select></label><label class="vd071-field">Odchod<input data-time type="time" value="${esc(e.time)}"></label></div><div class="vd071-row"><label class="vd071-field">Deň služby<select data-day><option value="0">Deň 1</option><option value="1">Deň 2 (+24 h)</option><option value="2">Deň 3 (+48 h)</option></select></label><label class="vd071-field">Cieľ počas prestoja pred touto trasou<select data-layover><option value="countdown">Odchod o X minút</option><option value="library">Cieľ z knižnice</option></select></label></div><label class="vd071-field" data-dest-wrap>Cieľ z knižnice<select data-dest>${destOptions(e.layoverDestinationId)}</select></label><div class="vd071-muted">Prestojový cieľ končí 1:30 pred plánovaným odchodom. Potom nastúpi cieľ trasy.</div>`;
  entries.append(item);item.querySelector('[data-route]').value=e.routeId;item.querySelector('[data-day]').value=String(e.day);item.querySelector('[data-layover]').value=e.layoverMode;
  const destwrap=item.querySelector('[data-dest-wrap]');destwrap.hidden=e.layoverMode!=='library';
  const swap=to=>{if(to<0||to>=draft.items.length)return;[draft.items[i],draft.items[to]]=[draft.items[to],draft.items[i]];renderEditor();};
  item.querySelector('[data-up]').onclick=()=>swap(i-1);item.querySelector('[data-down]').onclick=()=>swap(i+1);
  item.querySelector('[data-remove]').onclick=()=>{draft.items.splice(i,1);renderEditor();};
  item.querySelector('[data-route]').onchange=ev=>{const r=routeChoices().find(r=>r.id===ev.target.value);if(!r)return;e.routeId=r.id;e.routeSnapshot=copyRoute(r);item.querySelector('strong').textContent=(i+1)+'. Trasa · '+r.name;};
  item.querySelector('[data-time]').onchange=ev=>{if(validHH(ev.target.value))e.time=ev.target.value;};
  item.querySelector('[data-day]').onchange=ev=>{e.day=Number(ev.target.value)||0;};
  item.querySelector('[data-layover]').onchange=ev=>{e.layoverMode=ev.target.value;destwrap.hidden=e.layoverMode!=='library';};
  item.querySelector('[data-dest]').onchange=ev=>{e.layoverDestinationId=ev.target.value;const d=vdDestinations.find(x=>x.id===e.layoverDestinationId);e.layoverDestinationSnapshot=d?CLONE(d):null;};
 });
 const actions=document.createElement('div');actions.className='vd071-actions vd071-section';const add=document.createElement('button');add.className='vd071-btn';add.textContent='+ Pridať trasu';add.onclick=addEntry;actions.append(add);
 const save=document.createElement('button');save.className='vd071-btn primary';save.textContent=draftShared?'Uložiť spoločnú službu':'Uložiť službu';save.onclick=saveEditor;actions.append(save);host.append(actions);
}
function closeEditor(){if(!confirm('Zavrieť editor? Neukladané zmeny sa zahodia.'))return;draft=null;draftShared=false;$('vd071-editor').hidden=true;$('vd071-list').hidden=false;renderServices();}
function validateService(s){if(!s.name.trim())throw Error('Zadaj názov služby.');if(!s.items.length)throw Error('Pridaj aspoň jednu trasu.');if(s.items.some(e=>!validHH(e.time)||!e.routeSnapshot||e.routeSnapshot.steps.length<2))throw Error('Niektorá trasa má neplatný čas alebo chýba.');
 let prev=-1,previousArrival=null;for(const e of s.items){const dep=e.day*1440+mins(e.time);if(dep<=prev)throw Error('Časy odchodov musia v zozname postupovať dopredu. Pri prechode cez polnoc nastav Deň 2.');
  if(previousArrival!==null&&dep<previousArrival)throw Error('Trasy sa časovo prekrývajú: ďalšia odchádza skôr, než predchádzajúca podľa zadaných jazdných dôb skončí.');
  let duration=0,complete=true;const route=e.routeSnapshot;
  for(let j=1;j<route.steps.length;j++){const t=typeof routeEffectiveTravel==='function'?routeEffectiveTravel(route,j):route.steps[j].travelMin;
    if(!Number.isFinite(t)){complete=false;break;}duration+=t+(j<route.steps.length-1?(Number(route.steps[j].dwellMin)||0):0);}
  previousArrival=complete?dep+duration:null;prev=dep;
 }
 const len=JSON.stringify(s).length;if(len>180000)throw Error('Služba obsahuje príliš veľa dát ('+Math.round(len/1000)+' kB). Skús rozdeliť službu alebo skrátiť geometrie trás.');
}
async function saveEditor(){if(!draft)return;const prepared=normService({...draft,name:draft.name.trim(),updatedAt:Date.now()});try{validateService(prepared);if(draftShared){if(!window.VD_ACCESS?.owner)throw Error('Na úpravu spoločnej služby nemáš oprávnenie.');await saveSharedService(prepared);notify('Spoločná služba uložená.');}
 else{const original=store.items.slice(),idx=store.items.findIndex(x=>x.id===prepared.id);if(idx<0)store.items.push(prepared);else store.items[idx]=prepared;try{writeStore();}catch(e){store.items=original;throw e;}notify('Osobná služba uložená.');}
 draft=null;draftShared=false;$('vd071-editor').hidden=true;$('vd071-list').hidden=false;renderServices();}catch(e){notify('Ukladanie: '+e.message);}}
async function saveSharedService(s){
 const stopIds=[...new Set(s.items.flatMap(e=>e.routeSnapshot.steps.map(st=>st.stopId)))];
 const existing=(await window.VD_ACCESS.database.ref('shared/stops').once('value')).val()||{};
 const unshared=stopIds.filter(id=>!existing[id]&&!seedOriginal.some(st=>st.id===id));
 if(unshared.length)throw Error('Služba používa '+unshared.length+' zastávok, ktoré nie sú spoločné. Najprv ich publikuj v Administrácii: '+unshared.slice(0,3).map(id=>findStop(id)?.name||id).join(', '));
 const ref=window.VD_ACCESS.database.ref('shared/services/'+s.id),old=(await ref.once('value')).val();if(old?.status==='archived')throw Error('Archivovanú službu treba najskôr zverejniť.');await ref.set({json:JSON.stringify(s),status:old?.status||'published',version:(Number(old?.version)||0)+1,updatedAt:firebase.database.ServerValue.TIMESTAMP});}
async function publishService(s){try{if(!window.VD_ACCESS?.owner)throw Error('Iba vlastník môže publikovať služby.');const copy=CLONE(s);copy.id='shared-service-'+routeUID();copy.updatedAt=Date.now();delete copy._shared;for(const e of copy.items)e.routeSnapshot.announcements=[];validateService(copy);if(!confirm('Publikovať službu „'+s.name+'“ všetkým schváleným vodičom? Vznikne nezávislá spoločná kópia.'))return;await saveSharedService(copy);notify('Spoločná služba publikovaná.');}catch(e){notify(e.message);}}
function prepareStart(s){if(!s?.items?.length)return;const d=$('vd071-start-dialog');d.dataset.serviceId=s.id;$('vd071-start-name').textContent=s.name+' · '+s.items.length+' trás';$('vd071-start-date').value=dateLocal();const sel=$('vd071-start-index');sel.replaceChildren();const now=Date.now(),base=startOfDay(dateLocal());let closest=0;
 s.items.forEach((x,i)=>{sel.append(new Option((i+1)+'. '+x.time+' · '+(x.routeSnapshot?.name||''),String(i)));const [yy,mm,dd]=dateLocal().split('-').map(Number),[hh,mn]=x.time.split(':').map(Number);const dep=new Date(yy,mm-1,dd+x.day,hh,mn).getTime();if(dep<=now)closest=i;});sel.value=String(closest);d.showModal();}
function schedule(s,day){const [y,m,d]=String(day).split('-').map(Number);if(!y||!m||!d)throw Error('Zadaj platný deň služby.');return s.items.map(e=>{const [h,n]=e.time.split(':').map(Number);return new Date(y,m-1,d+e.day,h,n,0,0).getTime();});}
function saveSession(){try{if(active)sessionStorage.setItem(SESSION_KEY,JSON.stringify({...active,manualUntil}));else sessionStorage.removeItem(SESSION_KEY);}catch(e){console.warn('[ViaDeck] Session save',e);}}
function launchService(s,day,idx=0){if(!s?.items?.length)throw Error('Služba je prázdna.');const starts=schedule(s,day);idx=Math.max(0,Math.min(s.items.length-1,idx));if(active&&!confirm('Ukončiť aktuálnu službu a spustiť „'+s.name+'“?'))return;if(currentActiveRoute()&&!active&&!confirm('Ukončiť samostatne spustenú trasu a začať službu?'))return;
 const snapshot=normService(s);active={id:s.id,name:s.name,items:snapshot.items,starts,idx:-1,mode:store.mode,autoHandled:idx-1,manualUntil:0,waiting:true,startedAt:Date.now()};
 switchTo(idx,'start');switchScreen('home');saveSession();notify('Služba „'+s.name+'“ spustená. Režim: '+(active.mode==='auto'?'automatický':'manuálny')+'.');}
function switchTo(i,why){if(!active||i<0||i>=active.items.length)return false;const entry=active.items[i];if(!entry.routeSnapshot?.steps?.length)return false;
 active.idx=i;active.autoHandled=Math.max(active.autoHandled,i);manualUntil=why==='manual'?Date.now()+3000:0;active.waiting=Date.now()<active.starts[i];
 if(state.mode==='demo')stopDemo();
 activeRouteId=entry.routeSnapshot.id;vdDestinationOverride=null;state.carouselTurnHold=null;activeRouteIndex=0;routeCompleted=false;activeRouteStartEpoch=active.starts[i];routeLastDelayMs=0;resetVoiceRouteState();resetStopProgress();resetRouteDetection();refreshActiveRouteMapLayer();
 update();saveSession();if(why!=='start')notify('Služba '+active.name+' · '+(i+1)+'/'+active.items.length+' · '+entry.routeSnapshot.name+'.');
 if(typeof vdLivePublish==='function'&&vdLive.session)void vdLivePublish(true);
 return true;
}
function currentRoute(id){return active&&active.items[active.idx]?.routeSnapshot?.id===id?active.items[active.idx].routeSnapshot:null;}
function beforeStandaloneRoute(){if(!active)return true;if(!confirm('Ukončiť službu „'+active.name+'“ a spustiť samostatnú trasu?'))return false;active=null;saveSession();resetLayover();return true;}
function beforeEndRoute(){if(!active)return true;if(!confirm('Ukončiť celú službu „'+active.name+'“?'))return false;active=null;saveSession();resetLayover();return true;}
function isWaiting(){return !!active?.waiting;}
function resetLayover(){const n=$('vd071-layover');if(n)n.hidden=true;const b=$('vd071-manual-finish');if(b)b.hidden=true;}
function arrowRouteJump(delta){if(!active)return false;const target=active.idx+delta;if(target<0||target>=active.items.length){notify('Si na '+(delta<0?'prvej':'poslednej')+' trase služby.');return true;}
 const passed=active.starts.reduce((n,t,i)=>t<=Date.now()?i:n,-1);active.autoHandled=Math.max(active.autoHandled,passed);return switchTo(target,'manual');}
function installLongPress(){for(const [id,delta] of [['routePrevBtn',-1],['routeNextBtn',1]]){const b=$(id);if(!b)continue;let timer=null,longFired=false;
 const start=e=>{if(!active||e.button>0)return;longFired=false;timer=setTimeout(()=>{timer=null;longFired=true;arrowRouteJump(delta);},800);};
 const cancel=()=>{if(timer){clearTimeout(timer);timer=null;}};
 b.addEventListener('pointerdown',start);['pointerup','pointercancel','pointerleave','blur'].forEach(k=>b.addEventListener(k,cancel));
 b.addEventListener('click',e=>{if(longFired){e.preventDefault();e.stopImmediatePropagation();longFired=false;}},true);
 b.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});
 b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){if(e.repeat||timer)return;start({button:0});}});b.addEventListener('keyup',cancel);
 }}
function canJump(delta){return !!active && active.idx+delta>=0 && active.idx+delta<active.items.length;}
function liveDestination(){if(!active)return null;const waiting=layover();return waiting?{name:waiting.name,line:waiting.line}:null;}
function layover(){if(!active)return null;const idx=active.idx,entry=active.items[idx],now=Date.now();if(!entry)return null;
 const nextIndex=active.waiting?idx:routeCompleted?idx+1:-1;
 if(nextIndex<0||nextIndex>=active.items.length)return null;
 const next=active.items[nextIndex],delta=active.starts[nextIndex]-now;
 const override=vdDestinationOverride?.routeId===currentActiveRoute()?.id?vdDestinationOverride:null;
 if(override)return {name:override.text||' ',line:override.line||'',status:'Ručne nastavený cieľ · odchod '+clock(active.starts[nextIndex]),time:delta};
 if(delta<=90000){const r=next.routeSnapshot;const dest=routeDestinationAt(r,0);return {name:dest?.name||dest?.stop?.name||r.name,line:dest?.line||r.line||'',status:delta>0?'Odchod '+clock(active.starts[nextIndex]):'Odchod naplánovaný '+clock(active.starts[nextIndex]),time:delta};}
 const d=next.layoverDestinationSnapshot||vdDestinations.find(x=>x.id===next.layoverDestinationId);
 if(next.layoverMode==='library'&&d?.text)return {name:d.text,line:d.line||'',status:'Odchod '+clock(active.starts[nextIndex]),time:delta};
 return {name:'ODCHOD O '+fmtMinutes(delta),line:'',status:'Plánovaný odchod '+clock(active.starts[nextIndex]),time:delta};
}
function tick(){if(!active)return;const now=Date.now();const done=$('vd071-manual-finish');if(done){done.hidden=active.waiting||routeCompleted||activeRouteIndex!==currentActiveRoute()?.steps.length-1;}
 if(active.waiting&&now>=active.starts[active.idx])active.waiting=false;
 if(active.mode==='auto'&&now>manualUntil){const due=[];for(let i=active.autoHandled+1;i<active.items.length;i++)if(active.starts[i]<=now)due.push(i);if(due.length){const n=due[due.length-1];if(n>active.idx){switchTo(n,'auto');}else active.autoHandled=Math.max(active.autoHandled,n);}}
 const lay=layover();const note=$('vd071-layover');if(!lay){if(note)note.hidden=true;return;}
 if(note){note.hidden=false;note.textContent=active.name+' · '+lay.status+(active.mode==='manual'?' · ďalšia trasa manuálne':'');}
 $('routeDestinationName').textContent=lay.name;$('routeDestinationLine').textContent=lay.line;$('routeDestinationLine').hidden=!lay.line;
 syncDestinationSign(lay.line,lay.name);$('routeDestinationTime').textContent=clock(active.starts[active.waiting?active.idx:active.idx+1]);$('routeDestinationEstimate').hidden=true;
}
function restore(){try{const snap=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(!snap)return;if(!Array.isArray(snap.items)||!Array.isArray(snap.starts)||snap.idx<0||snap.idx>=snap.items.length)return;const age=Date.now()-Number(snap.startedAt);if(age<0||age>48*3600000)return;
 active={...snap,items:snap.items.map(normEntry).filter(Boolean),mode:store.mode};manualUntil=Number(snap.manualUntil)||0;
 if(!active.items[active.idx]){active=null;return;}const e=active.items[active.idx];activeRouteId=e.routeSnapshot.id;activeRouteIndex=0;activeRouteStartEpoch=active.starts[active.idx];routeCompleted=!!snap.routeCompleted;resetRouteDetection();update();notify('Aktívna služba „'+active.name+'“ obnovená po aktualizácii stránky.');
 }catch(e){console.warn('[ViaDeck] Recovery failed',e);active=null;}}
function openHashEditor(){if(!window.VD_ACCESS?.owner)return;const m=location.hash.match(/^#vd-shared-(service|route)-edit=([^&]+)$/);if(!m)return;
 const id=decodeURIComponent(m[2]);history.replaceState(null,'',location.pathname+location.search);
 if(m[1]==='service'){window.VD_ACCESS.database.ref('shared/services/'+id).once('value').then(s=>{const record=s.val();if(!record?.json)throw Error('Spoločná služba chýba.');openEditor(JSON.parse(record.json),true);}).catch(e=>notify('Editor služby: '+e.message));return;}
 window.VD_ACCESS.database.ref('shared/routes/'+id).once('value').then(s=>{const record=s.val();if(!record?.json)throw Error('Trasa chýba.');const r=normalizeRoutes([JSON.parse(record.json)])[0];if(!r)throw Error('Neplatné údaje trasy.');sharedEditRouteId=id;
 if(!vdSharedRoutes.some(x=>x.id===id))vdSharedRoutes.push(r);
 switchScreen('route');openRouteEditor(id);$('routeEditorTitle').textContent='Upraviť spoločnú trasu';
 }).catch(e=>notify('Editor spoločnej trasy: '+e.message));}
async function saveSharedRouteDraft(current){if(!window.VD_ACCESS?.owner||!sharedEditRouteId)return;
 const id=sharedEditRouteId;if(id!==current.id)throw Error('ID spoločnej trasy sa zmenilo.');
 const r=normalizeRoutes([current])[0];if(!r||r.steps.length<2)throw Error('Neplatná trasa.');
 const sharedStops=(await window.VD_ACCESS.database.ref('shared/stops').once('value')).val()||{};
 const missing=[...new Set(r.steps.map(s=>s.stopId))].filter(id=>!sharedStops[id]&&!seedOriginal.some(s=>s.id===id));
 if(missing.length)throw Error('Pred úpravou spoločnej trasy publikuj aj '+missing.length+' jej osobných zastávok.');
 r.announcements=[];
 const ref=window.VD_ACCESS.database.ref('shared/routes/'+id),prev=(await ref.once('value')).val();if(!prev)throw Error('Spoločná trasa neexistuje.');
 await ref.set({...prev,json:JSON.stringify(r),version:(Number(prev.version)||0)+1,updatedAt:firebase.database.ServerValue.TIMESTAMP});
 sharedEditRouteId='';routeDraft=null;routeDraftDirty=false;$('routeEditor').hidden=true;$('routeBrowse').hidden=false;const i=vdSharedRoutes.findIndex(x=>x.id===id);if(i>=0)vdSharedRoutes[i]=r;renderRouteLibrary();notify('Spoločná trasa aktualizovaná (verzia '+((Number(prev.version)||0)+1)+').');location.assign('./viadeck-admin.html#vd-admin-routes');
}
function clearSharedEditor(){sharedEditRouteId='';}
function exportStore(){return CLONE(store);}
function importStore(raw){const next=normStore(raw);if(!Array.isArray(raw?.items))throw Error('Záloha služieb má neplatný formát.');const previous=store;store=next;try{writeStore();renderServices();}catch(e){store=previous;throw e;}}
window.VD071={currentRoute,renderServices,openEditor,sharedRouteEditId:()=>sharedEditRouteId,saveSharedRouteDraft,exportStore,importStore,beforeStandaloneRoute,beforeEndRoute,isWaiting,tick,canJump,arrowRouteJump,liveDestination,clearSharedEditor};
try{createUI();restore();setInterval(()=>{if(document.visibilityState==='visible'&&active){active.routeCompleted=routeCompleted;tick();if(Date.now()%10000<1000)saveSession();}},1000);setTimeout(openHashEditor,250);}catch(e){console.error('[ViaDeck 0.7.1] Inicializácia služieb',e);}
})();
