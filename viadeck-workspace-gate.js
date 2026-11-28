/* Permission-gated placeholder pages. No planning/dispatch writes in this release. */
(()=>{'use strict';
const show=(text,ok=false)=>{const x=document.getElementById('status');x.textContent=text;x.className='notice '+(ok?'ok':'error');};
const role=document.currentScript?.dataset.role,cid=new URLSearchParams(location.search).get('company');
if(!/^[0-9]{6}$/.test(cid||'')){show('Neplatné ID spoločnosti.');return;}
const load=url=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=no;document.head.append(s);});
(async()=>{await load('./viadeck-live-config.js');for(const x of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-database-compat.js'])await load('https://www.gstatic.com/firebasejs/10.14.1/'+x);
const app=firebase.apps.find(x=>x.name==='ViaDeckDriver')||firebase.initializeApp(window.VIADECK_LIVE_CONFIG,'ViaDeckDriver'),auth=firebase.auth(app),db=firebase.database(app);
auth.onAuthStateChanged(async u=>{if(!u){show('Najprv sa prihlás do ViaDecku.');return;}
try{const [platform,mem,meta]=await Promise.all([db.ref('owners/'+u.uid).once('value'),db.ref('companies/'+cid+'/members/'+u.uid).once('value'),db.ref('companies/'+cid+'/meta').once('value')]);const m=mem.val();if(!platform.val()&&!((m?.status==='active')&&(m.role==='owner'||m.role===role))){show('Nemáš oprávnenie na tento modul.');return;}show(meta.val()?.name+' · prístup overený. Komponent sa pripravuje.',true);
}catch(e){show('Overenie prístupu zlyhalo: '+(e?.message||e));}});
})().catch(e=>show('Inicializácia: '+(e?.message||e)));
})();
