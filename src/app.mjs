import { TYPE_NAMES, ROLE_NAMES, CHILD_ROLE, seedData, scopedMemberships, visibleCampaigns, canManageMember, visibleRecords, filterRecords, validateCampaign, assertCapture, assertEditable, finalFilename, dateInMexico } from './domain.mjs';

const app=document.querySelector('#app');
const modal=document.querySelector('#modal');
const STORAGE_KEY='controlpublicidad-screens-v1';
let data=seedData();
try { const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)); if(saved?.version===1) data=saved.data; } catch {}
data.drafts ||= {};
const state={logged:false,actorId:'a1',view:'dashboard',loginMode:'email',loginStep:1,usersSearch:'',userCampaign:'',userRole:'',userStatus:'',usersLayout:'list',filters:{campaign:'',types:[],from:'',to:''},successId:null};
const pages={dashboard:'Resumen',campaigns:'Campañas',users:'Usuarios y equipos',evidence:'Evidencias',map:'Mapa de evidencias',capture:'Nuevo registro',sync:'Mis envíos'};
const ids=()=>globalThis.crypto?.randomUUID?.()||'demo-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actor=()=>data.users.find(u=>u.id===state.actorId);
const user=id=>data.users.find(u=>u.id===id);
const campaign=id=>data.campaigns.find(c=>c.id===id);
const initials=name=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('');
const personAvatar=(u,large=false)=>`<span class="avatar ${large?'large':''}">${e(initials(u?.name||'Equipo'))}</span>`;
const rolePill=role=>`<span class="pill ${role==='leader'?'purple':role==='collaborator'?'green':''}">${ROLE_NAMES[role]}</span>`;
const statusPill=status=>`<span class="pill ${status==='active'||status==='synced'?'green':status==='pending'||status==='invited'?'amber':''}"><i class="dot"></i>${{active:'Activo',inactive:'Inactivo',invited:'Invitación pendiente',pending:'Pendiente · demo',synced:'Sincronizado · demo',draft:'Borrador · demo'}[status]||e(status)}</span>`;
const typePill=t=>`<span class="pill">${TYPE_NAMES[t]}</span>`;
const fmtDate=(iso,short=false)=>new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',...(short?{}:{hour:'2-digit',minute:'2-digit'})}).format(new Date(iso));
const save=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,data}));return true;}catch{toast('No se pudo guardar la demo en este navegador. Mantén esta ventana abierta.');return false;}};
const audit=(action,target)=>data.audit.push({id:ids(),actorId:actor().id,action,target,at:new Date().toISOString()});
let toastTimeout;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),4500);}
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
  info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0'
};
function icon(name,size=19){return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;}
const brand=()=>`<div class="brand"><div class="brand-mark">${icon('pin',23)}</div><div><strong>ControlPublicidad</strong><small>EVIDENCIAS EN CAMPO</small></div></div>`;
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
function filtered(){return filterRecords(ownRecords(),state.filters);}
function campaignOptions(selected=''){return visibleCampaigns(data,actor()).map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${e(c.name)}</option>`).join('');}
function navigate(view){
  const collaborator=actor().role==='collaborator';
  if(collaborator&&!['capture','sync'].includes(view)) view='capture';
  if(!collaborator&&['capture','sync'].includes(view)) view='dashboard';
  state.view=view;state.successId=null;render();window.scrollTo({top:0,behavior:'instant'});
}
function render(){
  if(!state.logged){renderLogin();return;}
  const u=actor(), coll=u.role==='collaborator';
  const nav=coll?[['capture','camera'],['sync','upload']]:[['dashboard','grid'],['campaigns','flag'],['users','users'],['evidence','camera'],['map','map']];
  const pending=ownRecords().filter(r=>r.status==='pending').length;
  const topOptions=[['a1','Administrador'],['l1','Líder · Mariana'],['l2','Líder · Andrés'],['c1','Coordinador · Diego'],['c2','Coordinador · Elena'],['f1','Colaboradora · Sofía'],['f3','Colaboradora · Valeria']].map(([id,name])=>`<option value="${id}" ${u.id===id?'selected':''}>${name}</option>`).join('');
  app.innerHTML=`<div class="shell"><aside class="sidebar">${brand()}<div class="workspace-label">${coll?'Trabajo de campo':'Administración'}</div>
    <nav class="nav" aria-label="Navegación principal">${nav.map(([v,ic])=>`<button class="nav-link ${state.view===v?'active':''}" data-nav="${v}" ${state.view===v?'aria-current="page"':''}>${icon(ic)}<span>${pages[v]}</span>${v==='sync'&&pending?`<b class="count">${pending}</b>`:''}</button>`).join('')}</nav>
    <div class="side-bottom"><div class="scope-note">${icon('shield',21)}<strong>Tu equipo, tu alcance</strong><br>${coll?'Captura tus registros y consulta el estado de tus envíos.':u.role==='admin'?'Administra las campañas y supervisa todos los equipos.':'Consulta únicamente las campañas y personas de tu equipo.'}</div>
    <div class="side-person">${personAvatar(u)}<div><strong>${e(u.name)}</strong><small>${ROLE_NAMES[u.role]}</small></div><button class="icon-btn" data-action="logout" title="Salir de la demostración" aria-label="Salir de la demostración">${icon('logout',16)}</button></div></div></aside>
    <main class="main"><header class="topbar"><div class="breadcrumb"><span>ControlPublicidad</span>${icon('chevron',11)}<strong>${pages[state.view]}</strong></div><div class="top-actions"><span class="pill green connection">${icon('wifi',13)} Demo local</span><label class="sr-only" for="demo-role" style="position:absolute;width:1px;height:1px;overflow:hidden">Cambiar usuario de demostración</label><select id="demo-role" class="role-select" aria-label="Cambiar usuario de demostración">${topOptions}</select><button class="icon-btn" data-action="logout" title="Salir" aria-label="Salir">${icon('logout',16)}</button></div></header>
    <div class="demo-strip">PROTOTIPO NAVEGABLE · Datos ficticios · Acceso, GPS y envíos simulados · No uses evidencias reales</div>
    <div class="content" id="page">${renderPage()}</div></main>
    <nav class="mobile-nav" aria-label="Navegación móvil">${nav.map(([v,ic])=>`<button data-nav="${v}" class="${state.view===v?'active':''}" ${state.view===v?'aria-current="page"':''}>${icon(ic)}<span>${v==='evidence'?'Evidencias':v==='users'?'Usuarios':v==='dashboard'?'Inicio':v==='map'?'Mapa':v==='capture'?'Capturar':pages[v]}</span></button>`).join('')}</nav></div>`;
}
function renderLogin(){
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
function renderPage(){return ({dashboard:dashboardPage,campaigns:campaignsPage,users:usersPage,evidence:evidencePage,map:mapPage,capture:capturePage,sync:syncPage}[state.view]||dashboardPage)();}
function dashboardPage(){
  const records=ownRecords(),cs=visibleCampaigns(data,actor()),ms=scopedMemberships(data,actor()).filter(m=>m.status==='active');
  const people=new Set(ms.map(m=>m.userId)).size;
  const photos=records.reduce((a,r)=>a+r.media.filter(m=>m.kind==='photo').length,0);
  const vids=records.reduce((a,r)=>a+r.media.filter(m=>m.kind==='video').length,0);
  const recent=[...records].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).slice(0,3);
  const dateLabels=['03 oct','04 oct','05 oct','06 oct'];
  const chartCounts=[3,4,5,6].map(day=>records.filter(r=>dateInMexico(r.capturedAt)===`2026-10-0${day}`));
  const max=Math.max(1,...chartCounts.map(rs=>rs.reduce((a,r)=>a+r.media.length,0)));
  return `${pageHead('Todo en su lugar.',`Hola, ${e(actor().name.split(' ')[0])}. Esta es la actividad de tus equipos.`,actor().role==='admin'?`<button class="btn" data-action="new-campaign">${icon('plus',17)} Nueva campaña</button>`:'','RESUMEN DE OPERACIÓN')}
  <div class="stats">${stat('Campañas activas',cs.length,'En tu alcance de supervisión','flag',true)}${stat('Registros',records.length,'Evidencias de ejemplo','layers')}${stat('Personas en equipo',people,'Usuarios activos en tu alcance','users')}${stat('Archivos registrados',photos+vids,`${photos} fotos · ${vids} videos`,'camera')}</div>
  <div class="dashboard-grid"><div class="stack"><section class="card"><div class="section-heading"><div><h2>Campañas en marcha</h2><p>Un equipo detrás de cada ubicación.</p></div><button data-nav="campaigns">Ver todas ${icon('arrow',13)}</button></div>
  ${cs.map(c=>{const count=records.filter(r=>r.campaignId===c.id).length;return `<div class="campaign-mini"><div class="campaign-icon ${c.color}">${icon('flag',21)}</div><div class="text"><h3>${e(c.name)}</h3><p>${e(c.location)}</p><div class="types" style="margin-top:8px">${c.types.map(typePill).join('')}</div></div><div class="metric">${count}<small>registros</small></div><button class="icon-btn" data-action="open-campaign" data-id="${c.id}" aria-label="Ver campaña ${e(c.name)}">${icon('chevron',15)}</button></div>`;}).join('')}</section>
  <section class="card"><div class="section-heading"><div><h2>Ubicaciones registradas</h2><p>Una mirada al trabajo en campo.</p></div><button data-nav="map">Explorar mapa ${icon('arrow',13)}</button></div>${mapComponent(records.slice(0,10),'mini')}</section></div>
  <div class="stack"><section class="card"><div class="section-heading"><div><h2>Evidencias por día</h2><p>Periodo de ejemplo · 3 al 6 de octubre</p></div>${icon('chart',18)}</div>
  <div class="chart">${chartCounts.map(rs=>`<div class="bar-group"><span class="bar" title="${rs.reduce((n,r)=>n+r.media.filter(m=>m.kind==='photo').length,0)} fotos" style="height:${rs.reduce((n,r)=>n+r.media.filter(m=>m.kind==='photo').length,0)/max*100}%"></span><span class="bar secondary" title="${rs.reduce((n,r)=>n+r.media.filter(m=>m.kind==='video').length,0)} videos" style="height:${rs.reduce((n,r)=>n+r.media.filter(m=>m.kind==='video').length,0)/max*100}%"></span></div>`).join('')}</div>
  <div class="chart-labels">${dateLabels.map(x=>`<span>${x}</span>`).join('')}</div><div class="legend"><span><i></i>Fotografías</span><span><i class="pale"></i>Videos</span></div></section>
  <section class="card"><div class="section-heading"><div><h2>Últimos registros</h2><p>Lo más reciente de tu equipo.</p></div></div>${recent.map(r=>{const m=data.memberships.find(m=>m.id===r.membershipId);return `<div class="activity-row">${personAvatar(user(m?.userId))}<div class="text"><strong>${e(user(m?.userId)?.name)}</strong><p>${TYPE_NAMES[r.type]} · ${e(campaign(r.campaignId)?.name)}<br>${fmtDate(r.capturedAt)}</p></div><button class="icon-btn" data-action="record-detail" data-id="${r.id}" aria-label="Abrir registro ${r.number}">${icon('chevron',14)}</button></div>`;}).join('')||empty('Aún no hay registros')}</section>
  <div class="notice">${icon('shield',17)}<span>La vista se ajusta a tu rol. Cambia de usuario arriba para comparar el alcance de cada equipo.</span></div></div></div>`;
}
function campaignsPage(){
  const cs=visibleCampaigns(data,actor()),records=ownRecords(),ms=scopedMemberships(data,actor());
  return `${pageHead('Campañas', 'Organiza el trabajo por ubicación y tipo de publicidad.',actor().role==='admin'?`<button class="btn" data-action="new-campaign">${icon('plus',17)} Nueva campaña</button>`:'','PLANIFICACIÓN')}
  <div class="campaign-grid">${cs.map(c=>`<article class="card campaign-card"><div class="campaign-cover ${c.color}"><span class="pill"><i class="dot"></i>En marcha</span><svg viewBox="0 0 210 160" fill="none" aria-hidden="true"><path d="M20 155L90 50l70 65 40-72 M0 108h210 M40 0v160 M150 0v160" stroke="#52735a" stroke-width="1.5"/><path d="M131 46c0 19-21 40-21 40s-21-21-21-40a21 21 0 1 1 42 0" fill="#718b62"/><circle cx="110" cy="46" r="7" fill="#e8eedb"/></svg></div><div class="campaign-body"><h2>${e(c.name)}</h2><div class="location">${icon('pin',14)}${e(c.location)}</div><div class="types">${c.types.map(typePill).join('')}</div><div class="owner">${personAvatar(user(c.leaderId))}<div><small>Líder de campaña</small>${e(user(c.leaderId)?.name)}</div></div><div class="campaign-numbers"><div><strong>${records.filter(r=>r.campaignId===c.id).length}</strong><small>Registros</small></div><div><strong>${ms.filter(m=>m.campaignId===c.id&&m.status==='active').length}</strong><small>Personas en tu alcance</small></div></div><button class="btn secondary" data-action="open-campaign" data-id="${c.id}">Ver campaña ${icon('arrow',15)}</button></div></article>`).join('')}</div>${!cs.length?empty('Sin campañas asignadas'):''}`;
}
function userList(){
  const needle=state.usersSearch.toLowerCase();
  return scopedMemberships(data,actor()).filter(m=>{
    const u=user(m.userId);
    return (!state.userCampaign||m.campaignId===state.userCampaign)&&(!state.userRole||m.role===state.userRole)&&(!state.userStatus||m.status===state.userStatus)&&(!needle||`${u?.name} ${u?.contact}`.toLowerCase().includes(needle));
  });
}
function usersPage(){
  const members=userList(),scope=scopedMemberships(data,actor());
  const active=new Set(scope.filter(m=>m.status==='active').map(m=>m.userId)).size;
  const pending=scope.filter(m=>m.status==='invited').length;
  const admins=actor().role==='admin';
  return `${pageHead('Usuarios y equipos','Personas conectadas, responsabilidades claras.',`<button class="btn" data-action="invite-user">${icon('plus',17)} Invitar usuario</button>`,'ADMINISTRACIÓN DE USUARIOS')}
  <div class="stats">${stat('Personas activas',active,'Dentro de tu alcance','users',true)}${stat('Coordinadores',scope.filter(m=>m.role==='coordinator'&&m.status==='active').length,'Equipos en operación','layers')}${stat('Colaboradores',scope.filter(m=>m.role==='collaborator'&&m.status==='active').length,'Captura de evidencias','camera')}${stat('Invitaciones',pending,'Pendientes de aceptación','mail')}</div>
  <div class="notice">${icon('shield',17)}<span>${admins?'Puedes administrar todos los equipos. Cada campaña mantiene un único líder.':actor().role==='leader'?'Puedes administrar tus coordinadores y consultar sus colaboradores. Cada coordinador administra su propia rama.':'Solo puedes administrar colaboradores asignados directamente a ti.'}</span></div>
  <div class="filters"><div class="search">${icon('search',16)}<input id="user-search" type="search" value="${e(state.usersSearch)}" aria-label="Buscar usuarios" placeholder="Buscar por nombre, correo o celular"></div>
  <select id="user-campaign" aria-label="Filtrar usuarios por campaña"><option value="">Todas las campañas</option>${campaignOptions(state.userCampaign)}</select>
  <select id="user-role" aria-label="Filtrar usuarios por rol"><option value="">Todos los roles</option>${['leader','coordinator','collaborator'].map(r=>`<option value="${r}" ${state.userRole===r?'selected':''}>${ROLE_NAMES[r]}</option>`).join('')}</select>
  <select id="user-status" aria-label="Filtrar usuarios por estado"><option value="">Todos los estados</option>${[['active','Activos'],['inactive','Inactivos'],['invited','Invitados']].map(([v,n])=>`<option value="${v}" ${state.userStatus===v?'selected':''}>${n}</option>`).join('')}</select>
  <div class="tabs"><button class="${state.usersLayout==='list'?'active':''}" data-action="users-layout" data-layout="list">Listado</button><button class="${state.usersLayout==='tree'?'active':''}" data-action="users-layout" data-layout="tree">Jerarquía</button></div></div>
  ${state.usersLayout==='list'?usersTable(members):usersTree(members)}
  <div class="table-footer"><span>${members.length} pertenencias en ${new Set(members.map(m=>m.campaignId)).size} campañas</span><span>Una baja conserva la autoría y las evidencias.</span></div>
  ${data.audit.length?`<section class="card" style="margin-top:15px"><h3>Últimos cambios en la demo</h3><p class="sub" style="font-size:11px">${data.audit.filter(a=>admins||a.actorId===actor().id).slice(-3).reverse().map(a=>`${e(user(a.actorId)?.name)} · ${e(a.action)} · ${fmtDate(a.at)}`).join('<br>')||'Sin cambios realizados por ti.'}</p></section>`:''}`;
}
function usersTable(members){
  if(!members.length) return `<div class="card">${empty('No encontramos usuarios')}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Campaña</th><th>Superior</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${members.map(m=>{
    const u=user(m.userId),parent=data.memberships.find(x=>x.id===m.parentId);
    const manageable=canManageMember(data,actor(),m);
    return `<tr><td><div class="person">${personAvatar(u)}<div><strong>${e(u?.name)}</strong><small>${e(u?.contact)}</small></div></div></td><td>${rolePill(m.role)}</td><td>${e(campaign(m.campaignId)?.name)}</td><td>${e(parent?user(parent.userId)?.name:'Administrador')}</td><td>${statusPill(m.status)}</td><td><div class="actions"><button class="icon-btn" data-action="user-detail" data-id="${m.id}" aria-label="Ver ${e(u?.name)}" title="Ver ficha">${icon('eye',16)}</button>${manageable?`<button class="icon-btn" data-action="edit-user" data-id="${m.id}" aria-label="Editar ${e(u?.name)}" title="Editar usuario">${icon('edit',15)}</button>`:`<span class="readonly">Consulta</span>`}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function usersTree(members){
  if(!members.length) return `<div class="card">${empty('No encontramos usuarios')}</div>`;
  const included=new Set(members.map(m=>m.id));
  const roots=members.filter(m=>!included.has(m.parentId));
  const node=m=>`<div><div class="person">${personAvatar(user(m.userId))}<div><strong>${e(user(m.userId)?.name)}</strong><small>${ROLE_NAMES[m.role]} · ${e(campaign(m.campaignId)?.name)}</small></div><button class="icon-btn" data-action="user-detail" data-id="${m.id}" aria-label="Ver ${e(user(m.userId)?.name)}">${icon('eye',15)}</button></div>${members.some(x=>x.parentId===m.id)?`<div class="tree-level">${members.filter(x=>x.parentId===m.id).map(node).join('')}</div>`:''}</div>`;
  return `<div class="tree">${roots.map(m=>`<section class="tree-branch">${node(m)}</section>`).join('')}</div>`;
}
function recordFilters(){
  const availableTypes=[...new Set((state.filters.campaign?[campaign(state.filters.campaign)]:visibleCampaigns(data,actor())).flatMap(c=>c?.types||[]))];
  return `<div class="filters"><select id="filter-campaign" aria-label="Filtrar evidencias por campaña"><option value="">Todas las campañas</option>${campaignOptions(state.filters.campaign)}</select>
  <div class="filter-dates"><input id="filter-from" type="date" aria-label="Fecha inicial" title="Fecha inicial" value="${state.filters.from}"><input id="filter-to" type="date" aria-label="Fecha final" title="Fecha final" value="${state.filters.to}"></div>
  <div class="type-filter">${availableTypes.map(t=>`<label><input type="checkbox" name="filter-type" value="${t}" ${state.filters.types.includes(t)?'checked':''}>${TYPE_NAMES[t]}</label>`).join('')}</div><button class="btn ghost" data-action="clear-filters">Limpiar</button></div>`;
}
function evidencePage(){
  const rs=filtered();
  return `${pageHead('Evidencias','Cada registro conserva su autor, ubicación y momento de captura.',`<button class="btn secondary" data-nav="map">${icon('map',17)} Ver mapa</button>`,'REGISTROS DE CAMPO')}
  ${recordFilters()}<div class="between" style="margin-bottom:18px"><span class="muted" style="font-size:11px">${rs.length} registros en tu alcance</span><span class="pill">${icon('shield',12)} Originales sellados</span></div>
  <div class="evidence-grid">${[...rs].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).map((r,i)=>{
    const m=data.memberships.find(m=>m.id===r.membershipId),photos=r.media.filter(m=>m.kind==='photo').length,vids=r.media.length-photos;
    return `<button class="card evidence-card" data-action="record-detail" data-id="${r.id}">${photoArt(i).replace('</div>',`<span class="photo-count">${icon('camera',12)} ${photos} ${vids?`· ${icon('video',12)} ${vids}`:''}</span></div>`)}<div class="evidence-body"><div class="between">${typePill(r.type)}<span class="muted" style="font-size:10px">#${String(r.number).padStart(3,'0')}</span></div><h3>${e(campaign(r.campaignId)?.name)}</h3><p>${e(user(m?.userId)?.name)}</p><div class="meta"><span>${fmtDate(r.capturedAt)}</span><span>GPS ±${r.accuracy} m</span></div></div></button>`;
  }).join('')}</div>${!rs.length?`<div class="card">${empty('Sin evidencias con estos filtros')}</div>`:''}`;
}
function mapComponent(records,mode='full'){
  const pins=records.filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng));
  return `<div class="map-art ${mode}">${mapArt()}<div class="map-label">${icon('pin',13)} Morelia · Ubicaciones de ejemplo</div>
  ${pins.map(r=>{const x=Math.max(10,Math.min(89,15+(r.lng+101.201)*8500)),y=Math.max(12,Math.min(83,80-(r.lat-19.702)*9000));return `<button class="pin" style="left:${x}%;top:${y}%" data-action="record-detail" data-id="${r.id}" aria-label="Ver registro ${r.number}"><svg viewBox="0 0 30 34" aria-hidden="true"><path d="M28 14c0 10-13 19-13 19S2 24 2 14a13 13 0 1 1 26 0" fill="${r.type==='barda'?'#859760':r.type==='lona'?'#296550':'#a1844b'}" stroke="white" stroke-width="2"/></svg><span>${r.number}</span></button>`;}).join('')}
  <div class="map-caption">Esquema visual · Cartografía y navegación reales pendientes</div></div>`;
}
function mapPage(){
  const rs=filtered();
  return `${pageHead('El trabajo, en el mapa.','Filtra las ubicaciones y abre sus evidencias.',`<button class="btn secondary" data-nav="evidence">${icon('layers',17)} Ver registros</button>`,'VISTA TERRITORIAL')}
  ${recordFilters()}<div class="map-layout">${mapComponent(rs)}<aside class="map-list"><div class="list-head"><h3>${rs.length} ubicaciones</h3><p>Selecciona un punto para ver su registro.</p></div><div class="scroll">${rs.map(r=>`<button data-action="record-detail" data-id="${r.id}">${typePill(r.type)}<strong>#${String(r.number).padStart(3,'0')} · ${e(campaign(r.campaignId)?.name)}</strong><p>${fmtDate(r.capturedAt)}<br>${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} · ±${r.accuracy} m</p></button>`).join('')||empty('Sin ubicaciones')}</div></aside></div>`;
}
function draft(){
  if(!data.drafts[actor().id]){
    const c=visibleCampaigns(data,actor())[0];
    data.drafts[actor().id]={id:ids(),campaignId:c?.id||'',type:c?.types.length===1?c.types[0]:'',notes:'',media:[],status:'draft',capturedAt:null};
  }
  return data.drafts[actor().id];
}
function capturePage(){
  if(state.successId){const r=data.records.find(r=>r.id===state.successId);return `<div class="capture-wrap">${pageHead('Registro listo','Tu evidencia de ejemplo quedó sellada.','','TRABAJO DE CAMPO')}<div class="card capture-success"><div class="success-icon">${icon('check',32)}</div><h2>Registro demo guardado</h2><p>Ya no se puede modificar ni eliminar desde esta vista. Puedes revisar el estado en Mis envíos.</p>${statusPill(r.status)}<div class="notice amber">${icon('info',17)}<span>En esta demo solo se guardan datos ficticios en el navegador, sin cifrado ni copia en la nube.</span></div><button class="btn" data-nav="sync">${icon('upload',17)} Ver mis envíos</button><button class="btn secondary" data-action="new-record">Crear otro registro</button></div></div>`;}
  const d=draft(),c=campaign(d.campaignId),photos=d.media.filter(m=>m.kind==='photo').length,vids=d.media.filter(m=>m.kind==='video').length;
  if(!c) return `${pageHead('Nuevo registro','Captura de evidencias')}<div class="card">${empty('No tienes campañas asignadas')}</div>`;
  return `<div class="capture-wrap">${pageHead('Nuevo registro','Todo lo que necesitas, en un solo registro.','','TRABAJO DE CAMPO')}
  <div class="capture-steps"><span class="active"><i class="step-number">1</i>Campaña</span>${icon('chevron',12)}<span class="${d.media.length?'active':''}"><i class="step-number">2</i>Evidencias</span>${icon('chevron',12)}<span><i class="step-number">3</i>Guardar</span></div>
  <div class="stack"><section class="card capture-section"><h2>¿Dónde estás trabajando?</h2>${field('Campaña asignada','capture-campaign',`<select id="capture-campaign" ${d.media.length?'disabled':''}>${campaignOptions(d.campaignId)}</select>`)}<p class="sub" style="font-size:11px">${icon('pin',13)}${e(c.location)}</p><label style="margin-top:18px">Tipo de publicidad <span class="muted">· elige una opción</span></label><div class="type-choice">${c.types.map(t=>`<label><input type="radio" name="capture-type" value="${t}" ${d.type===t?'checked':''}>${TYPE_NAMES[t]}</label>`).join('')}</div></section>
  <section class="card capture-section"><div class="between"><h2 style="margin-bottom:0">Evidencias del registro</h2><span class="pill">Solo captura desde app</span></div><p class="sub" style="font-size:11px">Hasta 10 fotografías y 3 videos. Aquí agregaremos ejemplos para probar el flujo.</p>
  <div class="media-actions"><button class="capture-btn" data-action="add-media" data-kind="photo" ${photos>=10?'disabled':''}>${icon('camera',29)}Agregar foto demo<small>${photos} de 10 fotografías</small></button><button class="capture-btn" data-action="add-media" data-kind="video" ${vids>=3?'disabled':''}>${icon('video',29)}Agregar video demo<small>${vids} de 3 videos</small></button></div>
  <div class="thumbnails">${d.media.map((m,i)=>`<div class="thumb">${photoArt(i)}<button class="remove" data-action="remove-media" data-index="${i}" aria-label="Quitar ejemplo ${i+1}">${icon('close',12)}</button><p>${m.kind==='photo'?'Foto':'Video'} ${i+1} · demo</p></div>`).join('')}</div>
  <div class="capture-meta"><div><small>Colaborador</small>${e(actor().name)}</div><div><small>Ubicación de ejemplo · GPS simulado</small>19.70500, −101.19800 · ±6 m</div><div><small>Fecha y hora del primer ejemplo</small>${d.capturedAt?fmtDate(d.capturedAt):'Se asignará al agregar evidencia'}</div><div><small>Dispositivo de ejemplo</small>Samsung · SM-A566E</div></div></section>
  <section class="card capture-section">${field('Notas del registro','capture-notes',`<textarea id="capture-notes" rows="3" maxlength="1000" placeholder="Agrega observaciones del punto…">${e(d.notes)}</textarea>`)}<p class="sub" style="font-size:10px">Opcional · máximo 1,000 caracteres.</p></section></div>
  <div class="capture-footer"><div class="row muted" style="font-size:10px">${icon('shield',15)} Borrador de ejemplo · sin evidencia real</div><button class="btn" data-action="seal-record" ${!d.media.length||!d.type?'disabled':''}>${icon('check',17)} Sellar registro demo</button></div><div class="notice amber" style="margin-top:18px">${icon('info',16)}<span>La captura con cámara, GPS real y almacenamiento cifrado se implementará en la app móvil.</span></div></div>`;
}
function syncPage(){
  const rs=ownRecords(),pending=rs.filter(r=>r.status==='pending');
  return `${pageHead('Mis envíos','Revisa el estado de tus registros de ejemplo.','','TRABAJO DE CAMPO')}
  <div class="sync-banner"><div><h2>${pending.length?'Hay trabajo listo para enviar.':'Tus envíos están al día.'}</h2><p>${pending.length} registros pendientes · los originales permanecen sellados.<br>La sincronización de esta vista es una simulación.</p></div><button class="btn lime" data-action="sync" ${!pending.length?'disabled':''}>${icon('upload',17)} Simular actualización</button></div>
  <div class="card"><div class="section-heading"><h2>Registros de ${e(actor().name.split(' ')[0])}</h2><span class="pill">${rs.length} registros</span></div>${[...rs].sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).map(r=>`<div class="sync-row"><div class="row"><div class="campaign-icon">${icon('camera',20)}</div><div><h3>${e(campaign(r.campaignId)?.name)}</h3><p>${TYPE_NAMES[r.type]} · ${r.media.length} archivos · ${fmtDate(r.capturedAt)}<br>${r.number?'#'+String(r.number).padStart(3,'0'):'Número final pendiente'}</p></div></div><div class="row">${statusPill(r.status)}<button class="icon-btn" data-action="record-detail" data-id="${r.id}" aria-label="Ver registro">${icon('eye',16)}</button></div></div>`).join('')||empty('Aún no tienes registros')}</div><div class="notice amber" style="margin-top:18px">${icon('info',17)}<span>Estos cambios solo afectan la demostración. No hay transferencia de archivos ni almacenamiento en la nube.</span></div>`;
}
function showDialog(title,body,foot=''){
  modal.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close-dialog" aria-label="Cerrar ventana">${icon('close',18)}</button></div><div class="dialog-body">${body}</div>${foot?`<div class="dialog-foot">${foot}</div>`:''}`;
  if(!modal.open) modal.showModal();
}
function allowedMember(id){return scopedMemberships(data,actor()).find(m=>m.id===id);}
function userDialog(id,edit=false){
  const m=allowedMember(id);
  if(!m||edit&&!canManageMember(data,actor(),m)){toast('No tienes permiso para modificar este usuario.');return;}
  const u=user(m.userId),parent=data.memberships.find(x=>x.id===m.parentId);
  if(edit){
    const activeChildren=data.memberships.some(x=>x.parentId===m.id&&x.status==='active');
    showDialog('Editar usuario',`<div class="row">${personAvatar(u,true)}<div><h3>${e(u.name)}</h3><p class="sub" style="font-size:11px">${ROLE_NAMES[m.role]} · ${e(campaign(m.campaignId)?.name)}</p></div></div><form id="edit-user-form" data-id="${m.id}" class="stack">${field('Nombre visible','edit-name',`<input id="edit-name" name="name" required maxlength="80" value="${e(u.name)}">`)}
    ${field('Estado en esta campaña','edit-status',`<select id="edit-status" name="status"><option value="active" ${m.status==='active'?'selected':''}>Activo</option><option value="inactive" ${m.status==='inactive'?'selected':''} ${activeChildren?'disabled':''}>Inactivo</option>${m.status==='invited'?'<option value="invited" selected>Invitación pendiente</option>':''}</select>`)}
    <div class="notice">${icon('shield',16)}<span>La baja afecta solo a esta campaña y conserva las evidencias. ${activeChildren?'Este usuario tiene personas activas a su cargo; primero debe resolverse su equipo.':''}</span></div>
    <p class="muted" style="font-size:11px">Contacto: ${e(u.contact)}<br>Cambiar el correo o celular requerirá verificación en la versión con servidor.</p><div class="form-error" id="edit-error"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" type="submit" form="edit-user-form">Guardar cambios</button>`);
  }else{
    const records=ownRecords().filter(r=>r.membershipId===m.id);
    const inv=data.invitations.find(i=>i.membershipId===m.id&&i.status==='pending');
    showDialog('Ficha del usuario',`<div class="row">${personAvatar(u,true)}<div><h2>${e(u.name)}</h2><div class="row" style="margin-top:9px">${rolePill(m.role)}${statusPill(m.status)}</div></div></div><div class="details-grid"><div><small>Correo o celular · ejemplo</small><strong>${e(u.contact)}</strong></div><div><small>Campaña</small><strong>${e(campaign(m.campaignId)?.name)}</strong></div><div><small>Superior</small><strong>${e(parent?user(parent.userId)?.name:'Administrador')}</strong></div><div><small>Registros de esta persona</small><strong>${records.length}</strong></div></div><div class="notice">${icon('shield',16)}<span>${canManageMember(data,actor(),m)?'Este usuario está dentro de tu alcance de administración.':'Tienes permiso de consulta. Su superior directo administra este usuario.'}</span></div>`,`<button class="btn secondary" data-action="close-dialog">Cerrar</button>${inv&&canManageMember(data,actor(),m)?`<button class="btn secondary" data-action="view-invitation" data-id="${inv.id}">Ver invitación</button>`:''}${canManageMember(data,actor(),m)?`<button class="btn" data-action="edit-user" data-id="${m.id}">${icon('edit',16)} Editar usuario</button>`:''}`);
  }
}
function campaignDialog(){
  if(actor().role!=='admin'){toast('Solo el administrador puede crear campañas.');return;}
  showDialog('Nueva campaña',`<form id="campaign-form" class="stack">${field('Nombre de campaña','campaign-name','<input id="campaign-name" name="name" maxlength="100" placeholder="Ej. Presencia en el centro" required>')}${field('Ubicación','campaign-location','<input id="campaign-location" name="location" maxlength="150" placeholder="Zona, ciudad o referencia" required>')}${field('Líder general · una persona','campaign-leader',`<select id="campaign-leader" name="leaderId" required><option value="">Selecciona un líder</option>${data.users.filter(u=>u.role==='leader').map(u=>`<option value="${u.id}">${e(u.name)}</option>`).join('')}</select>`)}<div><label>Tipos de campaña · selecciona uno o varios</label><div class="type-choice">${Object.entries(TYPE_NAMES).map(([v,n])=>`<label><input type="checkbox" name="types" value="${v}">${n}</label>`).join('')}</div><p class="sub" style="font-size:11px">Dos o más opciones crean una campaña mixta.</p></div><div class="form-error" id="campaign-error"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" form="campaign-form" type="submit">Crear campaña</button>`);
}
function inviteDialog(){
  if(actor().role==='collaborator'){toast('Tu rol no permite invitar usuarios.');return;}
  const cs=visibleCampaigns(data,actor());
  showDialog('Invitar a tu equipo',`<form id="invite-form" class="stack">${field('Nombre de la persona','invite-name','<input id="invite-name" name="name" maxlength="80" placeholder="Nombre y apellidos" required>')}${field('Correo electrónico de ejemplo','invite-contact','<input id="invite-contact" name="contact" type="email" placeholder="persona@example.invalid" value="persona@example.invalid" required>')}
  ${field('Campaña','invite-campaign',`<select id="invite-campaign" name="campaignId" required>${cs.map(c=>`<option value="${c.id}">${e(c.name)}</option>`).join('')}</select>`)}
  ${actor().role==='admin'?`<div class="form-grid">${field('Rol asignado','invite-role','<select id="invite-role" name="role"><option value="coordinator">Coordinador</option><option value="collaborator">Colaborador</option></select>')}${field('Superior directo','invite-parent',inviteParentSelect(cs[0]?.id,'coordinator'))}</div><p class="muted" style="font-size:11px">El líder se asigna al crear la campaña. Cada campaña tiene un único líder.</p>`:`<div class="notice">${icon('users',17)}<span>Invitarás a un <strong>${ROLE_NAMES[CHILD_ROLE[actor().role]].toLowerCase()}</strong>. Quedará asignado directamente a ti en esta campaña.</span></div>`}
  <div class="notice amber">${icon('info',16)}<span>Usa datos ficticios. En esta demo no se envían mensajes ni se concede acceso real.</span></div><div class="form-error" id="invite-error"></div></form>`,`<button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn" type="submit" form="invite-form">Generar invitación demo</button>`);
}
function inviteParentSelect(campaignId,role){
  const expected=role==='coordinator'?'leader':'coordinator';
  return `<select id="invite-parent" name="parentId" required>${data.memberships.filter(m=>m.campaignId===campaignId&&m.role===expected&&m.status==='active').map(m=>`<option value="${m.id}">${e(user(m.userId)?.name)}</option>`).join('')}</select>`;
}
function invitationResult(inviteId){
  const inv=data.invitations.find(i=>i.id===inviteId);
  const member=data.memberships.find(m=>m.id===inv?.membershipId);
  if(!inv||!member||!canManageMember(data,actor(),member)) return;
  showDialog('Invitación preparada · demo',`<div class="invitation-preview">${icon('mail',32)}<h3>${e(user(member.userId)?.name)}</h3><p class="muted" style="font-size:11px">${ROLE_NAMES[member.role]} · ${e(campaign(member.campaignId)?.name)}</p><code>DEMO-${e(inv.token.slice(0,12))}</code><span class="pill amber">Pendiente · no concede acceso</span></div><div class="invite-channels"><button data-action="invite-channel" data-channel="QR">${icon('grid',24)}Código QR</button><button data-action="invite-channel" data-channel="correo">${icon('mail',24)}Correo</button><button data-action="invite-channel" data-channel="WhatsApp">${icon('phone',24)}WhatsApp</button></div><p class="muted" style="font-size:11px;line-height:1.7">Estas opciones muestran el flujo previsto. El QR y la integración para compartir se activarán cuando exista un servicio de invitaciones.</p>`,`<button class="btn secondary" data-action="revoke-invite" data-id="${inv.id}">Cancelar invitación</button><button class="btn" data-action="close-dialog">Listo</button>`);
}
function recordDialog(id,seq=1){
  const r=ownRecords().find(r=>r.id===id);
  if(!r){toast('Este registro está fuera de tu alcance.');return;}
  const m=data.memberships.find(m=>m.id===r.membershipId),u=user(m?.userId),selected=r.media[seq-1]||r.media[0];
  const filename=r.number?finalFilename(campaign(r.campaignId)?.name||'Campaña',r.number,seq,selected.kind==='video'?'mp4':'jpg'):'Nombre final pendiente de sincronización';
  showDialog(`Registro ${r.number?'#'+String(r.number).padStart(3,'0'):'pendiente'}`,`<div class="between"><span>${e(campaign(r.campaignId)?.name)}</span>${typePill(r.type)}</div>${selected.kind==='photo'?photoArt(seq):`<div class="media-placeholder"><div>${icon('video',42)}<p>Video de ejemplo</p><small>No se ha grabado un archivo real.</small></div></div>`}<div class="detail-media-tabs">${r.media.map((x,i)=>`<button class="${seq===i+1?'active':''}" data-action="record-media" data-id="${r.id}" data-seq="${i+1}">${x.kind==='photo'?'Foto':'Video'} ${i+1}</button>`).join('')}</div>
  <p class="muted" style="font-size:10px;overflow-wrap:anywhere">${e(filename)}</p><div class="details-grid"><div><small>Colaborador</small><strong>${e(u?.name)}</strong></div><div><small>${selected.kind==='video'?'Inicio de grabación':'Fecha y hora'} · ejemplo</small><strong>${fmtDate(selected.capturedAt||r.capturedAt)}</strong></div><div><small>GPS de ejemplo · precisión ±${r.accuracy} m</small><strong>${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}</strong></div><div><small>Dispositivo · ejemplo</small><strong>${e(r.device.brand)} · ${e(r.device.model)}</strong></div><div><small>Identificador de instalación</small><strong style="overflow-wrap:anywhere">${e(r.device.installationId)}</strong></div><div><small>Estado</small>${statusPill(r.status)}</div></div><div><label>Notas</label><p class="sub" style="font-size:12px">${e(r.notes||'Sin notas.')}</p></div><div class="notice">${icon('shield',16)}<span>Registro sellado. Las evidencias originales no pueden modificarse ni eliminarse desde esta vista.</span></div>`,`<button class="btn secondary" data-action="close-dialog">Cerrar</button>`);
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-nav]');
  if(nav){navigate(nav.dataset.nav);return;}
  const target=event.target.closest('[data-action]');
  if(!target) return;
  const {action,id,mode,kind,index,layout,seq,channel}=target.dataset;
  switch(action){
    case 'close-dialog':modal.close();break;
    case 'logout':modal.close();state.logged=false;state.loginStep=1;render();break;
    case 'login-mode':state.loginMode=mode;renderLogin();break;
    case 'login-back':state.loginStep=1;renderLogin();break;
    case 'new-campaign':campaignDialog();break;
    case 'open-campaign':state.filters={campaign:id,types:[],from:'',to:''};navigate('evidence');break;
    case 'invite-user':inviteDialog();break;
    case 'view-invitation':invitationResult(id);break;
    case 'user-detail':userDialog(id);break;
    case 'edit-user':userDialog(id,true);break;
    case 'users-layout':state.usersLayout=layout;render();break;
    case 'record-detail':recordDialog(id);break;
    case 'record-media':recordDialog(id,Number(seq));break;
    case 'clear-filters':state.filters={campaign:'',types:[],from:'',to:''};render();break;
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
      const record={...structuredClone(d),membershipId:member.id,status:'pending',number:null,lat:19.705,lng:-101.198,accuracy:6,device:{name:'Equipo demo',brand:'Samsung',model:'SM-A566E',installationId:'demo-installation-'+actor().id}};
      data.records.push(record);delete data.drafts[actor().id];save();state.successId=record.id;render();}catch(err){toast(err.message);}break;
    }
    case 'new-record':delete data.drafts[actor().id];state.successId=null;save();navigate('capture');break;
    case 'sync':{
      let count=0;
      for(const r of ownRecords().filter(r=>r.status==='pending')){
        r.number=Math.max(0,...data.records.filter(x=>x.campaignId===r.campaignId).map(x=>x.number||0))+1;
        r.status='synced';count++;
      }
      save();render();toast(`${count} registros actualizados en la demo. No se enviaron archivos.`);break;
    }
    case 'invite-channel':toast(`Vista ${channel}: integración pendiente. No se ha enviado ninguna invitación.`);break;
    case 'revoke-invite':{
      const inv=data.invitations.find(i=>i.id===id),m=data.memberships.find(m=>m.id===inv?.membershipId);
      if(!m||!canManageMember(data,actor(),m))return;
      inv.status='revoked';m.status='inactive';audit('Canceló invitación',m.id);save();modal.close();render();toast('Invitación demo cancelada.');break;
    }
  }
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='demo-role'){
    state.actorId=el.value;state.filters={campaign:'',types:[],from:'',to:''};state.usersSearch='';state.userCampaign='';state.userRole='';state.userStatus='';state.successId=null;
    state.view=actor().role==='collaborator'?'capture':'dashboard';render();return;
  }
  const userFilters={'user-campaign':'userCampaign','user-role':'userRole','user-status':'userStatus'};
  if(userFilters[el.id]){state[userFilters[el.id]]=el.value;render();return;}
  if(el.id==='filter-campaign'){state.filters.campaign=el.value;state.filters.types=[];render();return;}
  if(el.id==='filter-from'||el.id==='filter-to'){state.filters[el.id==='filter-from'?'from':'to']=el.value;render();return;}
  if(el.name==='filter-type'){state.filters.types=[...document.querySelectorAll('[name="filter-type"]:checked')].map(x=>x.value);render();return;}
  if(el.id==='capture-campaign'){const d=draft();if(d.media.length)return;d.campaignId=el.value;const c=campaign(el.value);d.type=c.types.length===1?c.types[0]:'';save();render();return;}
  if(el.name==='capture-type'){draft().type=el.value;save();render();return;}
  if(el.id==='invite-campaign'||el.id==='invite-role'){
    if(actor().role==='admin'){
      const cid=document.querySelector('#invite-campaign').value,role=document.querySelector('#invite-role').value;
      document.querySelector('#invite-parent').outerHTML=inviteParentSelect(cid,role);
    }
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
document.addEventListener('submit',event=>{
  const form=event.target;
  event.preventDefault();
  const fd=new FormData(form);
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
  if(form.id==='edit-user-form'){
    const m=allowedMember(form.dataset.id);
    try{
      if(!m||!canManageMember(data,actor(),m))throw Error('No tienes permiso para editar este usuario.');
      const name=String(fd.get('name')).trim(),status=fd.get('status');
      if(!name)throw Error('Escribe el nombre de la persona.');
      if(!['active','inactive','invited'].includes(status))throw Error('Estado inválido.');
      if(status==='inactive'&&data.memberships.some(x=>x.parentId===m.id&&x.status==='active'))throw Error('Resuelve primero el equipo activo de este usuario.');
      if(m.status==='invited'&&status==='active')throw Error('La invitación debe aceptarse en la versión con servidor; no se puede activar desde esta demo.');
      user(m.userId).name=name;m.status=status;audit('Actualizó usuario',m.id);save();modal.close();render();toast('Cambios guardados en la demo.');
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
render();
