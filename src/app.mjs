import { TYPE_NAMES, ROLE_NAMES, CAPTURE_ROLES, CHILD_ROLE, seedData, scopedMemberships, visibleCampaigns, canManageMember, visibleRecords, filterRecords, validateCampaign, assertCapture, assertEditable, finalFilename, dateInMexico, descendants, teamSummary, manualAssignment, transferTarget, captureCampaigns, assertDeletable, dailyEvidence, googleMapsUrl } from './domain.mjs';
import { ApiClient, PreviewCloudClient } from './api.mjs';

const app=document.querySelector('#app');
const modal=document.querySelector('#modal');
const STORAGE_KEY='controlpublicidad-screens-v1';
const serverMode=/^https?:$/.test(location.protocol)&&new URLSearchParams(location.search).get('server')==='1';
const api=serverMode?new ApiClient():null;
const cloud=!serverMode&&document.querySelector('meta[name="controlpublicidad-cloud"]')&&typeof globalThis.fetch==='function'?new PreviewCloudClient():null;
let data=serverMode?{users:[],campaigns:[],memberships:[],records:[],invitations:[],audit:[],drafts:{}}:seedData();
if(!serverMode)try { const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(saved?.version===1) data=saved.data; } catch {}
data.drafts ||= {};
data.deletions ||= [];
const state={logged:false,actorId:'a1',view:'dashboard',loginMode:'email',loginStep:1,loginContact:'',developmentCode:'',inviteLinks:{},usersSearch:'',userCampaign:'',userRole:'',userStatus:'',tableOpen:false,branchOpen:{},filters:{campaign:'',types:Object.keys(TYPE_NAMES),from:'',to:'',mediaKind:'',personal:false},successId:null,cloudState:cloud?'connecting':'unavailable',cloudBusy:false};
const pages={dashboard:'Resumen',campaigns:'Campañas',users:'Usuarios y equipos',evidence:'Evidencias',map:'Mapa de evidencias',capture:'Nuevo registro',sync:'Mis envíos'};
const ids=()=>globalThis.crypto?.randomUUID?.()||'demo-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actor=()=>data.users.find(u=>u.id===state.actorId);
const user=id=>data.users.find(u=>u.id===id);
const memberUser=m=>({...user(m.userId),name:m.displayName||user(m.userId)?.name,role:m.role,status:m.status});
const canEdit=m=>!['invited','transferred','deleted'].includes(m.status)&&(m.global?actor().role==='admin':canManageMember(data,actor(),m));
const canMove=m=>actor().role==='admin'&&['coordinator','collaborator'].includes(m.role)&&['active','inactive'].includes(m.status);
const campaign=id=>data.campaigns.find(c=>c.id===id);
const initials=name=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('');
const personAvatar=(u,large=false)=>`<span class="avatar role-${u?.role||'admin'} ${['inactive','deleted'].includes(u?.status)||u?.active===false?'is-inactive':''} ${large?'large':''}">${e(initials(u?.name||'Equipo'))}</span>`;
const rolePill=role=>`<span class="pill ${role==='leader'?'purple':role==='collaborator'?'green':''}">${ROLE_NAMES[role]}</span>`;
const statusPill=status=>`<span class="pill ${status==='active'||status==='synced'?'green':status==='pending'||status==='invited'?'amber':''}"><i class="dot"></i>${{active:'Activo',inactive:'Inactivo',deleted:'Dado de baja',transferred:'Trasladado · historial',invited:'Invitación pendiente',pending:'Pendiente · demo',synced:serverMode?'Confirmado':'Sellado · ejemplo',draft:'Borrador · demo'}[status]||e(status)}</span>`;
const recordStatus=r=>r.cloudReceipt?'<span class="pill green"><i class="dot"></i>En nube · registro de prueba</span>':statusPill(r.status);
const typePill=t=>`<span class="pill">${TYPE_NAMES[t]}</span>`;
const fmtDate=(iso,short=false)=>new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',...(short?{}:{hour:'2-digit',minute:'2-digit'})}).format(new Date(iso));
const save=()=>{if(serverMode)return true;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,data}));return true;}catch{toast('No se pudo guardar la demo en este navegador. Mantén esta ventana abierta.');return false;}};
const audit=(action,target)=>data.audit.push({id:ids(),actorId:actor().id,action,target,at:new Date().toISOString()});
let toastTimeout;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),4500);}
async function refreshServer(){data=await api.bootstrap();data.drafts={};}
async function bootServer(){
  renderLogin();
  try{const session=await api.session();state.actorId=session.user.id;await refreshServer();state.logged=true;state.view=session.user.role==='collaborator'?'capture':'dashboard';render();
    if(new URLSearchParams(location.search).get('invite'))showDialog('Aceptar invitación',`<p>Estás conectado como <strong>${e(session.user.name)}</strong> (${e(session.user.contact)}).</p><p class="sub">La invitación solo podrá aceptarse si pertenece a este contacto verificado.</p>`,`<button class="btn secondary" data-action="close-dialog">Cerrar</button><button class="btn" data-action="accept-invite">Aceptar invitación</button>`);
  }
  catch(error){if(error.status!==401)toast(error.message);}
}
function cloudPayload(r){
  const chain=[];let m=data.memberships.find(x=>x.id===r.membershipId);const seen=new Set();
  while(m&&!seen.has(m.id)){seen.add(m.id);chain.push({...m,status:'active'});m=data.memberships.find(x=>x.id===m.parentId);}
  const fields=['id','source','author','campaignName','campaignId','membershipId','type','capturedAt','lat','lng','accuracy','notes','media','device'];
  const record=Object.fromEntries(fields.map(k=>[k,structuredClone(r[k])]));
  record.source='demo';record.author ||= {id:chain[0]?.userId,name:memberUser(chain[0]).name};record.campaignName ||= campaign(r.campaignId)?.name;
  return {record,context:{memberships:chain,users:chain.map(m=>({...user(m.userId)})),campaigns:[{...campaign(r.campaignId)}]},baseline:Math.max(0,...data.records.filter(x=>x.campaignId===r.campaignId).map(x=>x.number||0))};
}
function confirmCloud(r,receipt){if(receipt?.id!==r.id||receipt.kind!=='demo-metadata'||!Number.isSafeInteger(receipt.number)||receipt.number<1)throw Error('La nube no confirmó el registro. Se conserva pendiente.');r.number=receipt.number;r.status='synced';r.cloudReceipt=receipt;delete r.cloudError;}
async function bootCloud(){
  try{
    const result=await cloud.list();
    for(const item of result.records){
      const existing=data.records.find(r=>r.id===item.record.id);
      if(existing){confirmCloud(existing,item.receipt);continue;}
      // Only restore missing historical references; existing assignments remain unchanged.
      for(const u of item.context.users)if(!user(u.id))data.users.push(u);
      for(const c of item.context.campaigns)if(!campaign(c.id))data.campaigns.push(c);
      for(const m of item.context.memberships)if(!data.memberships.some(x=>x.id===m.id))data.memberships.push({...m,status:'transferred'});
      const r={...item.record};confirmCloud(r,item.receipt);data.records.push(r);
    }
    for(const mark of result.deletions||[]){
      const existing=data.deletions.find(d=>d.id===mark.id);if(existing)existing.confirmed=true;else data.deletions.push({...mark,global:!!mark.global,source:'demo',confirmed:true});
      if(mark.global){const u=user(mark.userId);if(u){u.deleted=true;u.active=false;}}else{const m=data.memberships.find(m=>m.id===mark.id);if(m)m.status='deleted';}
    }
    state.cloudState='ready';save();if(state.logged)render();await syncDeletions();await syncCloud();
  }catch(error){state.cloudState='unavailable';if(state.logged)render();toast(error.message);}
}
let deletionBusy=false;
async function syncDeletions(){
  if(!cloud||deletionBusy)return;
  deletionBusy=true;
  try{for(const mark of data.deletions.filter(d=>!d.confirmed)){const result=await cloud.deletion(mark);if(result.id!==mark.id||result.kind!=='demo-deletion')throw Error('La nube no confirmó la baja.');mark.confirmed=true;save();}}
  catch(error){state.cloudState='unavailable';toast('Baja conservada en este dispositivo. Se confirmará al recuperar conexión con la nube.');}
  finally{deletionBusy=false;}
}
async function syncCloud(manual=false){
  if(!cloud){if(manual)toast('La nube no está conectada a esta copia. Los registros siguen pendientes.');return;}
  if(state.cloudBusy)return;
  await syncDeletions();
  if(state.cloudBusy)return;
  const records=state.logged?(actor().role==='admin'?ownRecords():personalRecords()).filter(r=>r.status==='pending'):[];
  if(!records.length)return;
  if(!cloud){if(manual)toast('La nube no está conectada a esta copia. Los registros siguen pendientes.');return;}
  state.cloudBusy=true;render();let count=0;
  try{
    for(const r of records){
      try{r.cloudPayload ||= cloudPayload(r);save();const result=await cloud.save(r.cloudPayload);confirmCloud(r,result.receipt);state.cloudState='ready';save();count++;}
      catch(error){r.cloudError=error.message;state.cloudState='unavailable';save();break;}
    }
  }finally{state.cloudBusy=false;if(state.logged)render();}
  if(count===records.length&&state.logged&&ownRecords().some(r=>r.status==='pending'))void syncCloud();
  if(manual)toast(count===records.length?`${count} registros de prueba confirmados en la nube.`:'Los registros sin confirmar permanecen pendientes. Puedes volver a intentar.');
}
const gpsLabel=r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng)?`${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} · ±${r.accuracy} m`:'GPS no disponible';
function evidenceArt(r,index=0){
  if(!serverMode)return photoArt(index);
  const media=r.media.find(m=>m.kind==='photo')||r.media[0],url=`/api/records/${r.id}/media/${media.id}`;
  return `<div class="photo-art">${media.kind==='photo'?`<img src="${url}" alt="Evidencia de ${e(r.campaignName)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`:`<div class="media-placeholder" style="height:100%">${icon('video',32)}<span>Video registrado</span></div>`}</div>`;
}
const paths={
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  flag:'M5 21V4 M5 4c5-5 9 5 14 0v10c-5 5-9-5-14 0',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0a4 4 0 1 1 8 0',
  camera:'M14.5 4h-5L7 7H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-4z M16 13a4 4 0 1 1-8 0a4 4 0 1 1 8 0',
  map:'M9 3l6 3 6-3v18l-6 3-6-3-6 3V6z M9 3v18 M15 6v18',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  upload:'M12 16V3 M7 8l5-5 5 5 M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5',
  plus:'M12 5v14 M5 12h14',chevron:'M9 5l7 7-7 7',arrow:'M5 12h14 M14 7l5 5-5 5',
  search:'M15 15l6 6 M17 10a7 7 0 1 1-14 0a7 7 0 1 1 14 0',
  shield:'M12 3l8 4v5c0 6-8 10-8 10s-8-4-8-10V7z M8 12l3 3 5-5',
  check:'M5 12l4 4L19 6',clock:'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0',
  close:'M6 6l12 12 M6 18L18 6',
  edit:'M16 3l5 5-12 12H4v-5z M13 6l5 5',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  mail:'M3 5h18v14H3z M3 5l9 7 9-7',
  phone:'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 M11 18h2',
  video:'M3 6h12v12H3z M15 10l6-3v10l-6-3',
  wifi:'M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8 16a6 6 0 0 1 8 0 M12 20h.01',
  logout:'M9 3H3v18h6 M9 12h12 M16 7l5 5-5 5',
  chart:'M4 20h17 M7 15v-5 M12 15V5 M17 15V8',
  layers:'M12 3l10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
  link:'M10 14l4-4 M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0'
};
function icon(name,size=19){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;}
const brand=()=>`<a class="brand" href="#inicio" data-nav="home" aria-label="Ir al inicio"><div class="brand-mark">${icon('pin',23)}</div><div><strong>ControlPublicidad</strong><small>EVIDENCIAS EN CAMPO</small></div></a>`;
function mapArt(){return `<svg viewBox="0 0 640 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<rect width="640" height="460" fill="#edf0e3"/><g fill="#e1e8d5"><rect x="34" y="28" width="92" height="56" rx="5"/><rect x="151" y="25" width="61" height="58" rx="4"/><rect x="238" y="20" width="93" height="62" rx="4"/><rect x="354" y="24" width="116" height="60" rx="4"/><rect x="498" y="28" width="90" height="56" rx="4"/><rect x="24" y="116" width="110" height="75" rx="5"/><rect x="164" y="120" width="125" height="70" rx="4"/><rect x="320" y="119" width="71" height="74" rx="5"/><rect x="427" y="122" width="85" height="76" rx="5"/><rect x="24" y="232" width="111" height="77" rx="5"/><rect x="175" y="233" width="107" height="79" rx="4"/><rect x="320" y="232" width="79" height="80" rx="4"/><rect x="426" y="233" width="91" height="72" rx="5"/><rect x="542" y="236" width="88" height="66" rx="4"/><rect x="20" y="350" width="130" height="89" rx="5"/><rect x="179" y="352" width="103" height="89" rx="4"/><rect x="329" y="352" width="72" height="86" rx="4"/><rect x="430" y="350" width="82" height="84" rx="5"/><rect x="543" y="350" width="75" height="84" rx="5"/></g>
<g fill="none" stroke="#fffdf6" stroke-width="18"><path d="M0 101H640 M0 212H640 M0 330H640 M145 0v460 M303 0v460 M414 0v460 M530 0v460"/><path d="M-30 442L680 8" stroke-width="24"/></g>
<g fill="none" stroke="#e3dfc8" stroke-width="2"><path d="M0 101H640 M0 212H640 M0 330H640 M145 0v460 M303 0v460 M414 0v460 M530 0v460"/><path d="M-30 442L680 8"/></g>
<rect x="333" y="240" width="60" height="62" rx="8" fill="#bdceaa"/><g fill="#94ad84"><circle cx="346" cy="257" r="7"/><circle cx="378" cy="284" r="9"/><circle cx="346" cy="286" r="8"/></g>
<g font-family="system-ui" font-size="9" fill="#8b927b"><text x="208" y="205">AV. MADERO</text><text x="341" y="345">MORELOS</text><text x="175" y="395">Centro Histórico</text><text x="444" y="180">Morelia</text></g></svg>`;}
function photoArt(index=0){const variant=index%3;const wall=['#ccbb9b','#bec7bb','#c5b0a2'][variant];return `<div class="photo-art"><svg viewBox="0 0 480 280" role="img" aria-label="Ilustración de publicidad de ejemplo">
<rect width="480" height="280" fill="#dce8e4"/><path d="M0 105l100-19 72 15 93-8 75 14 140-20v193H0z" fill="${wall}"/>
<rect x="0" y="227" width="480" height="53" fill="#8c9690"/><path d="M0 231h480" stroke="#e8dfcc" stroke-width="8"/>
<rect x="25" y="104" width="94" height="119" fill="#9e9886"/><rect x="40" y="137" width="62" height="85" fill="#6a7f75"/><path d="M29 101h90l-5-8H33z" fill="#c0ab8c"/>
<rect x="151" y="110" width="251" height="103" rx="2" fill="#f8f6e9" stroke="#a2977c" stroke-width="3"/><rect x="155" y="114" width="96" height="95" fill="#1d5142"/>
<circle cx="202" cy="157" r="20" fill="#d5e495"/><path d="M193 159l8 7 12-15" fill="none" stroke="#295344" stroke-width="4"/>
<text x="268" y="148" font-size="15" fill="#2b4d3d" font-family="system-ui" font-weight="650">MORELIA</text><text x="268" y="170" font-size="15" fill="#2b4d3d" font-family="system-ui">SE MUEVE</text><rect x="269" y="182" width="103" height="4" rx="2" fill="#bcc6a9"/><rect x="269" y="192" width="74" height="3" rx="1.5" fill="#d1d9be"/>
<path d="M430 223V143" stroke="#667d64" stroke-width="8"/><circle cx="430" cy="121" r="37" fill="#7e997b"/><circle cx="416" cy="123" r="25" fill="#94aa84"/>
<rect width="480" height="280" fill="#5a7457" opacity=".05"/><text x="14" y="267" font-family="system-ui" font-size="9" fill="#e8ede5">IMAGEN DE EJEMPLO · SIN CAPTURA REAL</text></svg></div>`;}
function field(label,name,content){return `<div class="field"><label for="${name}">${label}</label>${content}</div>`;}
function stat(label,value,note,ic,featured=false){return `<div class="stat ${featured?'featured':''}"><div class="label">${label}${icon(ic,17)}</div><strong>${value}</strong><small>${note}</small></div>`;}
function pageHead(title,subtitle,button='',eyebrow='ESPACIO DE TRABAJO'){return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="sub">${subtitle}</p></div>${button}</div>`;}
function empty(message){return `<div class="empty">${icon('layers',30)}<h3>${message}</h3><p>Prueba otra selección o agrega datos de ejemplo.</p></div>`;}
function ownRecords(){return visibleRecords(data,actor());}
function personalRecords(){return ownRecords().filter(r=>(r.author?.id||data.memberships.find(m=>m.id===r.membershipId)?.userId)===actor().id);}
function filtered(){return filterRecords(state.filters.personal?personalRecords():ownRecords(),state.filters);}
function campaignOptions(selected=''){return visibleCampaigns(data,actor()).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${e(c.name)}</option>`).join('');}
function navigate(view){
  const collaborator=actor().role==='collaborator';
  if(view==='home')view=collaborator?'capture':'dashboard';
  if(collaborator&&!['capture','sync','evidence'].includes(view)) view='capture';
  if(!collaborator&&!CAPTURE_ROLES.includes(actor().role)&&['capture','sync'].includes(view)) view='dashboard';
  state.view=view;state.successId=null;render();window.scrollTo({top:0,behavior:'instant'});
}
function render(){
  if(!state.logged){renderLogin();return;}
  const u=actor(), coll=u.role==='collaborator';
  const nav=coll?[['capture','camera'],['sync','upload']]:[['dashboard','grid'],['campaigns','flag'],['users','users'],['evidence','camera'],['map','map'],...(CAPTURE_ROLES.includes(u.role)?[['capture','plus'],['sync','upload']]:[])];
  const pending=personalRecords().filter(r=>r.status==='pending').length;
  const topOptions=[['a1','Administrador'],['l1','Líder · Mariana'],['l2','Líder · Andrés'],['c1','Coordinador · Diego'],['c2','Coordinador · Elena'],['f1','Colaboradora · Sofía'],['f3','Colaboradora · Valeria']].map(([id,name])=>`<option value="${id}" ${u.id===id?'selected':''}>${name}</option>`).join('');
  app.innerHTML=`<div class="shell"><aside class="sidebar">${brand()}<div class="workspace-label">${coll?'Trabajo de campo':'Administración'}</div>
    <nav class="nav" aria-label="Navegación principal">${nav.map(([v,ic])=>`<button class="nav-link ${state.view===v?'active':''}" data-nav="${v}" ${state.view===v?'aria-current="page"':''}>${icon(ic)}<span>${pages[v]}</span>${v==='sync'&&pending?`<b class="count">${pending}</b>`:''}</button>`).join('')}</nav>
    <div class="side-bottom"><div class="scope-note">${icon('shield',21)}<strong>Tu equipo, tu alcance</strong><br>${coll?'Captura tus registros y consulta el estado de tus envíos.':u.role==='admin'?'Administra las campañas y supervisa todos los equipos.':'Consulta únicamente las campañas y personas de tu equipo.'}</div>
    <div class="side-person">${personAvatar(u)}<div><strong>${e(u.name)}</strong><small>${ROLE_NAMES[u.role]}</small></div><button class="icon-btn" data-action="logout" title="Salir de la demostración" aria-label="Salir de la demostración">${icon('logout',16)}</button></div></div></aside>
    <main class="main"><header class="topbar"><div class="breadcrumb"><a href="#inicio" data-nav="home">ControlPublicidad</a>${icon('chevron',11)}<a href="#${state.view}" data-nav="${state.view}" aria-current="page">${pages[state.view]}</a></div><div class="top-actions"><span class="pill green connection">${icon('wifi',13)} ${serverMode?'Servidor local':state.cloudState==='ready'?'Nube de prueba':state.cloudState==='connecting'?'Conectando':'Sin conexión a nube'}</span>${serverMode?`<span class="pill">${ROLE_NAMES[u.role]}</span>`:`<label class="sr-only" for="demo-role" style="position:absolute;width:1px;height:1px;overflow:hidden">Cambiar usuario de demostración</label><select id="demo-role" class="role-select" aria-label="Cambiar usuario de demostración">${topOptions}</select>`}<button class="icon-btn" data-action="logout" title="Salir" aria-label="Salir">${icon('logout',16)}</button></div></header>
    <div class="demo-strip">${serverMode?'SERVIDOR LOCAL · Cambios persistentes · Códigos de desarrollo · Cámara y nube pendientes':'PROTOTIPO NAVEGABLE · Usuarios, imágenes y GPS de ejemplo · Nube: solo registros de prueba · No uses evidencias reales'}</div>
    <div class="content" id="page">${renderPage()}</div></main>
    <nav class="mobile-nav" aria-label="Navegación móvil">${nav.map(([v,ic])=>`<button data-nav="${v}" class="${state.view===v?'active':''}" ${state.view===v?'aria-current="page"':''}>${icon(ic)}<span>${v==='evidence'?'Evidencias':v==='users'?'Usuarios':v==='dashboard'?'Inicio':v==='map'?'Mapa':v==='capture'?'Capturar':pages[v]}</span></button>`).join('')}</nav></div>`;
}
function renderLogin(){
  if(serverMode){renderServerLogin();return;}
  const mode=state.loginMode==='email';
  app.innerHTML=`<div class="login"><section class="login-story">${brand()}<h2 class="story-title">Cada punto.<br>Cada equipo.<br><span>Cada evidencia.</span></h2><p>Una vista clara de lo que sucede en campo.<br>Organiza tus campañas y acompaña a tu equipo, desde el primer registro.</p><div class="login-illustration"><svg viewBox="0 0 460 270" fill="none" aria-hidden="true"><path d="M16 220l141-172 113 160 104-118 65 77" stroke="#547c60" stroke-width="1.5" stroke-dasharray="5 5"/><path d="M25 242h420 M50 240V115h119v125 M189 240V72h109v168 M317 240V137h84v103" stroke="#426b53" stroke-width="1.2"/><rect x="90" y="151" width="140" height="77" rx="8" fill="#eaf0d9" transform="rotate(-8 90 151)"/><rect x="103" y="164" width="46" height="42" rx="3" fill="#b7cc98" transform="rotate(-8 103 164)"/><path d="M170 164l38-5 M166 180l44-6 M164 196l27-4" stroke="#8ba374" stroke-width="4" stroke-linecap="round"/><path d="M261 104c0 27-30 54-30 54s-30-27-30-54a30 30 0 1 1 60 0" fill="#d2e981"/><circle cx="231" cy="105" r="11" fill="#31573d"/><circle cx="353" cy="82" r="14" fill="#45664e"/><circle cx="353" cy="82" r="5" fill="#d2e981"/><circle cx="49" cy="227" r="6" fill="#d2e981"/></svg></div><div class="story-footer">${icon('shield',15)} Diseñado para trabajo en campo</div></section>
    <section class="login-panel"><div class="login-brand-mobile">${brand()}</div><div class="welcome-line">${icon('pin',14)} TU OPERACIÓN, EN UN SOLO LUGAR</div>
    <h1>${state.loginStep===1?'Bienvenido a tu equipo':'Verifica tu acceso'}</h1><p class="sub">${state.loginStep===1?'Ingresa con tu correo o número celular para acceder a tus campañas.':'En la app final recibirás un código. Para explorar estas pantallas, usa el código de ejemplo.'}</p>
    <form id="login-form">
    ${state.loginStep===1?`<div class="tabs"><button type="button" class="${mode?'active':''}" data-action="login-mode" data-mode="email">Correo electrónico</button><button type="button" class="${!mode?'active':''}" data-action="login-mode" data-mode="phone">Número celular</button></div>
    ${field(mode?'Correo electrónico':'Número celular','login-contact',`<input id="login-contact" name="contact" type="${mode?'email':'tel'}" ${mode?'':'pattern="[+0-9 ()-]{10,20}"'} value="${mode?'demo@example.invalid':'+52 000 000 0000'}" autocomplete="off" required>`)}
    <button class="btn" type="submit">Continuar en demostración ${icon('arrow',16)}</button>`:
    `${field('Código de demostración','login-code','<input id="login-code" name="code" inputmode="numeric" maxlength="6" minlength="6" pattern="[0-9]{6}" placeholder="123456" required autocomplete="off">')}<p class="sub" style="font-size:11px">Código de ejemplo: <strong>123456</strong></p><div id="login-error" class="form-error"></div><button class="btn" type="submit">Entrar al prototipo ${icon('arrow',16)}</button><button class="btn ghost" type="button" data-action="login-back">Cambiar método de acceso</button>`}
    </form><div class="notice">${icon('info',17)}<span><strong>Vista previa del sistema</strong><br>No se envían códigos ni invitaciones reales. Podrás cambiar de rol para revisar las pantallas.</span></div><div class="login-bottom">ControlPublicidad · Primera versión de diseño<br>Las funciones de seguridad y nube están pendientes de implementación.</div></section></div>`;
}
function renderServerLogin(){
  const email=state.loginMode==='email';
  app.innerHTML=`<div class="login"><section class="login-story">${brand()}<h2 class="story-title">Tu equipo.<br>Tu campaña.<br><span>Un mismo registro.</span></h2><p>Gestiona usuarios y campañas con permisos aplicados en el servidor.</p><div class="story-footer">${icon('shield',15)} Versión local de desarrollo</div></section><section class="login-panel"><div class="login-brand-mobile">${brand()}</div><div class="welcome-line">ACCESO AL SERVIDOR LOCAL</div><h1>${state.loginStep===1?'Accede a tu equipo':'Verifica tu acceso'}</h1><p class="sub">${state.loginStep===1?'Introduce el correo o celular asociado a tu usuario.':'Introduce el código generado para tu contacto. Caduca a los 5 minutos.'}</p><form id="login-form">
    ${state.loginStep===1?`<div class="tabs"><button type="button" class="${email?'active':''}" data-action="login-mode" data-mode="email">Correo electrónico</button><button type="button" class="${!email?'active':''}" data-action="login-mode" data-mode="phone">Número celular</button></div>${field(email?'Correo electrónico':'Celular con código de país','login-contact',`<input id="login-contact" name="contact" type="${email?'email':'tel'}" value="${e(state.loginContact||(email?'admin@example.invalid':''))}" placeholder="${email?'admin@example.invalid':'+52…'}" required autocomplete="username">`)}<button class="btn" type="submit">Solicitar código de prueba ${icon('arrow',16)}</button>`:
    `${field('Código de verificación','login-code','<input id="login-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code">')}${state.developmentCode?`<p class="sub" style="font-size:12px">Código de desarrollo: <strong>${e(state.developmentCode)}</strong></p>`:''}<button class="btn" type="submit">${new URLSearchParams(location.search).get('invite')?'Verificar y aceptar invitación':'Entrar'} ${icon('arrow',16)}</button><button class="btn ghost" type="button" data-action="login-back">Cambiar contacto</button>`}<div id="login-error" class="form-error" role="alert"></div></form><div class="notice amber">${icon('info',17)}<span>Servidor local de desarrollo. Los cambios se guardan en la base de datos. No se envían SMS ni correos; no es una conexión a la nube.</span></div><div class="login-bottom">Usuarios de prueba: admin@example.invalid · mariana@example.invalid · diego@example.invalid · sofia@example.invalid</div></section></div>`;
}
function renderPage(){return ({dashboard:dashboardPage,campaigns:campaignsPage,users:usersPage,evidence:evidencePage,map:mapPage,capture:capturePage,sync:syncPage}[state.view]||dashboardPage)();}
function dailyChart(records,personal=false){
  const days=dailyEvidence(records),peak=Math.max(1,...days.flatMap(d=>[d.photos,d.videos])),step=Math.max(1,Math.ceil(peak/4)),max=step*4;
  return `<section class="card daily-chart"><div class="section-heading"><div><h2>Evidencias por día</h2><p>Últimos 4 días con referencia a la captura más reciente · hora de México</p></div>${icon('chart',18)}</div><div class="daily-chart-grid"><div class="chart-axis" aria-label="Escala de cantidad de archivos">${[4,3,2,1,0].map(n=>`<span>${n*step}</span>`).join('')}</div><div class="chart-plot"><div class="chart-gridlines" aria-hidden="true">${[4,3,2,1,0].map(()=>'<i></i>').join('')}</div><div class="chart">${days.map(d=>`<div class="bar-group">${[['photo','photos','fotografías'],['video','videos','videos']].map(([kind,key,label])=>{const text=`${fmtDate(d.day+'T12:00:00Z',true)} · ${d[key]} ${label}`;return `<button class="chart-bar ${kind==='video'?'secondary':''}" data-action="chart-bar" data-day="${d.day}" data-media-kind="${kind}" data-personal="${personal}" data-count="${d[key]}" data-label="${e(text)}" aria-label="${e(text)}" aria-pressed="false"><span class="bar-fill" style="height:${d[key]/max*100}%"></span><span class="bar-tooltip" role="tooltip">${e(text)}</span></button>`;}).join('')}</div>`).join('')}</div></div><div></div><div class="chart-labels">${days.map(d=>`<span>${fmtDate(d.day+'T12:00:00Z',true)}</span>`).join('')}</div></div><div class="legend"><span><i></i>Fotografías</span><span><i class="pale"></i>Videos</span></div><p class="chart-readout" role="status" aria-live="polite">Pasa el cursor para ver la cantidad; toca una barra para abrir sus registros.</p></section>`;
}
function authorStatus(record){return data.memberships.find(m=>m.id===record.membershipId)?.status==='deleted'||user(record.author?.id)?.deleted?'<span class="author-deleted">Dado de baja</span>':'';}
function deleteUserDialog(id){
  const m=allowedMember(id);if(!m)return;
  let error='';try{assertDeletable(data,actor(),m);}catch(e){error=e.message;}
  showDialog('Eliminar usuario',`<p>¿Eliminar a <strong>${e(memberUser(m).name)}</strong>${m.global?'':` de ${e(campaign(m.campaignId)?.name)}`}?</p><div class="notice">${icon('shield',17)}<span>Sus registros y archivos permanecen con su nombre y la indicación «Dado de baja». Esta baja es definitiva.</span></div><p class="form-error" id="delete-error" role="alert">${e(error)}</p>`,`<button class="btn secondary" data-action="user-detail" data-id="${m.id}">Cancelar</button><button class="btn danger" data-action="confirm-delete-user" data-id="${m.id}" ${error?'disabled':''}>Confirmar eliminación</button>`);
}
async function deleteUser(id,button){
  button.disabled=true;
  try{
    const m=assertDeletable(data,actor(),allowedMember(id));
    if(serverMode){await api.request(m.global?'/api/users/'+m.userId:'/api/memberships/'+m.id,{method:'DELETE'});await refreshServer();}
    else{if(m.global){user(m.userId).deleted=true;user(m.userId).active=false;}else m.status='deleted';for(const i of data.invitations)if(i.status==='pending'&&(i.membershipId===m.id||m.global&&i.userId===m.userId))i.status='revoked';data.deletions.push({id:m.id,userId:m.userId,global:!!m.global,name:memberUser(m).name,source:'demo',confirmed:false});audit('Eliminó usuario; conserva evidencias',m.id);save();void syncDeletions();}
    modal.close();render();toast('Usuario dado de baja. Se conservan sus registros.');
  }catch(error){document.querySelector('#delete-error').textContent=error.message;button.disabled=false;}
}
function dashboardPage(){
  const records=ownRecords(),cs=visibleCampaigns(data,actor()),ms=scopedMemberships(data,actor()).filter(m=>m.status==='active');
  const people=new Set(ms.map(m=>m.userId)).size;
  const photos=records.reduce((a,r)=>a+r.media.filter(m=>m.kind==='photo').length,0);
  const vids=records.reduce((a,r)=>a+r.media.filter(m=>m.kind==='video').length,0);
  const recent=[...records].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).slice(0,3);
  return `${pageHead('Todo en su lugar.',`Hola, ${e(actor().name.split(' ')[0])}. Esta es la actividad de tus equipos.`,actor().role==='admin'?`<button class="btn" data-action="new-campaign">${icon('plus',17)} Nueva campaña</button>`:'','RESUMEN DE OPERACIÓN')}
  <div class="stats">${stat('Campañas activas',cs.length,'En tu alcance de supervisión','flag',true)}${stat('Registros',records.length,serverMode?'Registros íntegros confirmados':'Evidencias de ejemplo','layers')}${stat('Personas en equipo',people,'Usuarios activos en tu alcance','users')}${stat('Archivos registrados',photos+vids,`${photos} fotos · ${vids} videos`,'camera')}</div>
  <div class="dashboard-grid"><div class="stack"><section class="card"><div class="section-heading"><div><h2>Campañas en marcha</h2><p>Un equipo detrás de cada ubicación.</p></div><button data-nav="campaigns">Ver todas ${icon('arrow',13)}</button></div>
  ${cs.map(c=>{const count=records.filter(r=>r.campaignId===c.id).length;return `<div class="campaign-mini"><div class="campaign-icon ${c.color}">${icon('flag',21)}</div><div class="text"><h3>${e(c.name)}</h3><p>${e(c.location)}</p><div class="types" style="margin-top:8px">${c.types.map(typePill).join('')}</div></div><div class="metric">${count}<small>registros</small></div><button class="icon-btn" data-action="open-campaign" data-id="${c.id}" aria-label="Ver campaña ${e(c.name)}">${icon('chevron',15)}</button></div>`;}).join('')}</section>
  <section class="card"><div class="section-heading"><div><h2>Ubicaciones registradas</h2><p>Una mirada al trabajo en campo.</p></div><button data-nav="map">Explorar mapa ${icon('arrow',13)}</button></div>${mapComponent(records.slice(0,10),'mini')}</section></div>
  <div class="stack">${dailyChart(records)}
  <section class="card"><div class="section-heading"><div><h2>Últimos registros</h2><p>Lo más reciente de tu equipo.</p></div></div>${recent.map(r=>{const m=data.memberships.find(m=>m.id===r.membershipId);return `<div class="activity-row">${personAvatar(user(m?.userId))}<div class="text"><strong>${e(r.author?.name||user(m?.userId)?.name)}${authorStatus(r)}</strong><p>${TYPE_NAMES[r.type]} · ${e(campaign(r.campaignId)?.name)}<br>${fmtDate(r.capturedAt)}</p></div><button class="icon-btn" data-action="record-detail" data-id="${r.id}" aria-label="Abrir registro ${r.number}">${icon('chevron',14)}</button></div>`;}).join('')||empty('Aún no hay registros')}</section>
  <div class="notice">${icon('shield',17)}<span>La vista se ajusta a tu rol. Cambia de usuario arriba para comparar el alcance de cada equipo.</span></div></div></div>`;
}
function campaignsPage(){
  const cs=visibleCampaigns(data,actor()),records=ownRecords(),ms=scopedMemberships(data,actor());
  return `${pageHead('Campañas', 'Organiza el trabajo por ubicación y tipo de publicidad.',actor().role==='admin'?`<button class="btn" data-action="new-campaign">${icon('plus',17)} Nueva campaña</button>`:'','PLANIFICACIÓN')}
  <div class="campaign-grid">${cs.map(c=>`<article class="card campaign-card"><div class="campaign-cover ${c.color}"><span class="pill"><i class="dot"></i>En marcha</span><svg viewBox="0 0 210 160" fill="none" aria-hidden="true"><path d="M20 155L90 50l70 65 40-72 M0 108h210 M40 0v160 M150 0v160" stroke="#52735a" stroke-width="1.5"/><path d="M131 46c0 19-21 40-21 40s-21-21-21-40a21 21 0 1 1 42 0" fill="#718b62"/><circle cx="110" cy="46" r="7" fill="#e8eedb"/></svg></div><div class="campaign-body"><h2>${e(c.name)}</h2><div class="location">${icon('pin',14)}${e(c.location)}</div><div class="types">${c.types.map(typePill).join('')}</div><div class="owner">${personAvatar(user(c.leaderId))}<div><small>Líder de campaña</small>${e(user(c.leaderId)?.name)}</div></div><div class="campaign-numbers"><div><strong>${records.filter(r=>r.campaignId===c.id).length}</strong><small>Registros</small></div><div><strong>${ms.filter(m=>m.campaignId===c.id&&m.status==='active').length}</strong><small>Personas en tu alcance</small></div></div><button class="btn secondary" data-action="open-campaign" data-id="${c.id}">Ver campaña ${icon('arrow',15)}</button></div></article>`).join('')}</div>${!cs.length?empty('Sin campañas asignadas'):''}`;
}
function userList(){
  const needle=state.usersSearch.toLowerCase();
  const all=scopedMemberships(data,actor());
  if(actor().role==='admin'){
    for(const u of data.users.filter(u=>u.role==='leader'&&!data.memberships.some(m=>m.userId===u.id))){
      const inv=data.invitations.find(i=>i.userId===u.id&&i.status==='pending');
      all.push({id:'global:'+u.id,userId:u.id,role:'leader',campaignId:null,parentId:null,status:u.deleted?'deleted':inv?'invited':u.active===false?'inactive':'active',global:true});
    }
  }
  return all.filter(m=>{
    const u=memberUser(m);
    return (!state.userCampaign||m.campaignId===state.userCampaign)&&(!state.userRole||m.role===state.userRole)&&(state.userStatus?m.status===state.userStatus:!['transferred','deleted'].includes(m.status))&&(!needle||`${u?.name} ${u?.contact}`.toLowerCase().includes(needle));
  });
}
function usersPage(){
  const members=userList(),scope=scopedMemberships(data,actor());
  const active=new Set(scope.filter(m=>m.status==='active').map(m=>m.userId)).size;
  const pending=scope.filter(m=>m.status==='invited').length;
  const admins=actor().role==='admin';
  return `${pageHead('Usuarios y equipos','Tu equipo, de un vistazo.',`<div class="user-head-actions"><button class="btn secondary" data-action="invite-user">${icon('mail',17)} Invitar</button><button class="btn" data-action="new-user">${icon('plus',17)} Alta manual</button></div>`,'ADMINISTRACIÓN DE USUARIOS')}
  <div class="stats">${stat('Personas activas',active,'Dentro de tu alcance','users',true)}${stat('Coordinadores',scope.filter(m=>m.role==='coordinator'&&m.status==='active').length,'Equipos en operación','layers')}${stat('Colaboradores',scope.filter(m=>m.role==='collaborator'&&m.status==='active').length,'Captura de evidencias','camera')}${stat('Invitaciones',pending,'Pendientes de aceptación','mail')}</div>
  <div class="notice">${icon('shield',17)}<span>${admins?'Puedes administrar todos los equipos. Cada campaña mantiene un único líder.':actor().role==='leader'?'Puedes administrar tus coordinadores y consultar sus colaboradores. Cada coordinador administra su propia rama.':'Solo puedes administrar colaboradores asignados directamente a ti.'}</span></div>
  <div class="filters"><div class="search">${icon('search',16)}<input id="user-search" type="search" value="${e(state.usersSearch)}" aria-label="Buscar usuarios" placeholder="Buscar por nombre, correo o celular"></div>
  <select id="user-campaign" aria-label="Filtrar usuarios por campaña"><option value="">Todas las campañas</option>${campaignOptions(state.userCampaign)}</select>
  <select id="user-role" aria-label="Filtrar usuarios por rol"><option value="">Todos los roles</option>${['leader','coordinator','collaborator'].map(r=>`<option value="${r}" ${state.userRole===r?'selected':''}>${ROLE_NAMES[r]}</option>`).join('')}</select>
  <select id="user-status" aria-label="Filtrar usuarios por estado"><option value="">Todos los estados actuales</option>${[['active','Activos'],['inactive','Inactivos'],['invited','Invitados'],['deleted','Dados de baja'],['transferred','Historial de traslados']].map(([v,n])=>`<option value="${v}" ${state.userStatus===v?'selected':''}>${n}</option>`).join('')}</select></div>
  ${usersTree(members)}
  <details class="users-table-disclosure" id="users-table" ${state.tableOpen?'open':''}><summary>${icon('grid',18)}<span><strong>Ver tabla completa</strong><small>Contacto, campaña, superior y acciones · ${members.length} asignaciones</small></span>${icon('chevron',16)}</summary>${usersTable(members)}</details>
  <div class="table-footer"><span>${members.length} pertenencias en ${new Set(members.map(m=>m.campaignId)).size} campañas</span><span>Una baja conserva la autoría y las evidencias.</span></div>
  ${data.audit.length?`<section class="card" style="margin-top:15px"><h3>Últimos cambios${serverMode?'':' en la demo'}</h3><p class="sub" style="font-size:11px">${data.audit.filter(a=>admins||a.actorId===actor().id).slice(-3).reverse().map(a=>`${e(user(a.actorId)?.name)} · ${e(a.action)} · ${fmtDate(a.at)}`).join('<br>')||'Sin cambios realizados por ti.'}</p></section>`:''}`;
}
function usersTable(members){
  if(!members.length) return `<div class="card">${empty('No encontramos usuarios')}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Campaña</th><th>Superior</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${members.map(m=>{
    const u=memberUser(m),parent=data.memberships.find(x=>x.id===m.parentId);
    const manageable=canEdit(m);
    return `<tr><td><div class="person">${personAvatar(u)}<div><strong>${e(u?.name)}</strong><small>${e(u?.contact)}</small></div></div></td><td>${rolePill(m.role)}</td><td>${e(campaign(m.campaignId)?.name||'Sin asignar')}</td><td>${e(parent?user(parent.userId)?.name:'Administrador')}</td><td>${statusPill(m.status)}</td><td><div class="actions"><button class="icon-btn" data-action="user-detail" data-id="${m.id}" aria-label="Ver ${e(u?.name)}" title="Ver ficha">${icon('eye',16)}</button>${manageable?`<button class="icon-btn" data-action="edit-user" data-id="${m.id}" aria-label="Editar ${e(u?.name)}" title="Editar usuario">${icon('edit',15)}</button>`:`<span class="readonly">Consulta</span>`}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function usersTree(members){
  if(!members.length) return `<div class="card">${empty('No encontramos usuarios')}</div>`;
  const matches=new Set(members.map(m=>m.id)),included=new Map(members.map(m=>[m.id,m])),scope=scopedMemberships(data,actor());
  for(const m of members){let p=scope.find(x=>x.id===m.parentId);while(p&&!included.has(p.id)){included.set(p.id,p);p=scope.find(x=>x.id===p.parentId);}}
  const all=[...included.values()],filtered=Boolean(state.usersSearch||state.userRole||state.userStatus);
  const node=m=>{
    const u=memberUser(m),children=all.filter(x=>x.parentId===m.id),totals=teamSummary(data,m.id),open=filtered||(state.branchOpen[m.id]??m.role==='leader');
    const person=`<button class="tree-person ${matches.has(m.id)?'':'context-person'}" data-action="user-detail" data-id="${m.id}" aria-label="Ver ${e(u.name)}">${personAvatar(u)}<span class="tree-person-text"><strong>${e(u.name)}</strong><small>${ROLE_NAMES[m.role]}${matches.has(m.id)?'':' · Superior'}${m.status!=='active'?' · '+({inactive:'Inactivo',invited:'Invitado',deleted:'Dado de baja',transferred:'Historial'}[m.status]||m.status):''}</small></span><span class="tree-total"><strong>${totals.records}</strong><small>registros</small></span>${icon('eye',16)}</button>`;
    return children.length?`<details class="person-branch" data-branch="${m.id}" ${open?'open':''}><summary aria-label="Desplegar equipo de ${e(u.name)}"><span class="branch-chevron">${icon('chevron',16)}</span>${person}</summary><div class="people-children">${children.map(node).join('')}</div></details>`:`<div class="tree-leaf">${person}</div>`;
  };
  const groups=[...new Set(all.map(m=>m.campaignId))];
  return `<section class="people-tree"><div class="section-heading"><div><h2>Estructura del equipo</h2><p>Despliega una rama o toca una persona para ver su ficha.</p></div><div class="tree-tools"><button data-action="expand-teams">Expandir</button><button data-action="collapse-teams">Plegar</button></div></div>${actor().role==='admin'?`<button class="tree-admin" data-action="admin-detail">${personAvatar(actor())}<span><strong>${e(actor().name)}</strong><small>Administrador · ${data.campaigns.length} campañas</small></span>${icon('shield',18)}</button>`:''}<div class="tree">${groups.map(cid=>{const group=all.filter(m=>m.campaignId===cid),roots=group.filter(m=>!included.has(m.parentId));return `<section class="tree-branch"><div class="tree-campaign">${icon('flag',17)}<span>${e(campaign(cid)?.name||'Líderes sin campaña')}</span><small>${group.filter(m=>matches.has(m.id)).length} asignaciones</small></div>${roots.map(node).join('')}</section>`;}).join('')}</div></section>`;
}
function recordFilters(){
  const availableTypes=[...new Set((state.filters.campaign?[campaign(state.filters.campaign)]:visibleCampaigns(data,actor())).flatMap(c=>c?.types||[]))];
  return `<div class="filters"><select id="filter-campaign" aria-label="Filtrar evidencias por campaña"><option value="">Todas las campañas</option>${campaignOptions(state.filters.campaign)}</select>
  <div class="filter-dates"><input id="filter-from" type="date" aria-label="Fecha inicial" title="Fecha inicial" value="${state.filters.from}"><input id="filter-to" type="date" aria-label="Fecha final" title="Fecha final" value="${state.filters.to}"></div>
  <select id="filter-media-kind" aria-label="Filtrar evidencias por fotografía o video">${[['','Fotos y videos'],['photo','Fotografías'],['video','Videos']].map(([v,n])=>`<option value="${v}" ${state.filters.mediaKind===v?'selected':''}>${n}</option>`).join('')}</select>
  <div class="type-filter">${availableTypes.map(t=>`<label><input type="checkbox" name="filter-type" value="${t}" ${state.filters.types.includes(t)?'checked':''}>${TYPE_NAMES[t]}</label>`).join('')}</div><button class="btn ghost" data-action="clear-filters">Limpiar</button></div>`;
}
function evidencePage(){
  const rs=filtered();
  return `${pageHead('Evidencias','Cada registro conserva su autor, ubicación y momento de captura.',actor().role==='collaborator'?`<button class="btn secondary" data-nav="sync">Mis envíos</button>`:`<button class="btn secondary" data-nav="map">${icon('map',17)} Ver mapa</button>`,'REGISTROS DE CAMPO')}
  ${recordFilters()}${state.filters.personal?`<div class="notice">${icon('camera',16)}<span>Mostrando únicamente tus registros, según la selección de Mis envíos.</span></div>`:''}<div class="between" style="margin-bottom:18px"><span class="muted" style="font-size:11px">${rs.length} registros en tu alcance</span><span class="pill">${icon('shield',12)} Originales sellados</span></div>
  <div class="evidence-grid">${[...rs].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).map((r,i)=>{
    const m=data.memberships.find(m=>m.id===r.membershipId),photos=r.media.filter(m=>m.kind==='photo').length,vids=r.media.length-photos;
    return `<button class="card evidence-card" data-action="record-detail" data-id="${r.id}">${evidenceArt(r,i).replace('</div>',`<span class="photo-count">${icon('camera',12)} ${photos} ${vids?`· ${icon('video',12)} ${vids}`:''}</span></div>`)}<div class="evidence-body"><div class="between">${typePill(r.type)}<span class="muted" style="font-size:10px">#${String(r.number).padStart(3,'0')}</span></div><h3>${e(campaign(r.campaignId)?.name)}</h3><p>${e(r.author?.name||user(m?.userId)?.name)}${authorStatus(r)}</p><div class="meta"><span>${fmtDate(r.capturedAt)}</span><span>${Number.isFinite(r.accuracy)?'GPS ±'+r.accuracy+' m':'Sin GPS'}</span></div></div></button>`;
  }).join('')}</div>${!rs.length?`<div class="card">${empty('Sin evidencias con estos filtros')}</div>`:''}`;
}
function mapComponent(records,mode='full'){
  const pins=records.filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng));
  if(serverMode)return `<div class="map-art ${mode}" style="display:grid;place-items:center;padding:25px"><div class="empty">${icon('map',32)}<h3>Cartografía pendiente de conexión</h3><p>${pins.length} registros tienen GPS. Puedes consultar sus coordenadas y archivos en la lista.</p><p>El panel conectado conserva los datos originales y no dibuja posiciones sobre el esquema de demostración.</p></div></div>`;
  return `<div class="map-art ${mode}">${mapArt()}<div class="map-label">${icon('pin',13)} Morelia · Ubicaciones de ejemplo</div>
  ${pins.map(r=>{const x=Math.max(10,Math.min(89,15+(r.lng+101.201)*8500)),y=Math.max(12,Math.min(83,80-(r.lat-19.702)*9000));return `<button class="pin" style="left:${x}%;top:${y}%" data-action="record-detail" data-id="${r.id}" aria-label="Ver registro ${r.number}"><svg viewBox="0 0 30 34" aria-hidden="true"><path d="M28 14c0 10-13 19-13 19S2 24 2 14a13 13 0 1 1 26 0" fill="${r.type==='barda'?'#859760':r.type==='lona'?'#296550':'#a1844b'}" stroke="white" stroke-width="2"/></svg><span>${r.number}</span></button>`;}).join('')}
  <div class="map-caption">Esquema visual · Cartografía y navegación reales pendientes</div></div>`;
}
function mapPage(){
  const rs=filtered();
  return `${pageHead('El trabajo, en el mapa.','Filtra las ubicaciones y abre sus evidencias.',`<button class="btn secondary" data-nav="evidence">${icon('layers',17)} Ver registros</button>`,'VISTA TERRITORIAL')}
  ${recordFilters()}<div class="map-layout">${mapComponent(rs)}<aside class="map-list"><div class="list-head"><h3>${rs.length} ubicaciones</h3><p>Selecciona un punto para ver su registro.</p></div><div class="scroll">${rs.map(r=>`<button data-action="record-detail" data-id="${r.id}">${typePill(r.type)}<strong>#${String(r.number).padStart(3,'0')} · ${e(campaign(r.campaignId)?.name)}</strong><p>${fmtDate(r.capturedAt)}<br>${gpsLabel(r)}</p></button>`).join('')||empty('Sin ubicaciones')}</div></aside></div>`;
}
function draft(){
  const cs=captureCampaigns(data,actor());
  if(!data.drafts[actor().id]){
    const c=cs[0];
    data.drafts[actor().id]={id:ids(),campaignId:c?.id||'',type:c?.types.length===1?c.types[0]:'',notes:'',media:[],status:'draft',capturedAt:null};
  }
  const d=data.drafts[actor().id];
  if(d.status==='draft'&&!d.media.length){
    const c=cs.find(c=>c.id===d.campaignId)||cs[0],cid=c?.id||'',type=c?.types.includes(d.type)&&cid===d.campaignId?d.type:c?.types.length===1?c.types[0]:'';
    if(d.campaignId!==cid||d.type!==type){d.campaignId=cid;d.type=type;save();}
  }
  return d;
}
function capturePage(){
  if(serverMode)return `<div class="capture-wrap">${pageHead('Captura móvil','Tu cuenta ya está conectada al servidor.','','TRABAJO DE CAMPO')}<div class="card capture-success"><div class="success-icon">${icon('camera',30)}</div><h2>Próximo paso: app de captura</h2><p>El servidor ya recibe y verifica evidencias. La cámara, GPS y conservación cifrada en el celular se conectarán desde la app móvil.</p><div class="notice amber">${icon('info',17)}<span>En esta versión del panel no se capturan ni se simulan archivos reales.</span></div><button class="btn" data-nav="sync">Ver mis registros</button></div></div>`;
  if(state.successId){const r=data.records.find(r=>r.id===state.successId);return `<div class="capture-wrap">${pageHead('Registro listo','Tu evidencia de ejemplo quedó sellada.','','TRABAJO DE CAMPO')}<div class="card capture-success"><div class="success-icon">${icon('check',32)}</div><h2>Registro demo guardado</h2><p>Ya no se puede modificar ni eliminar desde esta vista. Puedes revisar el estado en Mis envíos.</p>${recordStatus(r)}<div class="notice amber">${icon('info',17)}<span>${r.cloudReceipt?'Los metadatos de este registro de prueba están confirmados en la nube.':'El registro de prueba está conservado en este dispositivo y pendiente de confirmación en la nube.'} Las fotos y videos son ilustraciones; la captura real y el cifrado en Android siguen pendientes.</span></div><button class="btn" data-nav="sync">${icon('upload',17)} Ver mis envíos</button><button class="btn secondary" data-action="new-record">Crear otro registro</button></div></div>`;}
  const d=draft(),cs=captureCampaigns(data,actor()),c=cs.find(c=>c.id===d.campaignId),photos=d.media.filter(m=>m.kind==='photo').length,vids=d.media.filter(m=>m.kind==='video').length;
  if(!c) return `${pageHead('Nuevo registro','Captura de evidencias')}<div class="card">${empty(d.media.length?'Borrador conservado: su campaña ya no está activa en tu equipo. Contacta al administrador antes de continuar.':'No tienes campañas activas asignadas')}</div>`;
  return `<div class="capture-wrap">${pageHead('Nuevo registro','Todo lo que necesitas, en un solo registro.','','TRABAJO DE CAMPO')}
  <div class="capture-steps"><span class="active"><i class="step-number">1</i>Campaña</span>${icon('chevron',12)}<span class="${d.media.length?'active':''}"><i class="step-number">2</i>Evidencias</span>${icon('chevron',12)}<span><i class="step-number">3</i>Guardar</span></div>
  <div class="stack"><section class="card capture-section"><h2>¿Dónde estás trabajando?</h2>${field('Campaña asignada','capture-campaign',`<select id="capture-campaign" ${d.media.length?'disabled':''}>${cs.map(c=>`<option value="${c.id}" ${c.id===d.campaignId?'selected':''}>${e(c.name)}</option>`).join('')}</select>`)}<p class="sub" style="font-size:11px">${icon('pin',13)}${e(c.location)}</p><label style="margin-top:18px">Tipo de publicidad <span class="muted">${c.types.length===1?'· único tipo habilitado':'· elige una opción'}</span></label><div class="type-choice">${c.types.map(t=>`<label><input type="radio" name="capture-type" value="${t}" ${d.type===t?'checked':''}>${TYPE_NAMES[t]}</label>`).join('')}</div></section>
  <section class="card capture-section"><div class="between"><h2 style="margin-bottom:0">Evidencias del registro</h2><span class="pill">Solo captura desde app</span></div><p class="sub" style="font-size:11px">Hasta 10 fotografías y 3 videos. Aquí agregaremos ejemplos para probar el flujo.</p>
  <div class="media-actions"><button class="capture-btn" data-action="add-media" data-kind="photo" ${photos>=10?'disabled':''}>${icon('camera',29)}Agregar foto demo<small>${photos} de 10 fotografías</small></button><button class="capture-btn" data-action="add-media" data-kind="video" ${vids>=3?'disabled':''}>${icon('video',29)}Agregar video demo<small>${vids} de 3 videos</small></button></div>
  <div class="thumbnails">${d.media.map((m,i)=>`<div class="thumb">${photoArt(i)}<button class="remove" data-action="remove-media" data-index="${i}" aria-label="Quitar ejemplo ${i+1}">${icon('close',12)}</button><p>${m.kind==='photo'?'Foto':'Video'} ${i+1} · demo</p></div>`).join('')}</div>
  <div class="capture-meta"><div><small>Autor · ${ROLE_NAMES[actor().role]}</small>${e(actor().name)}</div><div><small>Ubicación de ejemplo · GPS simulado</small>19.70500, −101.19800 · ±6 m</div><div><small>Fecha y hora del primer ejemplo</small>${d.capturedAt?fmtDate(d.capturedAt):'Se asignará al agregar evidencia'}</div><div><small>Dispositivo de ejemplo</small>Samsung · SM-A566E</div></div></section>
  <section class="card capture-section">${field('Notas del registro','capture-notes',`<textarea id="capture-notes" rows="3" maxlength="1000" placeholder="Agrega observaciones del punto…">${e(d.notes)}</textarea>`)}<p class="sub" style="font-size:10px">Opcional · máximo 1,000 caracteres.</p></section></div>
  <div class="capture-footer"><div class="row muted" style="font-size:10px">${icon('shield',15)} Borrador de ejemplo · sin evidencia real</div><button class="btn" data-action="seal-record" ${!d.media.length||!d.type?'disabled':''}>${icon('check',17)} Sellar registro demo</button></div><div class="notice amber" style="margin-top:18px">${icon('info',16)}<span>La captura con cámara, GPS real y almacenamiento cifrado se implementará en la app móvil.</span></div></div>`;
}
function syncPage(){
  const rs=personalRecords(),pending=rs.filter(r=>r.status==='pending');
  if(serverMode)return `${pageHead('Mis registros','Evidencias confirmadas por el servidor.','','TRABAJO DE CAMPO')}<div class="notice">${icon('shield',16)}<span>Solo aparecen registros con todos sus archivos verificados. La cola pendiente del teléfono se conectará en la app móvil.</span></div>${dailyChart(rs,true)}<div class="card" style="margin-top:20px">${rs.map(r=>`<div class="sync-row"><div><h3>${e(r.campaignName)}</h3><p>#${r.number} · ${r.media.length} archivos · ${fmtDate(r.capturedAt)}</p></div><button class="btn secondary" data-action="record-detail" data-id="${r.id}">Ver evidencia</button></div>`).join('')||empty('Aún no hay registros confirmados')}</div>`;
  return `${pageHead('Mis envíos','Revisa el estado de tus registros de ejemplo.','','TRABAJO DE CAMPO')}
  <div class="sync-banner"><div><h2>${pending.length?'Hay trabajo listo para enviar.':'Tus envíos están al día.'}</h2><p>${pending.length} registros pendientes · los originales permanecen sellados.<br>${state.cloudBusy?'Enviando registros de prueba…':pending.some(r=>r.cloudError)?e(pending.find(r=>r.cloudError).cloudError):cloud?'Al sellar se envía automáticamente. Si falla, se conserva para reintentar.':'Esta copia no tiene un servicio de nube conectado. Los registros permanecen pendientes.'}</p></div><button class="btn lime" data-action="sync" ${!pending.length||state.cloudBusy?'disabled':''}>${icon('upload',17)} ${state.cloudBusy?'Actualizando…':'Actualizar a la nube'}</button></div>
  ${dailyChart(rs,true)}<div class="card"><div class="section-heading"><h2>Registros de ${e(actor().name.split(' ')[0])}</h2><span class="pill">${rs.length} registros</span></div>${[...rs].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).map(r=>`<div class="sync-row"><div class="row"><div class="campaign-icon">${icon('camera',20)}</div><div><h3>${e(campaign(r.campaignId)?.name)}</h3><p>${TYPE_NAMES[r.type]} · ${r.media.length} archivos · ${fmtDate(r.capturedAt)}<br>${r.number?'#'+String(r.number).padStart(3,'0'):'Número final pendiente'}</p></div></div><div class="row">${recordStatus(r)}<button class="icon-btn" data-action="record-detail" data-id="${r.id}" aria-label="Ver registro">${icon('eye',16)}</button></div></div>`).join('')||empty('Aún no tienes registros')}</div><div class="notice amber" style="margin-top:18px">${icon('info',17)}<span>La nube almacena los metadatos de registros de prueba; no se transfieren archivos de fotos o videos reales. La cola de este prototipo no tiene cifrado en el dispositivo.</span></div>`;
}
function showDialog(title,body,foot=''){
  modal.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close-dialog" aria-label="Cerrar ventana">${icon('close',18)}</button></div><div class="dialog-body">${body}</div>${foot?`<div class="dialog-foot">${foot}</div>`:''}`;
  if(!modal.open) modal.showModal();
}
function allowedMember(id){return scopedMemberships(data,actor()).find(m=>m.id===id)||(actor().role==='admin'&&id.startsWith('global:')&&user(id.slice(7))?{id,userId:id.slice(7),global:true,role:'leader',status:user(id.slice(7))?.deleted?'deleted':data.invitations.some(i=>i.userId===id.slice(7)&&i.status==='pending')?'invited':user(id.slice(7))?.active===false?'inactive':'active'}:null);}
function userDialog(id,edit=false){
  const m=allowedMember(id);
  if(!m||edit&&!canEdit(m)){toast('No tienes permiso para modificar este usuario.');return;}
  const u=memberUser(m),parent=data.memberships.find(x=>x.id===m.parentId);
  if(edit){
    const activeChildren=data.memberships.some(x=>x.parentId===m.id&&x.status==='active');
    showDialog('Editar usuario',`<div class="row">${personAvatar(u,true)}<div><h3>${e(u.name)}</h3><p class="sub" style="font-size:11px">${ROLE_NAMES[m.role]} · ${e(campaign(m.campaignId)?.name)}</p></div></div><form id="edit-user-form" data-id="${m.id}" class="stack">${field('Nombre visible','edit-name',`<input id="edit-name" name="name" required maxlength="80" value="${e(u.name)}">`)}
    ${field(m.global?'Estado de la cuenta':'Estado en esta campaña','edit-status',`<select id="edit-status" name="status"><option value="active" ${m.status==='active'?'selected':''}>Activo</option><option value="inactive" ${m.status==='inactive'?'selected':''} ${activeChildren||m.role==='leader'&&!m.global?'disabled':''}>Inactivo</option></select>`)}
    <div class="notice">${icon('shield',16)}<span>La baja afecta solo a esta campaña y conserva las evidencias. ${activeChildren?'Este usuario tiene personas activas a su cargo; primero debe resolverse su equipo.':''}</span></div>
    <p class="muted" style="font-size:11px">Contacto: ${e(u.contact)}<br>Cambiar el correo o celular requerirá verificación en la versión con servidor.</p><div class="form-error" id="edit-error"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" type="submit" form="edit-user-form">Guardar cambios</button>`);
  }else{
    const totals=teamSummary(data,m.id);
    const inv=data.invitations.find(i=>(i.membershipId===m.id||(m.global&&i.userId===m.userId))&&i.status==='pending');
    const editable=canEdit(m);
    const name=editable?`<h2><button class="profile-name" data-action="edit-profile-name" data-id="${m.id}" aria-label="Editar nombre de ${e(u.name)}" title="Toca o mantén presionado para editar">${e(u.name)}${icon('edit',15)}</button></h2>`:`<h2>${e(u.name)}</h2>`;
    const status=editable?`<button class="profile-status pill ${m.status==='active'?'green':''}" data-action="toggle-user-status" data-id="${m.id}" aria-label="${m.status==='active'?'Desactivar':'Activar'} a ${e(u.name)}" aria-pressed="${m.status==='active'}"><i class="dot"></i>${m.status==='active'?'Activo':'Inactivo'}</button>`:statusPill(m.status);
    showDialog('Ficha del usuario',`<div class="row profile-heading">${personAvatar(u,true)}<div class="profile-heading-content"><div id="profile-name-slot">${name}</div><div class="profile-controls">${rolePill(m.role)}${status}${canMove(m)?`<button class="profile-change" data-action="move-user" data-id="${m.id}" aria-label="Cambiar campaña de ${e(u.name)}">${icon('arrow',18)} Cambiar</button>`:''}</div></div></div><p class="profile-edit-hint">${editable?'Toca el nombre para editarlo y el estado para activarlo o desactivarlo.':'Consulta de la rama autorizada. Su superior directo administra este usuario.'}</p><div class="form-error" id="profile-error" role="alert"></div><div class="details-grid"><div><small>Correo o celular${serverMode?'':' · ejemplo'}</small><strong>${e(u.contact)}</strong></div><div><small>Campaña</small><strong>${e(campaign(m.campaignId)?.name||'Sin asignar')}</strong></div><div><small>Superior directo</small><strong>${e(parent?memberUser(parent).name:'Administrador')}</strong></div><div><small>Registros propios</small><strong>${totals.own}</strong></div></div><section class="team-summary"><h3>Resumen de su equipo</h3><div class="team-totals"><div><strong data-total="records">${totals.records}</strong><small>Registros</small></div><div><strong data-total="photos">${totals.photos}</strong><small>Fotos</small></div><div><strong data-total="videos">${totals.videos}</strong><small>Videos</small></div><div><strong data-total="people">${totals.people}</strong><small>Personas activas</small></div></div><p class="sub">Totales de esta campaña, incluida la persona seleccionada y las evidencias históricas de su rama.</p></section>`,`<button class="btn secondary" data-action="close-dialog">Cerrar</button>${!['deleted','transferred'].includes(m.status)&&(m.global?actor().role==='admin':canManageMember(data,actor(),m))?`<button class="btn danger" data-action="delete-user" data-id="${m.id}">${icon('trash',16)} Eliminar usuario</button>`:''}${inv&&canManageMember(data,actor(),m)?`<button class="btn secondary" data-action="view-invitation" data-id="${inv.id}">Ver invitación</button>`:''}`);
  }
}
function manualUserDialog(){
  if(actor().role==='collaborator')return;
  const cs=visibleCampaigns(data,actor()).filter(c=>c.status==='active');
  showDialog('Alta manual de usuario',`<form id="manual-user-form" class="stack">${field('Nombre completo','manual-name','<input id="manual-name" name="name" required maxlength="80" autocomplete="name">')}${field('Correo o celular con código de país','manual-contact','<input id="manual-contact" name="contact" required placeholder="persona@example.invalid o +525512345678" autocomplete="off">')}${actor().role==='admin'?field('Rol','manual-role','<select id="manual-role" name="role"><option value="coordinator">Coordinador</option><option value="collaborator">Colaborador</option><option value="leader">Líder sin campaña</option></select>'):`<p class="sub">Darás de alta un ${ROLE_NAMES[CHILD_ROLE[actor().role]].toLowerCase()} en tu equipo.</p>`}${field('Campaña','manual-campaign',`<select id="manual-campaign" name="campaignId" required>${cs.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join('')}</select>`)}${actor().role==='admin'?field('Superior directo','manual-parent',assignmentParentSelect('manual',cs[0]?.id,'coordinator')):''}<div class="notice">${icon('shield',16)}<span>El usuario queda activo en su equipo. ${serverMode?'Al entrar deberá verificar su correo o celular; el servidor de desarrollo muestra el código de prueba.':'Usa datos ficticios: esta vista de prueba guarda cambios solo en tu navegador.'} Los líderes se asignan al crear una campaña.</span></div><div class="form-error" id="manual-error" role="alert"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" type="submit" form="manual-user-form">Dar de alta</button>`);
}
function assignmentParentSelect(prefix,cid,role){
  return `<select id="${prefix}-parent" name="parentId" required>${data.memberships.filter(m=>m.campaignId===cid&&m.role===(role==='coordinator'?'leader':'coordinator')&&m.status==='active').map(m=>`<option value="${m.id}">${e(memberUser(m).name)}</option>`).join('')}</select>`;
}
function moveCandidates(m){
  return data.memberships.filter(p=>{try{transferTarget(data,actor(),m.id,p.id);return true;}catch{return false;}});
}
function moveSuperiorFields(m,cid){
  const parents=moveCandidates(m).filter(p=>p.campaignId===cid);
  const options=rows=>rows.map(p=>`<option value="${p.id}">${e(memberUser(p).name)}</option>`).join('');
  if(m.role==='coordinator')return field('Líder de destino','move-parent',`<select id="move-parent" name="parentId" required><option value="">Selecciona el líder</option>${options(parents)}</select>`);
  const leaders=data.memberships.filter(l=>l.campaignId===cid&&l.role==='leader'&&l.status==='active');
  return field('Líder de destino','move-leader',`<select id="move-leader" required>${options(leaders)}</select>`)+field('Coordinador de destino','move-parent',`<select id="move-parent" name="parentId" required><option value="">Selecciona el coordinador</option>${options(parents.filter(p=>p.parentId===leaders[0]?.id))}</select>`);
}
function moveUserDialog(id){
  const m=allowedMember(id);if(!m||!canMove(m))return;
  const destinations=moveCandidates(m),cids=new Set(destinations.map(p=>p.campaignId)),cs=data.campaigns.filter(c=>cids.has(c.id));
  const team=data.memberships.filter(x=>x.parentId===m.id&&x.status!=='transferred');
  showDialog('Cambiar campaña y equipo',`<form id="move-user-form" data-id="${m.id}" class="stack"><div class="row">${personAvatar(memberUser(m),true)}<div><h3>${e(memberUser(m).name)}</h3><p class="sub">${ROLE_NAMES[m.role]} · ${e(campaign(m.campaignId)?.name)}</p></div></div>${field('Campaña de destino','move-campaign',`<select id="move-campaign" name="campaignId" required><option value="">Selecciona la campaña</option>${cs.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join('')}</select>`)}<div id="move-superior-fields" class="stack">${moveSuperiorFields(m,'')}</div>${m.role==='coordinator'?`<div class="notice">${icon('users',16)}<span>Se trasladarán también sus ${team.length} colaboradores, conservando el estado de cada persona.</span></div>`:''}<div class="notice">${icon('shield',16)}<span>Las futuras capturas pertenecerán al equipo de destino. Las evidencias anteriores conservan su campaña y rama de origen. Finaliza y envía los borradores locales antes del traslado.</span></div><div class="form-error" id="move-error" role="alert">${cs.length?'':'No hay destinos disponibles. Verifica los superiores activos, las pertenencias existentes y las invitaciones pendientes.'}</div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" type="submit" form="move-user-form" ${cs.length?'':'disabled'}>Guardar cambio</button>`);
}
function editProfileName(id){
  const m=allowedMember(id);if(!m||!canEdit(m)||document.querySelector('#profile-name-form'))return;
  const slot=document.querySelector('#profile-name-slot');if(!slot)return;
  slot.innerHTML=`<form id="profile-name-form" data-id="${m.id}" class="profile-name-form"><label class="visually-hidden" for="profile-name-input">Nombre de la persona</label><input id="profile-name-input" name="name" value="${e(memberUser(m).name)}" required maxlength="80" autocomplete="off"><div class="profile-name-actions"><button class="btn secondary" type="button" data-action="cancel-profile-name" data-id="${m.id}">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`;
  const input=document.querySelector('#profile-name-input');input.focus();input.select();
}
async function updateProfile(id,{name,status}){
  const m=allowedMember(id);if(!m||!canEdit(m))throw Error('No tienes permiso para editar este usuario.');
  name=String(name||'').trim();if(!name||name.length>80)throw Error('Escribe un nombre de hasta 80 caracteres.');
  if(!['active','inactive'].includes(status))throw Error('Estado inválido.');
  if(status==='inactive'&&m.role==='leader'&&!m.global)throw Error('La campaña debe conservar su líder activo.');
  if(status==='inactive'&&data.memberships.some(p=>p.parentId===m.id&&p.status==='active'))throw Error('Primero traslada o desactiva a las personas activas de su equipo.');
  if(status==='active'&&m.parentId&&!data.memberships.some(p=>p.id===m.parentId&&p.status==='active'))throw Error('Reactiva primero al superior directo.');
  if(serverMode){await api.request(m.global?'/api/users/'+m.userId:'/api/memberships/'+m.id,{method:'PATCH',body:{name,status}});await refreshServer();}
  else{
    if(m.global){user(m.userId).name=name;user(m.userId).active=status==='active';}else m.displayName=name;
    if(actor().role==='admin')user(m.userId).name=name;m.status=status;audit('Actualizó usuario',m.id);save();
  }
  render();userDialog(id);
}

function campaignDialog(){
  if(actor().role!=='admin'){toast('Solo el administrador puede crear campañas.');return;}
  showDialog('Nueva campaña',`<form id="campaign-form" class="stack">${field('Nombre de campaña','campaign-name','<input id="campaign-name" name="name" maxlength="100" placeholder="Ej. Presencia en el centro" required>')}${field('Ubicación','campaign-location','<input id="campaign-location" name="location" maxlength="150" placeholder="Zona, ciudad o referencia" required>')}${field('Líder general · una persona','campaign-leader',`<select id="campaign-leader" name="leaderId" required><option value="">Selecciona un líder</option>${data.users.filter(u=>u.role==='leader'&&u.active!==false).map(u=>`<option value="${u.id}">${e(u.name)}</option>`).join('')}</select>`)}<div><label>Tipos de campaña · selecciona uno o varios</label><div class="type-choice">${Object.entries(TYPE_NAMES).map(([v,n])=>`<label><input type="checkbox" name="types" value="${v}">${n}</label>`).join('')}</div><p class="sub" style="font-size:11px">Dos o más opciones crean una campaña mixta.</p></div><div class="form-error" id="campaign-error"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" form="campaign-form" type="submit">Crear campaña</button>`);
}
function inviteDialog(){
  if(actor().role==='collaborator'){toast('Tu rol no permite invitar usuarios.');return;}
  const cs=visibleCampaigns(data,actor());
  showDialog('Invitar a tu equipo',`<form id="invite-form" class="stack">${field('Nombre de la persona','invite-name','<input id="invite-name" name="name" maxlength="80" placeholder="Nombre y apellidos" required>')}${field(serverMode?'Correo o celular con código de país':'Correo electrónico de ejemplo','invite-contact',`<input id="invite-contact" name="contact" type="${serverMode?'text':'email'}" placeholder="persona@example.invalid" value="persona@example.invalid" required>`)}
  ${field('Campaña','invite-campaign',`<select id="invite-campaign" name="campaignId" required>${cs.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join('')}</select>`)}
  ${actor().role==='admin'?`<div class="form-grid">${field('Rol asignado','invite-role',`<select id="invite-role" name="role"><option value="coordinator">Coordinador</option><option value="collaborator">Colaborador</option>${serverMode?'<option value="leader">Líder sin campaña</option>':''}</select>`)}${field('Superior directo','invite-parent',inviteParentSelect(cs[0]?.id,'coordinator'))}</div><p class="muted" style="font-size:11px">El líder se asigna al crear la campaña. Cada campaña tiene un único líder.</p>`:`<div class="notice">${icon('users',17)}<span>Invitarás a un <strong>${ROLE_NAMES[CHILD_ROLE[actor().role]].toLowerCase()}</strong>. Quedará asignado directamente a ti en esta campaña.</span></div>`}
  <div class="notice amber">${icon('info',16)}<span>${serverMode?'La invitación se acepta después de verificar el contacto. El servidor local no envía mensajes; puedes copiar el enlace.':'Usa datos ficticios. En esta demo no se envían mensajes ni se concede acceso real.'}</span></div><div class="form-error" id="invite-error"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" type="submit" form="invite-form">${serverMode?'Crear invitación':'Generar invitación demo'}</button>`);
}
function inviteParentSelect(campaignId,role){
  const expected=role==='coordinator'?'leader':'coordinator';
  return `<select id="invite-parent" name="parentId" required>${data.memberships.filter(m=>m.campaignId===campaignId&&m.role===expected&&m.status==='active').map(m=>`<option value="${m.id}">${e(user(m.userId)?.name)}</option>`).join('')}</select>`;
}
function invitationResult(inviteId){
  const inv=data.invitations.find(i=>i.id===inviteId);
  if(serverMode){
    if(!inv)return;
    const m=data.memberships.find(m=>m.id===inv.membershipId);
    if(m?!canManageMember(data,actor(),m):actor().role!=='admin')return;
    const link=state.inviteLinks[inviteId],u=user(m?.userId||inv.userId);
    showDialog('Invitación de acceso',`<div class="invitation-preview">${icon('mail',32)}<h3>${e(u?.name)}</h3><p class="muted">${ROLE_NAMES[inv.role]} · ${e(campaign(m?.campaignId)?.name||'Líder sin campaña asignada')}</p><span class="pill amber">Pendiente de aceptación</span></div>${link?field('Enlace de invitación','invite-link',`<textarea id="invite-link" rows="3" readonly>${e(link)}</textarea>`):'<p class="muted">Renueva el enlace para compartirlo. El enlace anterior dejará de funcionar.</p>'}<div class="invite-channels"><button data-action="live-share" data-id="${inv.id}" ${!link?'disabled':''}>${icon('link',24)}Compartir</button><button data-action="copy-invite" data-id="${inv.id}" ${!link?'disabled':''}>${icon('mail',24)}Copiar enlace</button><button data-action="renew-invite" data-id="${inv.id}">${icon('clock',24)}Renovar</button></div><div class="notice amber">${icon('info',16)}<span>Este servidor solo funciona en la computadora local. El enlace podrá usarse desde otros dispositivos después de configurar el alojamiento. El código QR está pendiente de integración.</span></div>`,`<button class="btn secondary" data-action="revoke-invite" data-id="${inv.id}">Cancelar invitación</button><button class="btn" data-action="close-dialog">Listo</button>`);
    return;
  }
  const member=data.memberships.find(m=>m.id===inv?.membershipId);
  if(!inv||!member||!canManageMember(data,actor(),member)) return;
  showDialog('Invitación preparada · demo',`<div class="invitation-preview">${icon('mail',32)}<h3>${e(user(member.userId)?.name)}</h3><p class="muted" style="font-size:11px">${ROLE_NAMES[member.role]} · ${e(campaign(member.campaignId)?.name)}</p><code>DEMO-${e(inv.token.slice(0,12))}</code><span class="pill amber">Pendiente · no concede acceso</span></div><div class="invite-channels"><button data-action="invite-channel" data-channel="QR">${icon('grid',24)}Código QR</button><button data-action="invite-channel" data-channel="correo">${icon('mail',24)}Correo</button><button data-action="invite-channel" data-channel="WhatsApp">${icon('phone',24)}WhatsApp</button></div><p class="muted" style="font-size:11px;line-height:1.7">Estas opciones muestran el flujo previsto. El QR y la integración para compartir se activarán cuando exista un servicio de invitaciones.</p>`,`<button class="btn secondary" data-action="revoke-invite" data-id="${inv.id}">Cancelar invitación</button><button class="btn" data-action="close-dialog">Listo</button>`);
}
function recordDialog(id,seq=1){
  const r=ownRecords().find(r=>r.id===id);
  if(!r){toast('Este registro está fuera de tu alcance.');return;}
  const m=data.memberships.find(m=>m.id===r.membershipId),u=r.author||user(m?.userId),selected=r.media[seq-1]||r.media[0],gps=selected.gps||r,mapsUrl=googleMapsUrl(gps);
  const gpsField=`<small>${serverMode?'GPS al capturar':'GPS de ejemplo'}${Number.isFinite(gps.accuracy)?' · precisión ±'+gps.accuracy+' m':''}</small><strong>${gpsLabel(gps)}</strong>`;
  const filename=r.number?finalFilename(r.campaignName||campaign(r.campaignId)?.name||'Campaña',r.number,seq,selected.kind==='video'?'mp4':'jpg'):'Nombre final pendiente de sincronización';
  showDialog(`Registro ${r.number?'#'+String(r.number).padStart(3,'0'):'pendiente'}`,`<div class="between"><span>${e(campaign(r.campaignId)?.name)}</span>${typePill(r.type)}</div>${serverMode?`<div class="photo-art">${selected.kind==='photo'?`<img src="/api/records/${r.id}/media/${selected.id}" alt="Evidencia registrada" style="width:100%;height:100%;object-fit:contain">`:`<video controls playsinline src="/api/records/${r.id}/media/${selected.id}" style="width:100%;height:100%"></video>`}</div>`:selected.kind==='photo'?photoArt(seq):`<div class="media-placeholder"><div>${icon('video',42)}<p>Video de ejemplo</p><small>No se ha grabado un archivo real.</small></div></div>`}<div class="detail-media-tabs">${r.media.map((x,i)=>`<button class="${seq===i+1?'active':''}" data-action="record-media" data-id="${r.id}" data-seq="${i+1}">${x.kind==='photo'?'Foto':'Video'} ${i+1}</button>`).join('')}</div>
  <p class="muted" style="font-size:10px;overflow-wrap:anywhere">${e(filename)}</p><div class="details-grid"><div><small>Autor del registro</small><strong>${e(r.author?.name||u?.name)}${authorStatus(r)}</strong></div><div><small>${selected.kind==='video'?'Inicio de grabación':'Fecha y hora'} ${serverMode?'':'· ejemplo'}</small><strong>${fmtDate(selected.capturedAt||r.capturedAt)}</strong></div><div class="gps-field">${mapsUrl?`<a class="gps-link" href="${e(mapsUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir coordenadas ${e(gps.lat)}, ${e(gps.lng)} en Google Maps">${gpsField}<span>Abrir en Google Maps</span></a>`:gpsField}</div><div><small>Dispositivo ${serverMode?'':'· ejemplo'}</small><strong>${e(r.device.brand)} · ${e(r.device.model)}</strong></div><div><small>Identificador de instalación</small><strong style="overflow-wrap:anywhere">${e(r.device.installationId)}</strong></div><div><small>Estado</small>${recordStatus(r)}</div></div><div><label>Notas</label><p class="sub" style="font-size:12px">${e(r.notes||'Sin notas.')}</p></div><div class="notice">${icon('shield',16)}<span>Registro sellado. Las evidencias originales no pueden modificarse ni eliminarse desde esta vista.</span></div>`,`<button class="btn secondary" data-action="close-dialog">Cerrar</button>`);
}

document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-nav]');
  if(nav){event.preventDefault();navigate(nav.dataset.nav);return;}
  const target=event.target.closest('[data-action]');
  if(!target) return;
  const {action,id,mode,kind,index,layout,seq,channel}=target.dataset;
  if(serverMode&&['logout','revoke-invite','renew-invite','copy-invite','live-share','accept-invite'].includes(action)){
    try{
      if(action==='logout'){await api.request('/api/auth/logout',{method:'POST'});api.csrf=null;state.logged=false;state.loginStep=1;state.developmentCode='';state.inviteLinks={};modal.close();render();}
      if(action==='revoke-invite'){await api.request('/api/invitations/'+id,{method:'DELETE'});delete state.inviteLinks[id];await refreshServer();modal.close();render();toast('Invitación cancelada en el servidor.');}
      if(action==='renew-invite'){const result=await api.request('/api/invitations/'+id+'/renew',{method:'POST'});state.inviteLinks[id]=result.link;await refreshServer();invitationResult(id);}
      if(action==='copy-invite'){await navigator.clipboard.writeText(state.inviteLinks[id]);toast('Enlace copiado.');}
      if(action==='live-share'){const link=state.inviteLinks[id];if(navigator.share)await navigator.share({title:'Invitación a ControlPublicidad',text:'Únete a tu equipo de campaña.',url:link});else{await navigator.clipboard.writeText(link);toast('Enlace copiado. Puedes pegarlo en correo o WhatsApp.');}}
      if(action==='accept-invite'){const value=new URLSearchParams(location.search).get('invite');await api.request('/api/invitations/accept',{method:'POST',body:{token:value}});history.replaceState(null,'','/?server=1');await refreshServer();modal.close();render();toast('Invitación aceptada.');}
    }catch(error){toast(error.message);}
    return;
  }
  switch(action){
    case 'close-dialog':modal.close();break;
    case 'logout':modal.close();state.logged=false;state.loginStep=1;render();break;
    case 'login-mode':state.loginMode=mode;renderLogin();break;
    case 'login-back':state.loginStep=1;renderLogin();break;
    case 'new-campaign':campaignDialog();break;
    case 'open-campaign':state.filters={campaign:id,types:[...campaign(id).types],from:'',to:'',mediaKind:'',personal:false};navigate('evidence');break;
    case 'invite-user':inviteDialog();break;
    case 'new-user':manualUserDialog();break;
    case 'delete-user':deleteUserDialog(id);break;
    case 'confirm-delete-user':await deleteUser(id,target);break;
    case 'chart-bar':{const day=target.dataset.day,mediaKind=target.dataset.mediaKind;if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['photo','video'].includes(mediaKind))return;state.filters={campaign:'',types:Object.keys(TYPE_NAMES),from:day,to:day,mediaKind,personal:target.dataset.personal==='true'};navigate('evidence');break;}
    case 'move-user':moveUserDialog(id);break;
    case 'edit-profile-name':editProfileName(id);break;
    case 'cancel-profile-name':userDialog(id);break;
    case 'toggle-user-status':{
      const m=allowedMember(id);if(!m||!canEdit(m)||target.disabled)return;
      target.disabled=true;
      try{await updateProfile(id,{name:memberUser(m).name,status:m.status==='active'?'inactive':'active'});}
      catch(error){const el=document.querySelector('#profile-error');if(el)el.textContent=error.message;else toast(error.message);}
      finally{if(target.isConnected)target.disabled=false;}
      break;
    }
    case 'deactivate-user':userDialog(id,true);if(document.querySelector('#edit-status option[value="inactive"]:not(:disabled)'))document.querySelector('#edit-status').value='inactive';break;
    case 'admin-detail':{const records=ownRecords(),media=records.flatMap(r=>r.media);showDialog('Ficha del administrador',`<div class="row">${personAvatar(actor(),true)}<div><h2>${e(actor().name)}</h2><p class="sub">${e(actor().contact)}</p></div></div><div class="team-totals"><div><strong>${records.length}</strong><small>Registros</small></div><div><strong>${media.filter(m=>m.kind==='photo').length}</strong><small>Fotos</small></div><div><strong>${media.filter(m=>m.kind==='video').length}</strong><small>Videos</small></div><div><strong>${new Set(data.memberships.filter(m=>m.status==='active').map(m=>m.userId)).size}</strong><small>Personas activas</small></div></div><p class="sub">Resumen de todas las campañas.</p>`,`<button class="btn" data-action="close-dialog">Cerrar</button>`);break;}
    case 'view-invitation':invitationResult(id);break;
    case 'user-detail':userDialog(id);break;
    case 'edit-user':userDialog(id,true);break;
    case 'expand-teams':case 'collapse-teams':for(const m of scopedMemberships(data,actor()))state.branchOpen[m.id]=action==='expand-teams';render();break;
    case 'record-detail':recordDialog(id);break;
    case 'record-media':recordDialog(id,Number(seq));break;
    case 'clear-filters':state.filters={campaign:'',types:[],from:'',to:'',mediaKind:'',personal:false};render();break;
    case 'add-media':{
      const d=draft();assertEditable(d);
      if(kind!=='photo'&&kind!=='video')return;
      const limit=kind==='photo'?10:3;
      if(d.media.filter(m=>m.kind===kind).length>=limit){toast('Se alcanzó el límite de evidencias.');return;}
      const at=new Date().toISOString();d.capturedAt ||= at;d.media.push({kind,seq:d.media.length+1,capturedAt:at});save();render();break;
    }
    case 'remove-media':{
      const d=draft();assertEditable(d);d.media.splice(Number(index),1);d.media.forEach((m,i)=>m.seq=i+1);if(!d.media.length)d.capturedAt=null;save();render();break;
    }
    case 'seal-record':{
      const d=draft();try{assertEditable(d);const member=assertCapture(data,actor(),d.campaignId,d.type,d.media);
      const record={...structuredClone(d),source:'demo',author:{id:actor().id,name:memberUser(member).name},campaignName:campaign(d.campaignId).name,membershipId:member.id,status:'pending',number:null,lat:19.705,lng:-101.198,accuracy:6,device:{name:'Equipo demo',brand:'Samsung',model:'SM-A566E',installationId:'demo-installation-'+actor().id}};
      record.cloudPayload=cloudPayload(record);data.records.push(record);if(!save()){data.records.pop();return;}delete data.drafts[actor().id];save();state.successId=record.id;render();await syncCloud();}catch(err){toast(err.message);}break;
    }
    case 'new-record':delete data.drafts[actor().id];state.successId=null;save();navigate('capture');break;
    case 'sync':await syncCloud(true);break;
    case 'invite-channel':toast(`Vista ${channel}: integración pendiente. No se ha enviado ninguna invitación.`);break;
    case 'revoke-invite':{
      const inv=data.invitations.find(i=>i.id===id),m=data.memberships.find(m=>m.id===inv?.membershipId);
      if(!m||!canManageMember(data,actor(),m))return;
      inv.status='revoked';m.status='inactive';audit('Canceló invitación',m.id);save();modal.close();render();toast('Invitación demo cancelada.');break;
    }
  }
});
document.addEventListener('toggle',event=>{const el=event.target;if(el.id==='users-table')state.tableOpen=el.open;if(el.dataset?.branch)state.branchOpen[el.dataset.branch]=el.open;},true);
let namePress=null;
const cancelNamePress=()=>{if(namePress)clearTimeout(namePress.timer);namePress=null;};
document.addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-action="edit-profile-name"]');if(!button||event.button>0)return;
  cancelNamePress();namePress={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{namePress=null;editProfileName(button.dataset.id);},550)};
});
document.addEventListener('pointermove',event=>{if(namePress&&Math.hypot(event.clientX-namePress.x,event.clientY-namePress.y)>8)cancelNamePress();});
document.addEventListener('pointerup',cancelNamePress);
document.addEventListener('pointercancel',cancelNamePress);
document.addEventListener('contextmenu',event=>{if(event.target.closest('[data-action="edit-profile-name"]'))event.preventDefault();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&event.target.closest('#profile-name-form')){event.preventDefault();event.stopPropagation();userDialog(event.target.closest('form').dataset.id);}});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='demo-role'){
    state.actorId=el.value;state.filters={campaign:'',types:Object.keys(TYPE_NAMES),from:'',to:'',mediaKind:'',personal:false};state.usersSearch='';state.userCampaign='';state.userRole='';state.userStatus='';state.successId=null;
    state.view=actor().role==='collaborator'?'capture':'dashboard';render();return;
  }
  const userFilters={'user-campaign':'userCampaign','user-role':'userRole','user-status':'userStatus'};
  if(userFilters[el.id]){state[userFilters[el.id]]=el.value;render();return;}
  if(el.id==='filter-campaign'){state.filters.campaign=el.value;state.filters.types=el.value?[...campaign(el.value).types]:Object.keys(TYPE_NAMES);render();return;}
  if(el.id==='filter-media-kind'){state.filters.mediaKind=el.value;render();return;}
  if(el.id==='filter-from'||el.id==='filter-to'){state.filters[el.id==='filter-from'?'from':'to']=el.value;render();return;}
  if(el.name==='filter-type'){state.filters.types=[...document.querySelectorAll('[name="filter-type"]:checked')].map(x=>x.value);render();return;}
  if(el.id==='capture-campaign'){const d=draft(),c=captureCampaigns(data,actor()).find(c=>c.id===el.value);if(d.media.length||!c)return;d.campaignId=c.id;d.type=c.types.length===1?c.types[0]:'';save();render();return;}
  if(el.name==='capture-type'){const d=draft(),c=captureCampaigns(data,actor()).find(c=>c.id===d.campaignId);if(!c?.types.includes(el.value)){toast('Este tipo no está habilitado en tu campaña.');render();return;}d.type=el.value;save();render();return;}
  if(el.id==='move-campaign'){const m=allowedMember(document.querySelector('#move-user-form').dataset.id);if(m)document.querySelector('#move-superior-fields').innerHTML=moveSuperiorFields(m,el.value);return;}
  if(el.id==='invite-campaign'||el.id==='invite-role'){
    if(actor().role==='admin'){
      const cid=document.querySelector('#invite-campaign').value,role=document.querySelector('#invite-role').value;
      const select=document.querySelector('#invite-campaign'); select.disabled=role==='leader';
      document.querySelector('#invite-parent').outerHTML=role==='leader'?'<select id="invite-parent" disabled><option>Administrador</option></select>':inviteParentSelect(cid,role);
    }
  }
  if((el.id==='manual-campaign'||el.id==='manual-role')&&actor().role==='admin'){
    const cid=document.querySelector('#manual-campaign').value,role=document.querySelector('#manual-role').value;
    document.querySelector('#manual-campaign').disabled=role==='leader';
    document.querySelector('#manual-parent').outerHTML=role==='leader'?'<select id="manual-parent" disabled><option>Administrador</option></select>':assignmentParentSelect('manual',cid,role);
  }
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.id==='user-search'){
    const position=el.selectionStart;state.usersSearch=el.value;render();
    const next=document.querySelector('#user-search');next.focus();next.setSelectionRange(position,position);return;
  }
  if(el.id==='capture-notes'){draft().notes=el.value;save();}
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  event.preventDefault();
  const fd=new FormData(form);
  if(form.id==='profile-name-form'){
    const button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
    try{const m=allowedMember(form.dataset.id);if(!m)throw Error('Usuario no disponible.');await updateProfile(m.id,{name:fd.get('name'),status:m.status});}
    catch(error){const el=document.querySelector('#profile-error');if(el)el.textContent=error.message;}
    finally{if(button?.isConnected)button.disabled=false;}
    return;
  }
  if(serverMode){
    const button=document.querySelector('[form="'+form.id+'"][type="submit"]')||form.querySelector('[type="submit"]');if(button)button.disabled=true;
    try{
      if(form.id==='login-form'){
        if(state.loginStep===1){state.loginContact=String(fd.get('contact'));const result=await api.requestCode(state.loginContact);state.developmentCode=result.developmentCode||'';state.loginStep=2;renderLogin();}
        else{
          const result=await api.verify(state.loginContact,String(fd.get('code')));state.actorId=result.user.id;
          const invite=new URLSearchParams(location.search).get('invite');
          if(invite){await api.request('/api/invitations/accept',{method:'POST',body:{token:invite}});history.replaceState(null,'','/?server=1');}
          await refreshServer();state.logged=true;state.view=result.user.role==='collaborator'?'capture':'dashboard';render();
        }
      }
      if(form.id==='campaign-form'){await api.request('/api/campaigns',{method:'POST',body:{name:fd.get('name'),location:fd.get('location'),leaderId:fd.get('leaderId'),types:fd.getAll('types')}});await refreshServer();modal.close();navigate('campaigns');toast('Campaña guardada en el servidor.');}
      if(form.id==='edit-user-form'){const m=allowedMember(form.dataset.id);await api.request(m.global?'/api/users/'+m.userId:'/api/memberships/'+m.id,{method:'PATCH',body:{name:fd.get('name'),status:fd.get('status')}});await refreshServer();modal.close();render();toast('Usuario actualizado en el servidor.');}
      if(form.id==='manual-user-form'){await api.request('/api/users',{method:'POST',body:{name:fd.get('name'),contact:fd.get('contact'),role:actor().role==='admin'?fd.get('role'):CHILD_ROLE[actor().role],campaignId:fd.get('campaignId'),parentId:fd.get('parentId')}});await refreshServer();modal.close();render();toast('Usuario dado de alta.');}
      if(form.id==='move-user-form'){await api.request('/api/memberships/'+form.dataset.id+'/transfer',{method:'POST',body:{parentId:fd.get('parentId')}});await refreshServer();modal.close();render();toast('Colaborador trasladado. Su historial se conserva.');}
      if(form.id==='invite-form'){
        const role=actor().role==='admin'?fd.get('role'):CHILD_ROLE[actor().role];
        const result=await api.request('/api/invitations',{method:'POST',body:{name:fd.get('name'),contact:fd.get('contact'),role,campaignId:fd.get('campaignId'),parentId:fd.get('parentId')}});
        state.inviteLinks[result.id]=result.link;await refreshServer();render();invitationResult(result.id);
      }
    }catch(error){const id=({'login-form':'login-error','campaign-form':'campaign-error','invite-form':'invite-error','manual-user-form':'manual-error','move-user-form':'move-error'})[form.id]||'edit-error';const el=document.getElementById(id);if(el)el.textContent=error.message;else toast(error.message);}
    finally{if(button?.isConnected)button.disabled=false;}
    return;
  }
  if(form.id==='login-form'){
    if(state.loginStep===1){state.loginStep=2;renderLogin();document.querySelector('#login-code').focus();}
    else if(fd.get('code')==='123456'){state.logged=true;state.view=actor().role==='collaborator'?'capture':'dashboard';render();}
    else document.querySelector('#login-error').textContent='Usa el código de ejemplo 123456.';
  }
  if(form.id==='campaign-form'){
    try{
      const input=validateCampaign(actor(),{name:fd.get('name'),location:fd.get('location'),leaderId:fd.get('leaderId'),types:fd.getAll('types')},data);
      const cid=ids();data.campaigns.push({...input,id:cid,status:'active',color:'mint'});
      data.memberships.push({id:ids(),userId:input.leaderId,campaignId:cid,role:'leader',parentId:null,status:'active'});
      audit('Creó campaña',cid);save();modal.close();navigate('campaigns');toast('Campaña creada en la demostración.');
    }catch(err){document.querySelector('#campaign-error').textContent=err.message;}
  }
  if(form.id==='manual-user-form'){
    try{
      const input={role:fd.get('role'),campaignId:fd.get('campaignId'),parentId:fd.get('parentId')},assignment=manualAssignment(data,actor(),input),name=String(fd.get('name')||'').trim();
      let value=String(fd.get('contact')||'').trim();
      if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))value=value.toLowerCase();else value=value.replace(/[ ()-]/g,'');
      if(!name||name.length>80||value.length>150||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)||/^\+[1-9][0-9]{7,14}$/.test(value)))throw Error('Ingresa nombre y un correo o celular con código de país.');
      if(data.users.some(u=>u.contact===value))throw Error('El contacto ya está registrado. Modifica su ficha o mueve al colaborador.');
      const uid=ids(),mid=assignment.campaignId?ids():null;
      data.users.push({id:uid,name,contact:value,role:assignment.role,active:true});
      if(mid)data.memberships.push({id:mid,userId:uid,...assignment,status:'active'});
      audit('Alta manual de usuario',mid||uid);save();modal.close();render();toast('Alta guardada en la vista de prueba.');
    }catch(err){document.querySelector('#manual-error').textContent=err.message;}
  }
  if(form.id==='move-user-form'){
    try{const {source,parent,branch}=transferTarget(data,actor(),form.dataset.id,fd.get('parentId'));
      if(branch.some(m=>data.drafts[m.userId]?.media?.length))throw Error('Finaliza y envía primero los borradores del equipo.');
      if(data.records.some(r=>branch.some(m=>m.id===r.membershipId)&&r.status==='pending'))throw Error('Envía primero los registros pendientes del equipo.');
      const mapping=new Map(branch.map(m=>[m.id,ids()]));
      for(const m of [source,...branch.filter(m=>m.id!==source.id)]){
        const next={...m,id:mapping.get(m.id),parentId:m.id===source.id?parent.id:mapping.get(m.parentId),campaignId:parent.campaignId};m.status='transferred';data.memberships.push(next);
        const d=data.drafts[m.userId];if(d&&!d.media.length){d.campaignId=parent.campaignId;const c=campaign(parent.campaignId);d.type=c.types.length===1?c.types[0]:'';}
        audit('Trasladó '+m.id+' a '+next.id,next.id);
      }
      save();modal.close();render();toast('Traslado guardado. Las evidencias anteriores conservan su equipo.');
    }catch(err){document.querySelector('#move-error').textContent=err.message;}
  }
  if(form.id==='edit-user-form'){
    const m=allowedMember(form.dataset.id);
    try{
      if(!m||!canManageMember(data,actor(),m))throw Error('No tienes permiso para editar este usuario.');
      const name=String(fd.get('name')).trim(),status=fd.get('status');
      if(!name)throw Error('Escribe el nombre de la persona.');
      if(!['active','inactive','invited'].includes(status))throw Error('Estado inválido.');
      if(status==='inactive'&&data.memberships.some(x=>x.parentId===m.id&&x.status==='active'))throw Error('Resuelve primero el equipo activo de este usuario.');
      if(m.status==='invited'&&status==='active')throw Error('La invitación debe aceptarse en la versión con servidor; no se puede activar desde esta demo.');
      if(m.role==='leader'&&!m.global&&status==='inactive')throw Error('La campaña debe conservar su líder activo.');
      if(status==='active'&&m.parentId&&!data.memberships.some(p=>p.id===m.parentId&&p.status==='active'))throw Error('Reactiva primero al superior directo.');
      if(m.global){user(m.userId).name=name;user(m.userId).active=status==='active';}else m.displayName=name;
      if(actor().role==='admin')user(m.userId).name=name;m.status=status;audit('Actualizó usuario',m.id);save();modal.close();render();toast('Cambios guardados en la demo.');
    }catch(err){document.querySelector('#edit-error').textContent=err.message;}
  }
  if(form.id==='invite-form'){
    try{
      const role=actor().role==='admin'?fd.get('role'):CHILD_ROLE[actor().role],cid=fd.get('campaignId');
      if(!role||!visibleCampaigns(data,actor()).some(c=>c.id===cid))throw Error('Campaña fuera de tu alcance.');
      let parent=actor().role==='admin'?data.memberships.find(m=>m.id===fd.get('parentId')):data.memberships.find(m=>m.userId===actor().id&&m.campaignId===cid&&m.status==='active');
      const expected=role==='coordinator'?'leader':'coordinator';
      if(!parent||parent.role!==expected||parent.campaignId!==cid||parent.status!=='active')throw Error('Selecciona un superior activo para este rol.');
      const name=String(fd.get('name')).trim();if(!name)throw Error('Escribe el nombre.');
      const uid=ids(),mid=ids(),invId=ids();
      const target={id:mid,userId:uid,campaignId:cid,role,parentId:parent.id,status:'invited'};
      if(!canManageMember(data,actor(),target))throw Error('No puedes invitar a esta rama.');
      data.users.push({id:uid,name,contact:fd.get('contact'),role});data.memberships.push(target);
      data.invitations.push({id:invId,membershipId:mid,token:ids(),status:'pending'});audit('Generó invitación demo',mid);save();render();invitationResult(invId);
    }catch(err){document.querySelector('#invite-error').textContent=err.message;}
  }
});
modal.addEventListener('click',event=>{if(event.target===modal){const bounds=modal.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)modal.close();}});
if(serverMode)bootServer();else{render();if(cloud)bootCloud();}
window.addEventListener('online',()=>{if(cloud){syncDeletions();syncCloud();}});
