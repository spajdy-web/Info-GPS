/* Optional Company foundation. Does not alter legacy service/route/storage scope. */
(()=>{'use strict';
const api=window.VD_ACCESS;if(!api?.uid||!api?.database)return;
const db=api.database,uid=api.uid;let entries=[];
const nameRole={owner:'Vlastník',driver:'Vodič',planner:'Plánovač',dispatcher:'Dispečer'};
async function readCompanies(){
 try{const x=(await db.ref('userCompanies/'+uid).once('value')).val()||{};
  const arr=await Promise.all(Object.keys(x).filter(id=>/^\d{6}$/.test(id)).slice(0,40).map(async id=>{try{const [m,c]=await Promise.all([db.ref('companies/'+id+'/members/'+uid).once('value'),db.ref('companies/'+id+'/meta').once('value')]);return m.val()?.status==='active'&&c.val()?{id,role:m.val().role,driverNumber:m.val().driverNumber||'',name:c.val().name}:null;}catch{return null;}}));entries=arr.filter(Boolean);
 }catch(e){console.debug('[ViaDeck Company] Firemná vrstva zatiaľ nie je pripravená:',e?.message||e);entries=[];}
}
function addHeader(){const nav=document.getElementById('vd-account-toolbar');if(!nav||document.getElementById('vdCompanyLink'))return;
 const a=document.createElement('a');a.id='vdCompanyLink';a.className='vd-header-icon';a.href='./viadeck-companies.html';a.title='Spoločnosti · správa';a.setAttribute('aria-label','Spoločnosti');a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M8 13h8M8 17h8"/></svg>';
 nav.insertBefore(a,nav.lastChild);
}
function renderProfile(panel){if(!panel||panel.querySelector('#vdCompanyInProfile'))return;
 const div=document.createElement('div');div.id='vdCompanyInProfile';div.className='vd-msg';div.style.cssText='font-size:13px;margin:12px 0';
 const title=document.createElement('strong');title.textContent='Čísla vodiča a spoločnosti';div.append(title);
 if(entries.length){for(const x of entries){const t=document.createElement('p');t.style.margin='7px 0';t.textContent=x.name+' ('+x.id+') · '+(nameRole[x.role]||x.role)+' · číslo vodiča: '+(x.driverNumber||'nepridelené');div.append(t);}}
 else{const p=document.createElement('p');p.textContent='Zatiaľ nemáš priradenú spoločnosť. Pôvodný ViaDeck zostáva dostupný.';div.append(p);}
 const a=document.createElement('a');a.href='./viadeck-companies.html';a.textContent='Otvoriť správu spoločností';a.style.color='#93e7ff';div.append(a);
 const form=panel.querySelector('form');if(form)form.before(div);else panel.append(div);
}
window.VD_COMPANY_NAV={renderProfile,refresh:async()=>{await readCompanies();addHeader();}};
void readCompanies().then(addHeader);
})();
