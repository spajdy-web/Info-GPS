/* ViaDeck 0.6.0 – Google login / scoped data / invitation / sync.
 * Loaded AFTER the inert ViaDeck core. No app code executes until access is granted.
 * Browser-side access gate is UX only: database rules provide authorization.
 */
(() => {
'use strict';
const KEYS={
 'gps-info-v02-stops':'stops',
 'gps-info-v02-settings':'settings',
 'gps-info-v03-edits':'edits',
 'gps-info-v03-hidden':'hidden',
 'gps-info-v04-dpb-gtfs':'gtfs',
 'gps-info-v04-gtfs-meta':'gtfsMeta',
 'gps-info-v05-routes':'routes',
 'gps-info-v054-voice-library':'voice',
 'gps-info-v055-open-settings':'accordion'
};
const $=id=>document.getElementById(id);
const oldGet=Storage.prototype.getItem,oldSet=Storage.prototype.setItem,oldRemove=Storage.prototype.removeItem;
let activeUid='',database=null,auth=null,app=null,syncReady=false,importLegacy=false;
let syncTimers=new Map(),stamps={},cloudCache={},sessionActive=false;
const appRoot=document.createElement('div');appRoot.id='vd-access-root';document.body.appendChild(appRoot);
document.body.classList.add('vd-access-locked');
const style=document.createElement('style');style.textContent=`
body.vd-access-locked > :not(#vd-access-root):not(script):not(style){visibility:hidden!important}
#vd-access-root{position:fixed;z-index:2147483645;inset:0;overflow:auto;background:radial-gradient(ellipse at top right,#123f58,#07131e 60%);color:#eaf6ff;font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;padding:18px}
#vd-access-root[hidden]{display:none!important}
.vd-box{width:min(100%,450px);border:1px solid #3b6479;border-radius:23px;background:#102b3bea;padding:25px 23px;box-shadow:0 22px 70px #0008}
.vd-eyebrow{letter-spacing:2px;color:#83d6e9;font-size:11px;font-weight:800}.vd-box h1{font-size:28px;margin:13px 0}.vd-box p{color:#b0c9d8;line-height:1.55;font-size:14px}.vd-btn{width:100%;background:#258fe6;color:#fff;border:0;border-radius:12px;padding:14px;font:750 14px system-ui;cursor:pointer;margin:8px 0}.vd-btn.alt{background:#213e50;border:1px solid #60819a}.vd-btn:disabled{opacity:.5}.vd-msg{white-space:pre-wrap;background:#0a1d29;border:1px solid #416077;border-radius:12px;padding:12px;color:#c9e1f0;font-size:13px;margin:12px 0}.vd-mini{font-size:11px;color:#8cabbc}.vd-chips{display:flex;gap:8px;margin-top:17px}.vd-chips a,.vd-chips button{color:#c5ebff;text-decoration:none;background:#1d4560;border:1px solid #376f92;border-radius:9px;padding:8px 11px;font:600 12px system-ui}
#vd-account-toolbar{position:fixed;z-index:1700;right:12px;top:63px;display:flex;gap:5px;align-items:center;background:#091e29ed;border:1px solid #37617b;border-radius:11px;padding:5px;box-shadow:0 4px 24px #0005}
#vd-account-toolbar button,#vd-account-toolbar a{font:650 11px system-ui;text-decoration:none;color:#def5fd;background:#1a3c51;border:0;border-radius:8px;padding:7px;cursor:pointer}
`;
document.head.appendChild(style);
function ui(title,message,buttons=[]){
 appRoot.replaceChildren();const panel=document.createElement('section');panel.className='vd-box';
 const eyebrow=document.createElement('div');eyebrow.className='vd-eyebrow';eyebrow.textContent='VIADECK · PRÍSTUP VODIČA';
 const heading=document.createElement('h1');heading.textContent=title;
 const para=document.createElement('p');para.textContent=message;
 panel.append(eyebrow,heading,para);
 for(const b of buttons){const x=document.createElement('button');x.className='vd-btn'+(b.secondary?' alt':'');x.textContent=b.label;x.addEventListener('click',b.run);panel.append(x);}
 appRoot.append(panel);return panel;
}
function notice(message){const old=$('vd-auth-status');if(old)old.remove();const el=document.createElement('div');el.id='vd-auth-status';el.className='vd-msg';el.textContent=message;appRoot.firstElementChild?.append(el);}
async function loadScript(url){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=()=>no(new Error('Nepodarilo sa načítať: '+url));document.head.append(s);});}
async function setup(){
 if(!window.VIADECK_LIVE_CONFIG)await loadScript('./viadeck-live-config.js');
 const cfg=window.VIADECK_LIVE_CONFIG;
 if(!cfg||!cfg.apiKey||!cfg.databaseURL)throw Error('V repozitári chýba konfigurácia viadeck-live-config.js.');
 if(!window.firebase?.auth){await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');await loadScript('https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js');}
 app=window.firebase.apps.find(a=>a.name==='ViaDeckDriver')||window.firebase.initializeApp(cfg,'ViaDeckDriver');
 auth=window.firebase.auth(app);database=window.firebase.database(app);
 await auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
}
async function digestEmail(email){const bytes=new TextEncoder().encode(email.toLowerCase().trim());const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
function isGoogle(user){return !!user?.providerData?.some(p=>p.providerId==='google.com') && !!user.emailVerified;}
async function googleSignIn(){try{notice('Otváram prihlásenie Google…');await auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider());}catch(e){notice('Prihlásenie sa nepodarilo: '+(e?.message||String(e))+'\nSkontroluj povolenú doménu spajdy-web.github.io vo Firebase Authentication → Settings → Authorized domains.');}}
async function googleSignOut(){document.body.classList.add('vd-access-locked');appRoot.hidden=false;await auth.signOut();location.reload();}
function cacheKey(uid){return 'vd060-access-cache-'+uid;}
async function readAuthorization(user){
 try{
  const [owner,membership]=await Promise.all([database.ref('owners/'+user.uid).once('value'),database.ref('members/'+user.uid).once('value')]);
  if(owner.val()===true)return {allowed:true,owner:true};
  if(membership.val()?.status==='active' && membership.val()?.email===user.email)return {allowed:true,owner:false};
  return {allowed:false,owner:false,status:membership.val()?.status};
 }catch(e){
  const last=JSON.parse(oldGet.call(localStorage,cacheKey(user.uid))||'null');
  if(navigator.onLine===false&&last?.expires>Date.now()&&last?.email===user.email)return {allowed:true,owner:!!last.owner,offline:true};
  throw e;
 }
}
async function acceptInvite(user){
 const key=await digestEmail(user.email),snap=await database.ref('invites/'+key).once('value');const invite=snap.val();
 if(!invite||invite.enabled!==true||invite.email!==user.email)return false;
 await database.ref('members/'+user.uid).set({email:user.email,displayName:String(user.displayName||'').slice(0,100),role:'driver',status:'active',inviteKey:key,createdAt:window.firebase.database.ServerValue.TIMESTAMP});
 return true;
}
function rawScoped(key){return 'vd060:'+activeUid+':'+key;}
function installLocalStorageScope(){
 if(Storage.prototype.getItem.__viaDeckScope)return;
 const scope=(self,key)=>self===window.localStorage&&typeof key==='string'&&key.startsWith('gps-info-v')&&activeUid;
 const get=function(k){return oldGet.call(this,scope(this,k)?rawScoped(k):k);};get.__viaDeckScope=true;
 Storage.prototype.getItem=get;
 Storage.prototype.setItem=function(k,v){if(scope(this,k)){
    oldSet.call(this,rawScoped(k),v);
    if(syncReady&&Object.hasOwn(KEYS,k)){stamps[KEYS[k]]=Date.now();saveStamps();pushKey(KEYS[k],String(v));}
   }else oldSet.call(this,k,v);};
 Storage.prototype.removeItem=function(k){if(scope(this,k)){
    oldRemove.call(this,rawScoped(k));
    if(syncReady&&Object.hasOwn(KEYS,k)){stamps[KEYS[k]]=Date.now();saveStamps();pushKey(KEYS[k],'null');}
   }else oldRemove.call(this,k);};
}
function saveStamps(){oldSet.call(localStorage,'vd060-stamps-'+activeUid,JSON.stringify(stamps));}
function readScoped(key){return oldGet.call(localStorage,rawScoped(key));}
function writeScoped(key,value){oldSet.call(localStorage,rawScoped(key),String(value));}
function localExists(){return Object.keys(KEYS).some(k=>readScoped(k)!==null);}
function legacyExists(){return Object.keys(KEYS).some(k=>oldGet.call(localStorage,k)!==null);}
function askMigration(){return new Promise(ok=>{
  const panel=ui('Našli sa pôvodné dáta','Na tomto telefóne existujú trasy a zastávky z predchádzajúcej verzie. Preniesť ich do práve prihláseného účtu? Nezmažeme ich pôvodnú kópiu.');
  for(const [label,yes] of [['Preniesť moje údaje',true],['Začať s čistým účtom',false]]){
   const b=document.createElement('button');b.className='vd-btn'+(yes?'':' alt');b.textContent=label;b.onclick=()=>ok(yes);panel.append(b);
  }
 });}
function pushKey(key,text){
 if(!database||!activeUid)return;
 clearTimeout(syncTimers.get(key));syncTimers.set(key,setTimeout(async()=>{
  try{await database.ref('userData/'+activeUid+'/'+key).set({content:text,updatedAt:stamps[key]||Date.now()});}
  catch(e){console.warn('[ViaDeck] Synchronizácia odložená',key,e?.message||e);}
 },1400));
}
async function initStorage(){
 stamps=JSON.parse(oldGet.call(localStorage,'vd060-stamps-'+activeUid)||'{}');
 installLocalStorageScope();
 if(!oldGet.call(localStorage,'vd060-migration-'+activeUid)&&!localExists()&&legacyExists()){
  const yes=await askMigration();
  if(yes)for(const [localKey,cloudKey] of Object.entries(KEYS)){const val=oldGet.call(localStorage,localKey);if(val!==null){writeScoped(localKey,val);stamps[cloudKey]=Date.now();}}
  oldSet.call(localStorage,'vd060-migration-'+activeUid,yes?'imported':'skipped');saveStamps();
 }
 let remote;
 try{remote=(await database.ref('userData/'+activeUid).once('value')).val()||{};}catch(e){if(navigator.onLine===false){remote={};notice('Pracuješ offline. Lokálne uložené dáta zostávajú dostupné, synchronizácia bude pokračovať po pripojení.');}else throw e;}
 for(const [localKey,cloudKey] of Object.entries(KEYS)){
  const cloud=remote[cloudKey],stamp=Number(stamps[cloudKey]||0),cloudStamp=Number(cloud?.updatedAt||0);
  if(cloud&&typeof cloud.content==='string'&&cloudStamp>stamp){writeScoped(localKey,cloud.content);stamps[cloudKey]=cloudStamp;}
  else if(readScoped(localKey)!==null&&stamp>cloudStamp)pushKey(cloudKey,readScoped(localKey));
 }
 saveStamps();syncReady=true;
 window.addEventListener('online',()=>{for(const [localKey,cloudKey] of Object.entries(KEYS))if(readScoped(localKey)!==null)pushKey(cloudKey,readScoped(localKey));});
}
function notifyExternalUpdate(){
 if(document.getElementById('vd-cloud-change'))return;
 const el=document.createElement('div');el.id='vd-cloud-change';el.style.cssText='position:fixed;z-index:2100;bottom:100px;right:12px;max-width:320px;padding:13px 16px;background:#10435a;color:#f0faff;border:1px solid #72c6e5;border-radius:12px;box-shadow:0 8px 24px #0008';
 el.textContent='Iné zariadenie aktualizovalo tvoje údaje. Obnov ViaDeck po skončení jazdy, aby sa zmeny prejavili.';document.body.append(el);
 setTimeout(()=>el.remove(),12000);
}
function monitorUserData(){
 const names=Object.fromEntries(Object.entries(KEYS).map(([a,b])=>[b,a]));
 database.ref('userData/'+activeUid).on('child_changed',s=>{
  const key=s.key,value=s.val(),localKey=names[key];if(!localKey||!value||typeof value.content!=='string')return;
  const when=Number(value.updatedAt||0);
  if(when>Number(stamps[key]||0)){
   writeScoped(localKey,value.content);stamps[key]=when;saveStamps();notifyExternalUpdate();
  }
 },e=>console.warn('[ViaDeck] Synchronizácia zariadení',e));
}
function safeList(node,max){return Object.values(node||{}).slice(0,max).flatMap(x=>{try{return [JSON.parse(x.json)];}catch{return [];}});}
async function loadShared(){
 const snapshot=await database.ref('shared').once('value'),data=snapshot.val()||{};
 return {stops:safeList(data.stops,3000),routes:safeList(data.routes,200)};
}
async function proposeRoute(route,stops){
 if(!database||!activeUid)throw Error('Nie si prihlásený.');
 const routeJson=JSON.stringify(route),stopsJson=JSON.stringify(stops);
 if(routeJson.length>180000||stopsJson.length>180000)throw Error('Trasa je na odoslanie príliš veľká.');
 await database.ref('proposals').push({authorUid:activeUid,name:route.name||'Trasa',status:'pending',routeJson,stopsJson,createdAt:window.firebase.database.ServerValue.TIMESTAMP});
}
function launchCore(){
 if(sessionActive)return;sessionActive=true;
 const core=$('viadeck-core');if(!core)throw Error('V súbore index.html chýba ViaDeck core (viadeck-core).');
 const script=document.createElement('script');script.textContent=core.textContent;document.body.appendChild(script);
 document.body.classList.remove('vd-access-locked');appRoot.hidden=true;
 const toolbar=document.createElement('div');toolbar.id='vd-account-toolbar';
 const profile=document.createElement('button');profile.textContent='Účet';profile.title=auth.currentUser?.email||'';profile.onclick=()=>{
  const panel=ui('Prihlásený vodič',auth.currentUser?.email||'');appRoot.hidden=false;
  const back=document.createElement('button');back.className='vd-btn alt';back.textContent='Späť do ViaDecku';back.onclick=()=>appRoot.hidden=true;
  const exit=document.createElement('button');exit.className='vd-btn';exit.textContent='Odhlásiť sa';exit.onclick=googleSignOut;
  panel.append(back,exit);
 };
 toolbar.append(profile);
 if(window.VD_ACCESS.owner){const adm=document.createElement('a');adm.href='./viadeck-admin.html';adm.textContent='Administrácia';toolbar.append(adm);}
 document.body.append(toolbar);
}
async function proceed(user){
 if(!isGoogle(user)){ui('Nepodporované prihlásenie','ViaDeck vyžaduje overený Google účet.',[{label:'Odhlásiť sa',run:googleSignOut}]);return;}
 ui('Kontrola prístupu','Overujem oprávnenie a načítavam tvoje dáta…');
 let status=await readAuthorization(user);
 if(!status.allowed&&status.status!=='suspended'){
  const accepted=await acceptInvite(user).catch(e=>{console.warn('[ViaDeck] Pozvánka',e);return false;});
  if(accepted)status=await readAuthorization(user);
 }
 if(!status.allowed){
  const panel=ui(status.status==='suspended'?'Prístup pozastavený':'Prístup len na pozvanie',status.status==='suspended'?'Administrátor ti dočasne pozastavil používanie ViaDecku.':'Tento Google účet nemá aktívnu pozvánku. Požiadaj administrátora o pozvanie na '+user.email+'.');
  const uidLine=document.createElement('div');uidLine.className='vd-msg';uidLine.textContent='UID pre prvé nastavenie vlastníka: '+user.uid;panel.append(uidLine);
  const copy=document.createElement('button');copy.className='vd-btn alt';copy.textContent='Kopírovať moje UID';copy.onclick=()=>navigator.clipboard.writeText(user.uid).then(()=>notice('UID skopírované.')).catch(()=>notice('UID: '+user.uid));panel.append(copy);
  const b=document.createElement('button');b.textContent='Odhlásiť sa';b.className='vd-btn alt';b.onclick=googleSignOut;panel.append(b);return;
 }
 activeUid=user.uid;
 if(!status.offline)oldSet.call(localStorage,cacheKey(user.uid),JSON.stringify({email:user.email,expires:Date.now()+7*86400000,owner:status.owner}));
 await initStorage();
 const shared=status.offline?{stops:[],routes:[]}:await loadShared();
 window.VD_ACCESS={uid:user.uid,email:user.email,owner:status.owner,app,database,auth,sharedStops:shared.stops,sharedRoutes:shared.routes,proposeRoute,signOut:googleSignOut};
 launchCore();
 if(!status.offline)monitorUserData();
 if(!status.owner&&!status.offline)database.ref('members/'+user.uid+'/status').on('value',snap=>{
  if(snap.val()!=='active'){
   document.body.classList.add('vd-access-locked');appRoot.hidden=false;
   ui('Prístup pozastavený','Administrátor pozastavil tvoj prístup. Online zmeny a nové vysielanie sú zablokované.',[{label:'Odhlásiť sa',run:googleSignOut}]);
  }
 },e=>console.warn('[ViaDeck] Stav členstva',e));
 if(!status.offline){database.ref('shared').on('value',snap=>{
  const data=snap.val()||{};
  const next={stops:safeList(data.stops,3000),routes:safeList(data.routes,200)};
  if(JSON.stringify(next)!==JSON.stringify({stops:window.VD_ACCESS.sharedStops,routes:window.VD_ACCESS.sharedRoutes})){
   window.VD_ACCESS.sharedStops=next.stops;window.VD_ACCESS.sharedRoutes=next.routes;
   if(!sessionStorage.getItem('vd060-notice')){sessionStorage.setItem('vd060-notice','1');const box=document.createElement('div');box.style.cssText='position:fixed;bottom:96px;right:12px;max-width:300px;z-index:1900;background:#0d3042;color:white;border:1px solid #5fb1d0;border-radius:12px;padding:13px;box-shadow:0 8px 30px #0007';box.textContent='Zmenili sa spoločné trasy alebo zastávky. Aktualizuj stránku po skončení jazdy.';document.body.append(box);setTimeout(()=>box.remove(),9000);}
  }
 },e=>console.warn('[ViaDeck] Zmeny spoločnej databázy',e));}
}
async function start(){
 ui('Prihlásenie','ViaDeck je určený schváleným vodičom. Pokračuj Google účtom. Diváci živých jázd sa neprihlasujú.');
 try{
  await setup();
  auth.onAuthStateChanged(user=>{
   if(user)proceed(user).catch(e=>ui('Nepodarilo sa načítať ViaDeck',String(e?.message||e),[{label:'Skúsiť znova',run:()=>location.reload()},{label:'Odhlásiť sa',secondary:true,run:googleSignOut}]));
   else ui('Vitaj vo ViaDecku','Prihlás sa schváleným Google účtom.',[{label:'Pokračovať cez Google',run:googleSignIn}]);
  });
 }catch(e){ui('Chyba pripojenia',e?.message||String(e),[{label:'Skúsiť znova',run:()=>location.reload()}]);}
}
start();
})();
