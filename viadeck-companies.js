/* ViaDeck Company BETA 0.8.0. Additive organizational space. Never modifies legacy shared/userData. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const firebaseJs='https://www.gstatic.com/firebasejs/10.14.1/';
const ROLE={owner:'Vlastník',driver:'Vodič',planner:'Plánovač',dispatcher:'Dispečer'};
const KINDS=['stops','routes','services'];
const state={db:null,auth:null,user:null,superadmin:false,links:[],companyId:'',member:null,company:null,platformData:{},invitation:null};
function n(tag,txt='',cls=''){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=txt;return e;}
function info(text,type=''){const x=$('status');x.textContent=text;x.className='notice '+type;}
function alertErr(e){const msg=e?.message||String(e);info('Chyba: '+msg,'error');}
function run(btn,fn){if(btn.disabled)return;btn.disabled=true;Promise.resolve().then(fn).catch(alertErr).finally(()=>btn.disabled=false);}
async function load(url){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=()=>no(Error('Nenačítala sa knižnica: '+url));document.head.append(s);});}
async function initFirebase(){await load('./viadeck-live-config.js');for(const file of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-database-compat.js'])await load(firebaseJs+file);const cfg=window.VIADECK_LIVE_CONFIG;if(!cfg?.databaseURL)throw Error('Chýba konfigurácia Firebase.');const app=firebase.apps.find(x=>x.name==='ViaDeckDriver')||firebase.initializeApp(cfg,'ViaDeckDriver');state.auth=firebase.auth(app);state.db=firebase.database(app);state.auth.onAuthStateChanged(u=>{void onUser(u).catch(alertErr);});}
const companyRef=cid=>state.db.ref('companies/'+cid);
function token(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
function sixDigit(){const arr=new Uint32Array(1);crypto.getRandomValues(arr);return String(100000+(arr[0]%900000));}
function emailOk(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=180;}
function userRole(member){return ROLE[member?.role]||'—';}
function currentCompany(){return state.company;}
function authorized(member,role){return state.superadmin||member?.role==='owner'||member?.role===role;}
function roleAllowed(member,role){return member?.role==='owner'||member?.role===role;}
function mkAction(text,callback,css='outline'){const b=n('button',text,css);b.type='button';b.onclick=()=>run(b,callback);return b;}
async function onUser(user){state.user=user;$('authbox').hidden=!!user;$('hub').hidden=!user;$('companyArea').hidden=true;$('platformArea').hidden=true;
 if(!user){info('Prihlás sa cez Google účet.');return;}
 $('signedEmail').textContent=user.email||'';
 const owner=await state.db.ref('owners/'+user.uid).once('value');state.superadmin=owner.val()===true;
 $('platformArea').hidden=!state.superadmin;
 if(state.superadmin)await refreshPlatform();
 await refreshMemberships();
 const m=location.hash.match(/^#join=([0-9]{6})\.([0-9a-f]{32})$/);
 if(m)await openInvitation(m[1],m[2]);
 info('Účet overený. Firemné dáta sú zatiaľ samostatné od pôvodného ViaDecku.','ok');
}
async function refreshMemberships(){
 const s=await state.db.ref('userCompanies/'+state.user.uid).once('value');const ids=Object.keys(s.val()||{}).filter(x=>/^\d{6}$/.test(x)).slice(0,100);
 const found=await Promise.all(ids.map(async id=>{try{const [ms,meta]=await Promise.all([companyRef(id).child('members/'+state.user.uid).once('value'),companyRef(id).child('meta').once('value')]);const member=ms.val();if(!member||member.status!=='active'||!meta.val())return null;return {id,member,meta:meta.val()};}catch{return null;}}));
 state.links=found.filter(Boolean);
 const host=$('companiesList');host.replaceChildren();if(!state.links.length)host.append(n('p','Zatiaľ nemáš priradenú spoločnosť. Pozvánku vytvára vlastník firmy alebo Superadmin.','muted'));
 for(const c of state.links){const tile=n('div','','tile');tile.append(n('strong',c.meta.name),n('small','ID '+c.id+' · '+userRole(c.member),'muted'));tile.append(mkAction('Otvoriť spoločnosť',()=>openCompany(c.id)));host.append(tile);}
 const selected=sessionStorage.getItem('vd-company-selected')||'';
 if(state.links.length===1)await openCompany(state.links[0].id);
 else if(state.links.some(x=>x.id===selected))await openCompany(selected);
}
async function openCompany(cid){let item=state.links.find(x=>x.id===cid);
 if(!item&&state.superadmin){const snap=await companyRef(cid).child('meta').once('value');if(snap.exists())item={id:cid,meta:snap.val(),member:null};}
 if(!item)throw Error('Nemáš prístup do zvolenej spoločnosti.');
 state.companyId=cid;state.company=item.meta;state.member=item.member;
 sessionStorage.setItem('vd-company-selected',cid);
 $('companyArea').hidden=false;$('companyTitle').textContent=item.meta.name+' · '+cid;$('companyRole').textContent=state.superadmin?'Superadmin':userRole(item.member);
 const links=$('companyLinks');links.replaceChildren();
 if(authorized(item.member,'planner'))links.append(linkCard('Plánovač','Komponent sa pripravuje','./viadeck-planner.html?company='+encodeURIComponent(cid),'calendar'));
 if(authorized(item.member,'dispatcher'))links.append(linkCard('Dispečing','Komponent sa pripravuje','./viadeck-dispatch.html?company='+encodeURIComponent(cid),'radio'));
 links.append(linkCard('ViaDeck','Pôvodné jazdy a služby zostávajú nezmenené','./index.html','bus'));
 const admin=authorized(item.member,'owner');$('companyAdmin').hidden=!admin;
 if(admin){await Promise.all([renderMembers(),renderCatalogCount()]);}
}
function linkCard(name,description,url){const a=document.createElement('a');a.className='tile';a.href=url;a.style.textDecoration='none';a.style.color='inherit';a.append(n('strong',name),n('small',description,'muted'));return a;}
async function createCompany(){if(!state.superadmin)throw Error('Iba Superadmin môže zakladať spoločnosti.');const name=$('newCompanyName').value.trim(),email=$('newCompanyOwner').value.trim().toLowerCase();if(name.length<2||name.length>90||!emailOk(email))throw Error('Vyplň názov firmy (2–90 znakov) a platný e-mail vlastníka.');
 let cid='';for(let i=0;i<14;i++){const candidate=sixDigit();try{
  // Uniqueness is enforced by .write: !data.exists() in Firebase rules.
  await companyRef(candidate).set({meta:{id:candidate,name,status:'active',createdBy:state.user.uid,createdAt:firebase.database.ServerValue.TIMESTAMP,updatedAt:firebase.database.ServerValue.TIMESTAMP}});cid=candidate;break;
 }catch(e){if(i===0){const probe=await companyRef(candidate).once('value').catch(()=>null);if(!probe?.exists())throw e;}}}
 if(!cid)throw Error('Nepodarilo sa rezervovať unikátne ID firmy.');
 const invite=await writeInvite(cid,email,'owner');
 $('platformResult').replaceChildren(n('p','Firma '+name+' vytvorená: '+cid,'notice ok'));showInviteLink($('platformResult'),cid,invite);
 await refreshPlatform();
}
async function writeInvite(cid,email,role){if(!ROLE[role])throw Error('Neplatná rola.');const id=token(),record={email,role,status:'pending',createdBy:state.user.uid,createdAt:firebase.database.ServerValue.TIMESTAMP,expiresAt:Date.now()+7*86400000};await companyRef(cid).child('invites/'+id).set(record);return id;}
function showInviteLink(host,cid,inv){const u=new URL('./viadeck-companies.html',location.href);u.hash='join='+cid+'.'+inv;const input=n('input');input.value=u.href;input.readOnly=true;host.append(n('p','Odkaz na pozvánku:','muted'),input,mkAction('Kopírovať odkaz',async()=>{await navigator.clipboard.writeText(u.href);info('Odkaz skopírovaný.','ok');}));}
async function createInvite(){if(!authorized(state.member,'owner')||!state.companyId)throw Error('Nemáš oprávnenie pozývať členov.');const email=$('inviteEmail').value.trim().toLowerCase(),role=$('inviteRole').value;if(!emailOk(email))throw Error('Zadaj platný e-mail Google účtu.');const id=await writeInvite(state.companyId,email,role);const host=$('inviteOutput');host.replaceChildren();showInviteLink(host,state.companyId,id);}
async function openInvitation(cid,id){const ref=companyRef(cid).child('invites/'+id);let data;try{data=(await ref.once('value')).val();}catch(e){throw Error('Pozvánka nie je prístupná tomuto účtu: '+(e?.message||e));}
 if(!data||data.status!=='pending'||Number(data.expiresAt)<Date.now()||data.email?.toLowerCase()!==state.user.email?.toLowerCase())throw Error('Pozvánka neexistuje alebo je určená inému Google účtu.');
 state.invitation={cid,id,data};$('joinbox').hidden=false;$('joinInfo').replaceChildren(n('p','Spoločnosť '+cid+' · rola '+userRole(data)+'.','muted'),n('p','Pozvaný účet: '+data.email));}
async function join(){const obj=state.invitation;if(!obj||!state.user)throw Error('Chýba pozvánka.');const {cid,id,data}=obj;
 const ref=companyRef(cid).child('members/'+state.user.uid);
 const member={email:state.user.email,displayName:state.user.displayName||state.user.email,role:data.role,status:'active',inviteId:id,permissions:{stops:false,routes:false,services:false},createdAt:firebase.database.ServerValue.TIMESTAMP};
 await ref.set(member);
 await state.db.ref('userCompanies/'+state.user.uid+'/'+cid).set(true);
 location.hash='';$('joinbox').hidden=true;state.invitation=null;await refreshMemberships();info('Pozvánka prijatá. Spoločnosť bola pridaná do tvojho účtu.','ok');
}
async function refreshPlatform(){if(!state.superadmin)return;const snap=await state.db.ref('companies').once('value');state.platformData=snap.val()||{};const host=$('platformCompanies');host.replaceChildren();for(const [id,rec] of Object.entries(state.platformData).sort(([a],[b])=>a.localeCompare(b))){const meta=rec.meta||{};const item=n('div','','item');const desc=n('div','','meta');desc.append(n('strong',meta.name||'Spoločnosť '+id),n('small','ID '+id+' · '+(meta.status||'—')+' · '+Object.keys(rec.members||{}).length+' členov'));item.append(desc,mkAction('Správa',()=>openCompany(id)));const ownerInvite=mkAction('Pozvať vlastníka',async()=>{const email=prompt('Google e-mail budúceho vlastníka:');if(!email)return;if(!emailOk(email.trim().toLowerCase()))throw Error('Neplatný e-mail.');const inv=await writeInvite(id,email.trim().toLowerCase(),'owner');const box=$('platformResult');box.replaceChildren();showInviteLink(box,id,inv);});item.append(ownerInvite);host.append(item);}}
async function renderMembers(){const snap=await companyRef(state.companyId).child('members').once('value');const all=snap.val()||{};const host=$('memberList');host.replaceChildren();if(!Object.keys(all).length)host.append(n('p','Zatiaľ žiadni pripojení členovia.','muted'));
 for(const [uid,m] of Object.entries(all)){const item=n('div','','item'),meta=n('div','','meta'),controls=n('div','','controls');meta.append(n('strong',m.displayName||m.email||uid),n('small',(m.email||'')+' · '+uid.slice(0,10)+'…'),n('small','Číslo vodiča: '+(m.driverNumber||'—')));const role=document.createElement('select');for(const [val,label] of Object.entries(ROLE))role.add(new Option(label,val));role.value=m.role||'driver';role.disabled=uid===state.user.uid&&m.role==='owner';role.onchange=()=>run(role,async()=>{await companyRef(state.companyId).child('members/'+uid+'/role').set(role.value);await renderMembers();});
 const status=document.createElement('select');for(const [val,label] of [['active','Aktívny'],['suspended','Pozastavený']])status.add(new Option(label,val));status.value=m.status;status.disabled=uid===state.user.uid&&m.role==='owner';status.onchange=()=>run(status,async()=>{await companyRef(state.companyId).child('members/'+uid+'/status').set(status.value);await renderMembers();});
 controls.append(role,status);if(m.role==='driver'){for(const k of KINDS){const label=n('label',' '+({stops:'Zastávky',routes:'Trasy',services:'Služby'}[k]),'small');const cb=document.createElement('input');cb.type='checkbox';cb.style.width='auto';cb.checked=m.permissions?.[k]===true;cb.onchange=()=>run(cb,async()=>{await companyRef(state.companyId).child('members/'+uid+'/permissions/'+k).set(cb.checked);});label.prepend(cb);controls.append(label);}}
 if(!m.driverNumber){controls.append(mkAction('Prideliť číslo vodiča',()=>assignDriverNumber(uid)));}
 item.append(meta,controls);host.append(item);}}
async function assignDriverNumber(uid){if(!authorized(state.member,'owner'))throw Error('Nedostatočné oprávnenie.');const check=await companyRef(state.companyId).child('members/'+uid).once('value');if(!check.exists()||check.val().status!=='active')throw Error('Používateľ nie je aktívny člen.');if(check.val().driverNumber)return;
 let code='';for(let i=0;i<16;i++){const candidate=sixDigit();try{await state.db.ref('driverCodes/'+candidate).set({companyId:state.companyId,uid,createdBy:state.user.uid,createdAt:firebase.database.ServerValue.TIMESTAMP});code=candidate;break;}catch(e){if(i===15)throw Error('Číslo vodiča nebolo pridelené. Skontroluj pravidlá Firebase a prístup firmy.');}}
 if(!code)throw Error('Nepodarilo sa rezervovať jedinečné číslo vodiča.');try{await companyRef(state.companyId).child('members/'+uid+'/driverNumber').set(code);}catch(e){await state.db.ref('driverCodes/'+code).remove().catch(()=>{});throw e;}
 await renderMembers();info('Číslo vodiča '+code+' bolo pridelené.','ok');}
async function renderCatalogCount(){const s=await companyRef(state.companyId).child('catalog').once('value');const data=s.val()||{};$('catalogCount').textContent=KINDS.map(k=>({stops:'Zastávky',routes:'Trasy',services:'Služby'}[k])+': '+Object.keys(data[k]||{}).length).join(' · ');}
async function exportCatalog(){const snap=await companyRef(state.companyId).child('catalog').once('value');const content={schema:'viadeck-company-archive-v1',companyId:state.companyId,companyName:state.company.name,exportedAt:new Date().toISOString(),data:{}};for(const k of KINDS){content.data[k]={};for(const [id,rec] of Object.entries(snap.val()?.[k]||{})){try{content.data[k][id]=JSON.parse(rec.json);}catch{throw Error('Nesprávny JSON v zázname '+k+'/'+id);}}}
 const u=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='ViaDeck-firma-'+state.companyId+'-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);
}
async function importCatalog(file){if(!file)return;const data=JSON.parse(await file.text());if(data.schema!=='viadeck-company-archive-v1'||!data.data)throw Error('Neplatný formát exportu spoločnosti.');
 const target=state.companyId;const totals=KINDS.map(k=>Object.keys(data.data[k]||{}).length);if(totals[0]>3000||totals[1]>300||totals[2]>150)throw Error('Import je príliš veľký.');
 const updates={};for(const k of KINDS){const records=data.data[k]||{};if(!records||typeof records!=='object'||Array.isArray(records))throw Error('Neplatná sekcia '+k);for(const [id,v] of Object.entries(records)){if(!id||id.length>130||/[.#$\[\]\/\x00-\x1f\x7f]/.test(id))throw Error('Neplatné ID '+id);if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Neplatný záznam '+id);const json=JSON.stringify(v);if(json.length>190000)throw Error('Príliš veľký záznam '+id);updates['catalog/'+k+'/'+id]={json,version:1,updatedAt:firebase.database.ServerValue.TIMESTAMP};}}
 if(!Object.keys(updates).length)throw Error('Import neobsahuje žiadne dáta.');if(!confirm('Importovať '+totals.join(' / ')+' položiek do firmy '+target+'? Existujúce záznamy s rovnakým ID budú prepísané. Predtým si vytvor export!'))return;
 await companyRef(target).update(updates);info('Import úspešný, aktualizované '+Object.keys(updates).length+' záznamy.','ok');await renderCatalogCount();
}
$('login').onclick=()=>state.auth?.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(alertErr);
$('newCompanyCreate').onclick=()=>run($('newCompanyCreate'),createCompany);
$('inviteCreate').onclick=()=>run($('inviteCreate'),createInvite);
$('acceptInvite').onclick=()=>run($('acceptInvite'),join);
$('cancelInvite').onclick=()=>{location.hash='';state.invitation=null;$('joinbox').hidden=true;};
$('exportCompany').onclick=()=>run($('exportCompany'),exportCatalog);
$('importCompany').onchange=e=>{const f=e.target.files?.[0];void importCatalog(f).catch(alertErr).finally(()=>{e.target.value='';});};
void initFirebase().catch(alertErr);
})();
