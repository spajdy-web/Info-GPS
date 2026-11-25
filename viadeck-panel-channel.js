/* ViaDeck Display Channel 0.7.2 – independent persistent vehicle display streaming.
 * Loaded after authenticated ViaDeck core, does not change ViaDeck Live viewer sessions.
 * A standalone 128-bit secret channel is used for the vehicle display only.
 */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const access=window.VD_ACCESS;
if(!access?.app||!access?.uid||!window.firebase?.database){console.warn('[ViaDeck Panel] Prihlásený používateľ alebo Firebase chýba.');return;}
const db=window.firebase.database(access.app);
const KEY='viadeck-panel-channel-v072-'+access.uid;
const SERVER=window.firebase.database.ServerValue.TIMESTAMP;
const TTL=12*3600*1000,HEARTBEAT=15000;
const ID_PATTERN=/^[0-9a-f]{32}$/;
let id='',ref=null,online=false,initializing=false,writing=false,pending=false,lastSig='',lastWrite=0,wasIdle=null,staticSig='',revision=0;
let qrSignature='',qrPending=false,recovering=false;
function info(msg){$('vdChannelStatus').textContent=msg;}
function safeId(){try{const x=localStorage.getItem(KEY);return ID_PATTERN.test(x||'')?x:'';}catch{return '';}}
function setId(x){try{if(x)localStorage.setItem(KEY,x);else localStorage.removeItem(KEY);}catch{}}
function newId(){const a=new Uint8Array(16);crypto.getRandomValues(a);return Array.from(a,n=>n.toString(16).padStart(2,'0')).join('');}
function href(){if(!id)return '';const u=new URL('./panel.html?v=0.7.2',document.baseURI);u.hash='s='+id;return u.href;}
function updateUI(){
 const active=!!id,connected=active&&online&&lastWrite>0;
 const button=$('vdChannelOpen');if(!button)return;
 button.classList.toggle('is-broadcasting',connected);
 button.setAttribute('aria-pressed',String(active));
 button.title=connected?'Infosystém · vysielanie aktívne':active?'Infosystém · čaká na pripojenie':'Infosystém · vysielanie vypnuté';
 $('vdChannelStart').hidden=active;$('vdChannelStop').hidden=!active;
 $('vdChannelLinks').hidden=!active;
 $('vdChannelLink').value=href();
 if(!active)info('Vysielanie je vypnuté. Displej nemá aktívny kanál.');
 else if(!online)info('Kanál je pripravený. Čakám na pripojenie k serveru…');
 else if(!lastWrite)info('Pripájam vysielanie…');
 else info('Vysielanie aktívne. Displej sa sám prepína medzi jazdou a pohotovostným režimom.');
 if(active&&$('vdChannelDialog')?.open)void drawQr();
}
function insertUI(){
 const style=document.createElement('style');style.textContent=`
 #vdDisplayOpenBtn{display:none!important}
 #vdChannelOpen{color:#f1f8fe!important;transition:color .2s,background .2s;}
 #vdChannelOpen.is-broadcasting{color:#72f4a2!important;background:#15583e!important;border-color:#53b981!important}
 #vdChannelOpen svg{stroke:currentColor!important;fill:none!important;stroke-width:1.8!important;width:20px;height:20px}
 #vdChannelDialog{width:min(94vw,520px);max-height:88dvh;overflow:auto;color:#effaff;background:#0c2635;border:1px solid #4d8095;border-radius:16px;padding:21px;box-shadow:0 18px 70px #0008}
 #vdChannelDialog::backdrop{background:#000b}
 #vdChannelDialog h2{font-size:21px;margin:0 0 10px}
 #vdChannelDialog p{line-height:1.5;font-size:13px;color:#bdd5e1}
 #vdChannelDialog .vd-channel-status{background:#0c3545;border:1px solid #3b7285;padding:12px;border-radius:10px;margin:14px 0;font-size:13px;color:#cbebf4}
 #vdChannelDialog .vd-channel-actions{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0}
 #vdChannelDialog button{font:inherit;font-size:14px;color:#e8faff;background:#14506c;border:1px solid #4398b9;border-radius:9px;padding:10px 13px;cursor:pointer;min-height:42px}
 #vdChannelDialog button.secondary{background:#203c4b;border-color:#4b7181}
 #vdChannelDialog button.danger{background:#51252e;border-color:#b26771;color:#ffe2e4}
 #vdChannelDialog button:disabled{opacity:.55;cursor:default}
 #vdChannelDialog .vd-channel-url{width:100%;border-radius:8px;border:1px solid #3e738c;background:#071d2b;padding:10px;color:#fff;min-width:0;font:13px/1.4 monospace}
 #vdChannelDialog .vd-channel-qr{width:max-content;max-width:100%;margin:13px auto;padding:10px;background:#fff;border-radius:11px}
 #vdChannelDialog .vd-channel-qr:empty{display:none}
 #vdChannelDialog .vd-channel-note{color:#e8c79d;font-size:12px}
 `;document.head.append(style);
 const trigger=document.createElement('button');trigger.type='button';trigger.id='vdChannelOpen';trigger.className='vd-header-icon';trigger.setAttribute('aria-label','Infosystém vozidla');
 trigger.title='Infosystém · vysielanie vypnuté';trigger.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M9 21h6m-3-3v3M7 9h10M7 13h7"/></svg>';
 const toolbar=$('vd-account-toolbar');if(toolbar)toolbar.insertBefore(trigger,toolbar.firstChild);else document.querySelector('.head-actions')?.prepend(trigger);
 const dialog=document.createElement('dialog');dialog.id='vdChannelDialog';dialog.setAttribute('aria-labelledby','vdChannelTitle');dialog.innerHTML=`
 <div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><h2 id="vdChannelTitle">Infosystém vozidla</h2><button id="vdChannelClose" class="secondary" type="button" aria-label="Zavrieť">×</button></div>
 <p>Samostatný kanál pre informačný displej. Počas jazdy zobrazuje linku a zastávky; medzi jazdami logo ViaDecku a hodiny. Zdieľanie pre Diváka zostáva nezávislé.</p>
 <div id="vdChannelStatus" class="vd-channel-status" role="status"></div>
 <div class="vd-channel-actions"><button id="vdChannelStart" type="button">Zapnúť vysielanie</button><button id="vdChannelStop" class="danger" type="button" hidden>Vypnúť vysielanie</button></div>
 <div id="vdChannelLinks" hidden><label for="vdChannelLink">Trvalý odkaz na tento displej</label><input id="vdChannelLink" class="vd-channel-url" readonly aria-label="Odkaz na infosystém vozidla"><div class="vd-channel-actions"><button id="vdChannelCopy" type="button">Kopírovať odkaz</button><button id="vdChannelView" class="secondary" type="button">Otvoriť displej</button></div><div id="vdChannelQr" class="vd-channel-qr" aria-label="QR kód displeja"></div><p class="vd-channel-note">Odkaz funguje aj pri nasledujúcej jazde, kým vysielanie nevypneš. Každý, kto má odkaz, môže vidieť prevádzkové údaje. Vypnutie zneplatní tento kanál.</p></div>`;
 document.body.append(dialog);
 trigger.addEventListener('click',()=>{dialog.showModal();updateUI();});
 $('vdChannelClose').addEventListener('click',()=>dialog.close());
 $('vdChannelStart').addEventListener('click',()=>void start());
 $('vdChannelStop').addEventListener('click',()=>void stop());
 $('vdChannelCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(href());toast('Odkaz na infosystém skopírovaný.');}catch{const e=$('vdChannelLink');e.focus();e.select();try{document.execCommand('copy');}catch{}toast('Odkaz označený.');}});
 $('vdChannelView').addEventListener('click',()=>{if(id)window.open(href(),'_blank','noopener,noreferrer');});
 updateUI();
}
async function drawQr(){
 if(qrPending||!id||!$('vdChannelDialog').open)return;
 const url=href(),target=$('vdChannelQr');if(qrSignature===url&&target.childNodes.length)return;
 qrPending=true;
 try{
  if(!window.QRCode){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=resolve;s.onerror=()=>reject(Error('QR knižnica sa nenačítala'));document.head.append(s);});}
  if(!id||url!==href()||!target||!$('vdChannelDialog').open)return;
  target.replaceChildren();if(window.QRCode){new window.QRCode(target,{text:url,width:176,height:176,colorDark:'#081a22',colorLight:'#fff',correctLevel:window.QRCode.CorrectLevel.M});qrSignature=url;}
 }catch(e){target.textContent='QR kód sa nenačítal. Použi odkaz.';target.style.color='#051b25';}
 finally{qrPending=false;}
}
function buildPayload(){
 // A completed route is not an active ride. The display remains connected but idle.
 if(typeof currentActiveRoute!=='function'||!currentActiveRoute()||routeCompleted)return {v:2,standby:true};
 if(typeof vdLivePublicSnapshot!=='function')return {v:2,standby:true};
 const x=vdLivePublicSnapshot();if(!x)return {v:2,standby:true};
 return {...x,v:2,standby:false};
}
async function publish(force=false){
 if(!id||!ref)return;
 if(writing){pending=true;return;}
 if(!online){updateUI();return;}
 const token=revision;
 const payload=buildPayload(),idle=!!payload.standby,now=Date.now();
 const sign=JSON.stringify(payload);
 if(!force&&sign===lastSig&&now-lastWrite<HEARTBEAT)return;
 writing=true;
 try{
  // First switch of mode replaces the whole public subtree to clear stale stop data.
  const changes={mode:idle?'standby':'route',updatedAt:SERVER,expiresAt:now+TTL};
  if(wasIdle!==idle||!lastSig){changes.public=payload;}
  else if(idle){changes['public/standby']=true;}
  else{
   // The large route geometry and full stop list are static; update them only on change.
   const staticData=JSON.stringify([payload.fullStops,payload.legs]);
   for(const [key,value] of Object.entries(payload)){
    if((key==='fullStops'||key==='legs')&&staticData===staticSig)continue;
    changes['public/'+key]=value;
   }
  }
  await ref.update(changes);
  if(token!==revision)return;
  lastSig=sign;lastWrite=Date.now();wasIdle=idle;staticSig=idle?'':JSON.stringify([payload.fullStops,payload.legs]);updateUI();
 }catch(e){if(token===revision){lastWrite=0;info('Chyba vysielania: '+(e?.message||e));updateUI();console.warn('[ViaDeck Panel] Publish',e);}}
 finally{writing=false;if(pending){pending=false;if(id&&token===revision)void publish(true);}}
}
async function activate(channelId,create=false){
 if(initializing)return;initializing=true;
 const previousSaved=safeId();
 const button=$('vdChannelStart');button.disabled=true;
 try{
  const target=db.ref('sessions/'+channelId);
  if(create){
   const owner=window.firebase.auth(access.app).currentUser?.uid;
   if(!owner||owner!==access.uid)throw Error('Nie je overený vlastník kanála.');
   await target.set({ownerUid:owner,status:'live',mode:'standby',createdAt:SERVER,updatedAt:SERVER,expiresAt:Date.now()+TTL,public:{v:2,standby:true}});
  }
  id=channelId;ref=target;lastWrite=0;lastSig='';wasIdle=null;staticSig='';revision++;setId(channelId);updateUI();
  await publish(true);
 }catch(e){console.warn('[ViaDeck Panel] Aktivácia',e);if(create){id='';ref=null;setId(previousSaved===channelId?previousSaved:'');}info('Kanál sa nepodarilo spustiť: '+(e?.message||e));}
 finally{initializing=false;button.disabled=false;updateUI();}
}
async function start(){if(id||initializing)return;await activate(newId(),true);}
async function stop(){
 if(!id||initializing)return;
 if(!confirm('Vypnúť vysielanie pre vozidlový displej? Súčasný odkaz prestane fungovať.'))return;
 const old=ref,token=++revision;id='';ref=null;lastSig='';lastWrite=0;wasIdle=null;staticSig='';qrSignature='';setId('');$('vdChannelQr').replaceChildren();updateUI();
 try{if(old)await old.update({status:'stopped',updatedAt:SERVER,public:{message:'Vysielanie pre displej ukončené'}});}catch(e){info('Lokálne vypnuté, server nepotvrdil ukončenie: '+(e?.message||e));}
}
async function recover(){
 const saved=safeId();if(!saved||recovering||initializing||id||!online)return;
 recovering=true;
 try{
  const snap=await db.ref('sessions/'+saved).once('value');const rec=snap.val();
  if(!rec||rec.ownerUid!==access.uid||rec.status!=='live'){setId('');return;}
  await activate(saved,false);
 }catch(e){
  // After twelve hours without an active driver browser, Firebase hides the
  // expired channel. The owner may renew the *same* random ID, preserving QR.
  // If renewal fails transiently, keep the local ID for a later reconnect.
  const denied=String(e?.code||e?.message||e).toLowerCase().includes('permission_denied');
  if(denied)await activate(saved,true);
  else console.warn('[ViaDeck Panel] Recovery on reconnect',e);
 }finally{recovering=false;}
}
db.ref('.info/connected').on('value',snap=>{online=snap.val()===true;if(id&&online)void publish(true);else if(online&&safeId())void recover();updateUI();});
insertUI();
void recover();
setInterval(()=>{if(id)void publish();},2500);
window.VD_PANEL_CHANNEL={get enabled(){return !!id;},get connected(){return !!id&&online&&!!lastWrite;},get url(){return href();}};
})();
