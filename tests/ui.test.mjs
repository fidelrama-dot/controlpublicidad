import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {seedData} from '../src/domain.mjs';
const html=(await readFile(new URL('../index.html',import.meta.url),'utf8')).replace('<script type="module">','<script>');
function createApp(saved,fetcher){
  const errors=[],console=new VirtualConsole();
  console.on('jsdomError',e=>{if(!e.message.includes('Not implemented: navigation'))errors.push(e.message);});
  const dom=new JSDOM(fetcher?html.replace('</head>','<meta name="controlpublicidad-cloud" content="1"></head>'):html,{url:'https://controlpublicidad.example.invalid/',runScripts:'dangerously',virtualConsole:console,beforeParse(w){
    w.structuredClone=structuredClone;
    if(fetcher)w.fetch=fetcher;
    w.scrollTo=()=>{};
    w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    if(saved)w.localStorage.setItem('controlpublicidad-screens-v1',saved);
  }});
  const document=dom.window.document;
  const q=s=>{const el=document.querySelector(s);assert.ok(el,'Missing '+s);return el;};
  const click=s=>q(s).click();
  const change=(s,value)=>{const el=q(s);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const input=(s,value)=>{const el=q(s);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  const submit=s=>q(s).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  const login=()=>{submit('#login-form');input('#login-code','123456');submit('#login-form');};
  return {dom,document,errors,q,click,change,input,submit,login,close:()=>dom.window.close()};
}
test('access demo rejects wrong code and opens dashboard with correct code',()=>{
  const a=createApp();a.submit('#login-form');a.input('#login-code','000000');a.submit('#login-form');
  assert.match(a.q('#login-error').textContent,/123456/);
  a.input('#login-code','123456');a.submit('#login-form');
  assert.match(a.q('h1').textContent,/Todo en su lugar/);
  assert.deepEqual(a.errors,[]);a.close();
});
test('user search, edit, invitations, hierarchy and role scope operate through the screens',()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');
  assert.equal(a.document.querySelectorAll('tbody tr').length,10);
  a.input('#user-search','Sofía');
  assert.equal(a.document.querySelectorAll('tbody tr').length,1);
  a.click('[data-action="edit-user"][data-id="m4"]');
  a.input('#edit-name','Sofía demo');a.submit('#edit-user-form');
  assert.match(a.q('tbody').textContent,/Sofía demo/);
  a.input('#user-search','');a.click('[data-action="invite-user"]');
  a.input('#invite-name','Nueva coordinadora demo');a.submit('#invite-form');
  assert.match(a.q('#dialog-title').textContent,/Invitación preparada/);
  a.click('[data-action="close-dialog"]');
  assert.equal(a.document.querySelectorAll('tbody tr').length,11);
  a.change('#demo-role','l1');a.click('[data-nav="users"]');
  assert.doesNotMatch(a.q('tbody').textContent,/Carlos Vega|Pablo Ruiz/);
  assert.equal(a.document.querySelectorAll('[data-action="edit-user"][data-id="m4"]').length,0);
  assert.equal(a.document.querySelectorAll('[data-action="edit-user"][data-id="m2"]').length,1);
  assert.equal(a.q("#users-table").open,false);
  assert.match(a.q('.tree').textContent,/Diego Méndez/);
  a.change('#demo-role','c1');a.click('[data-nav="users"]');
  assert.equal(a.document.querySelectorAll('tbody tr').length,3);
  assert.doesNotMatch(a.q('tbody').textContent,/Valeria Cruz/);
  assert.deepEqual(a.errors,[]);a.close();
});
test('campaign form, evidence filters, map and media details remain connected',()=>{
  const a=createApp();a.login();a.click('[data-action="new-campaign"]');
  a.input('#campaign-name','Campaña demo');a.input('#campaign-location','Morelia');a.change('#campaign-leader','l1');
  a.q('[name="types"][value="lona"]').checked=true;a.q('[name="types"][value="barda"]').checked=true;a.submit('#campaign-form');
  assert.equal(a.document.querySelectorAll('.campaign-card').length,4);
  a.click('[data-nav="evidence"]');a.change('#filter-campaign','p2');
  assert.equal(a.document.querySelectorAll('.evidence-card').length,4);
  a.click('[data-nav="map"]');assert.equal(a.document.querySelectorAll('.pin').length,4);
  a.click('.pin');assert.match(a.q('#dialog-title').textContent,/Registro/);
  assert.match(a.q('#modal').textContent,/GPS de ejemplo/);
  a.click('[data-action="close-dialog"]');
  a.change('#filter-from','2026-10-06');a.change('#filter-to','2026-10-06');
  assert.equal(a.document.querySelectorAll('.pin').length,0);
  assert.deepEqual(a.errors,[]);a.close();
});
test('capture enforces limits, restores draft, seals and retains the queue when no cloud is connected',()=>{
  let a=createApp();a.login();a.change('#demo-role','f1');
  assert.equal(a.document.querySelectorAll('.sidebar .nav-link').length,2);
  assert.equal(a.document.querySelectorAll('[data-nav="users"]').length,0);
  a.change('[name="capture-type"][value="lona"]','lona');a.q('[name="capture-type"][value="lona"]').checked=true;
  for(let i=0;i<10;i++)a.click('[data-action="add-media"][data-kind="photo"]');
  assert.ok(a.q('[data-action="add-media"][data-kind="photo"]').disabled);
  for(let i=0;i<3;i++)a.click('[data-action="add-media"][data-kind="video"]');
  assert.ok(a.q('[data-action="add-media"][data-kind="video"]').disabled);
  assert.equal(a.document.querySelectorAll('.thumb').length,13);
  a.input('#capture-notes','Nota persistida de ejemplo.');
  const saved=a.dom.window.localStorage.getItem('controlpublicidad-screens-v1');a.close();
  a=createApp(saved);a.login();a.change('#demo-role','f1');
  assert.equal(a.document.querySelectorAll('.thumb').length,13);
  assert.equal(a.q('#capture-notes').value,'Nota persistida de ejemplo.');
  assert.ok(!a.q('[data-action="seal-record"]').disabled);
  a.click('[data-action="seal-record"]');assert.match(a.q('.capture-success').textContent,/Registro demo guardado/);
  a.click('[data-nav="sync"]');
  assert.equal(a.document.querySelectorAll('.sync-row .pill.amber').length,1);
  a.click('[data-action="sync"]');
  assert.ok(!a.q('[data-action="sync"]').disabled);
  assert.equal(a.document.querySelectorAll('.sync-row .pill.amber').length,1);
  a.click('.sync-row [data-action="record-detail"]');
  assert.equal(a.document.querySelectorAll('.detail-media-tabs button').length,13);
  a.click('[data-action="record-media"][data-seq="11"]');
  assert.match(a.q('.media-placeholder').textContent,/Video de ejemplo/);
  assert.equal(a.document.querySelectorAll('#modal [data-action="edit-record"]').length,0);
  assert.deepEqual(a.errors,[]);a.close();
});
test('people tree is primary, filters keep ancestors, and profile totals include descendants',()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');
  assert.equal(a.q('#users-table').open,false);
  assert.equal(a.q('[data-branch="m1"]').open,true);assert.equal(a.q('[data-branch="m2"]').open,false);
  a.click('.tree [data-action="user-detail"][data-id="m1"]');
  assert.equal(a.q('[data-total="records"]').textContent,'14');
  assert.equal(a.q('[data-total="people"]').textContent,'6');
  a.click('[data-action="close-dialog"]');a.input('#user-search','Sofía');
  assert.match(a.q('.tree').textContent,/Mariana Torres/);assert.match(a.q('.tree').textContent,/Diego Méndez/);
  assert.doesNotMatch(a.q('.tree').textContent,/Elena García|Valeria Cruz/);
  assert.equal(a.q('[data-branch="m2"]').open,true);
  a.q('#users-table').open=true;assert.equal(a.document.querySelectorAll('tbody tr').length,1);
  assert.deepEqual(a.errors,[]);a.close();
});
test('manual creation, profile deactivation and reactivation preserve sample users',()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');a.click('[data-action="new-user"]');
  a.input('#manual-name','Colaborador nuevo');a.input('#manual-contact','nuevo@example.invalid');a.change('#manual-role','collaborator');
  a.change('#manual-parent','m2');a.submit('#manual-user-form');
  const saved=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data;
  const u=saved.users.find(u=>u.contact==='nuevo@example.invalid'),m=saved.memberships.find(m=>m.userId===u.id);
  assert.equal(m.parentId,'m2');assert.equal(saved.users.length,11);
  a.click('.tree [data-action="user-detail"][data-id="'+m.id+'"]');a.click('[data-action="toggle-user-status"]');
  a.click('.tree [data-action="user-detail"][data-id="'+m.id+'"]');a.click('[data-action="toggle-user-status"]');a.click('[data-action="edit-profile-name"]');
  a.input('#profile-name-input','Nombre modificado');a.submit('#profile-name-form');
  assert.match(a.q('.tree').textContent,/Nombre modificado/);
  assert.match(a.q('.tree').textContent,/Sofía López|Mariana Torres/);
  assert.deepEqual(a.errors,[]);a.close();
});
test('admin moves collaborator to another leader without relocating historical evidence',()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');a.click('.tree [data-action="user-detail"][data-id="m4"]');
  a.click('[data-action="move-user"]');a.change('#move-campaign','p2');a.change('#move-parent','m8');a.submit('#move-user-form');
  const saved=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data;
  const old=saved.memberships.find(m=>m.id==='m4'),next=saved.memberships.find(m=>m.userId==='f1'&&m.status==='active');
  assert.equal(old.status,'transferred');assert.equal(old.parentId,'m2');assert.equal(next.parentId,'m8');assert.equal(next.campaignId,'p2');
  assert.ok(saved.records.filter(r=>r.membershipId==='m4').every(r=>r.campaignId==='p1'));
  a.change('#demo-role','l2');a.click('[data-nav="users"]');
  assert.match(a.q('.tree').textContent,/Sofía López/);
  a.click('.tree [data-action="user-detail"][data-id="'+next.id+'"]');
  assert.equal(a.q('[data-total="records"]').textContent,'0');assert.equal(a.document.querySelectorAll('#modal [data-action="move-user"]').length,0);
  assert.deepEqual(a.errors,[]);a.close();
});
test('coordinator edits own collaborator directly by name and status, with no modify button in profile',()=>{
  const a=createApp();a.login();a.change('#demo-role','c1');a.click('[data-nav="users"]');
  a.click('.tree [data-action="user-detail"][data-id="m4"]');
  assert.equal(a.document.querySelectorAll('#modal [data-action="edit-user"]').length,0);
  assert.equal(a.document.querySelectorAll('#modal [data-action="deactivate-user"]').length,0);
  assert.equal(a.document.querySelectorAll('#modal [data-action="move-user"]').length,0);
  a.click('[data-action="edit-profile-name"]');a.input('#profile-name-input','Sofía del equipo');a.submit('#profile-name-form');
  assert.match(a.q('#profile-name-slot').textContent,/Sofía del equipo/);
  a.click('[data-action="toggle-user-status"]');assert.equal(a.q('[data-action="toggle-user-status"]').textContent,'Inactivo');
  a.click('[data-action="toggle-user-status"]');assert.equal(a.q('[data-action="toggle-user-status"]').textContent,'Activo');
  const saved=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data;
  assert.equal(saved.users.find(u=>u.id==='f1').name,'Sofía López');assert.equal(saved.memberships.find(m=>m.id==='m4').displayName,'Sofía del equipo');
  assert.deepEqual(a.errors,[]);a.close();
});
test('holding name opens editing and a cancelled pointer gesture does not',async()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');a.click('.tree [data-action="user-detail"][data-id="m4"]');
  const down=()=>{const event=new a.dom.window.Event('pointerdown',{bubbles:true});Object.assign(event,{button:0,clientX:10,clientY:10});a.q('[data-action="edit-profile-name"]').dispatchEvent(event);};
  down();await new Promise(r=>setTimeout(r,580));assert.ok(a.document.querySelector('#profile-name-input'));
  a.click('[data-action="cancel-profile-name"]');down();a.document.dispatchEvent(new a.dom.window.Event('pointercancel',{bubbles:true}));
  await new Promise(r=>setTimeout(r,580));assert.equal(a.document.querySelector('#profile-name-form'),null);
  assert.deepEqual(a.errors,[]);a.close();
});
function movedSofiaDraft(media=[]){
  const d=seedData();d.campaigns.push({id:'cc',name:'Casa Cantera',location:'Morelia',leaderId:'l2',types:['lona'],status:'active',color:'mint'});
  d.memberships.push({id:'cc-leader',campaignId:'cc',userId:'l2',role:'leader',parentId:null,status:'active'},{id:'cc-coordinator',campaignId:'cc',userId:'c3',role:'coordinator',parentId:'cc-leader',status:'active'});
  d.memberships.find(m=>m.id==='m4').status='transferred';d.memberships.push({id:'cc-sofia',campaignId:'cc',userId:'f1',role:'collaborator',parentId:'cc-coordinator',status:'active'});
  d.drafts={f1:{id:'old-draft',campaignId:'p1',type:'barda',notes:'Conservar esta nota',media,status:'draft',capturedAt:null}};
  return JSON.stringify({version:1,data:d});
}
test('Sofia stale empty draft follows Casa Cantera and offers only lona, preserving notes',()=>{
  const a=createApp(movedSofiaDraft());a.login();a.change('#demo-role','f1');
  assert.equal(a.q('#capture-campaign').value,'cc');assert.equal(a.q('#capture-campaign').selectedOptions[0].textContent,'Casa Cantera');
  assert.deepEqual([...a.document.querySelectorAll('[name="capture-type"]')].map(el=>el.value),['lona']);
  assert.ok(a.q('[name="capture-type"]').checked);assert.equal(a.q('#capture-notes').value,'Conservar esta nota');
  const injected=a.document.createElement('input');injected.name='capture-type';injected.value='espectacular';a.q('.type-choice').append(injected);
  injected.dispatchEvent(new a.dom.window.Event('change',{bubbles:true}));
  assert.deepEqual([...a.document.querySelectorAll('[name="capture-type"]')].map(el=>el.value),['lona']);
  a.click('[data-action="add-media"][data-kind="photo"]');a.click('[data-action="seal-record"]');
  const saved=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data;
  const r=saved.records.find(r=>r.id==='old-draft');assert.equal(r.campaignId,'cc');assert.equal(r.type,'lona');assert.equal(r.notes,'Conservar esta nota');
  assert.deepEqual(a.errors,[]);a.close();
});
test('a stale draft with evidence is retained and never reassigned automatically',()=>{
  const a=createApp(movedSofiaDraft([{kind:'photo',seq:1,capturedAt:'2026-10-07T12:00:00Z'}]));a.login();a.change('#demo-role','f1');
  assert.match(a.q('.empty').textContent,/Borrador conservado/);
  assert.equal(a.document.querySelector('[data-action="seal-record"]'),null);
  const d=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data.drafts.f1;
  assert.equal(d.campaignId,'p1');assert.equal(d.media.length,1);assert.equal(d.notes,'Conservar esta nota');
  assert.deepEqual(a.errors,[]);a.close();
});
test('coordinator migration selects a campaign and leader and moves its collaborators with it',()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');a.click('.tree [data-action="user-detail"][data-id="m8"]');
  a.click('[data-action="move-user"]');a.change('#move-campaign','p1');
  assert.match(a.q('[for="move-parent"]').textContent,/Líder/);assert.equal(a.document.querySelector('#move-leader'),null);
  a.change('#move-parent','m1');a.submit('#move-user-form');
  const d=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data,c=d.memberships.find(m=>m.userId==='c3'&&m.status==='active'),child=d.memberships.find(m=>m.userId==='f4'&&m.status==='active');
  assert.equal(c.campaignId,'p1');assert.equal(c.parentId,'m1');assert.equal(child.parentId,c.id);assert.equal(child.campaignId,'p1');
  assert.ok(d.records.filter(r=>r.membershipId==='m9').every(r=>r.campaignId==='p2'));
  assert.deepEqual(a.errors,[]);a.close();
});
test('profile controls enforce consultation scope and prevent disabling a coordinator with active children',async()=>{
  const a=createApp();a.login();a.click('[data-nav="users"]');a.click('.tree [data-action="user-detail"][data-id="m8"]');
  a.click('[data-action="toggle-user-status"]');await new Promise(r=>setTimeout(r,0));assert.match(a.q('#profile-error').textContent,/personas activas/);
  assert.equal(a.q('[data-action="toggle-user-status"]').textContent,'Activo');
  a.click('[data-action="close-dialog"]');a.change('#demo-role','l1');a.click('[data-nav="users"]');a.click('.tree [data-action="user-detail"][data-id="m4"]');
  assert.equal(a.document.querySelector('#modal [data-action="edit-profile-name"]'),null);assert.equal(a.document.querySelector('#modal [data-action="toggle-user-status"]'),null);
  assert.deepEqual(a.errors,[]);a.close();
});

test('breadcrumb and brand navigate to home, and daily bars expose exact photo/video counts',()=>{
  const a=createApp();a.login();
  assert.equal(a.q('.breadcrumb a[aria-current]').textContent,'Resumen');
  assert.equal(a.document.querySelectorAll('.chart-axis span').length,5);
  const first=a.q('.chart-bar');a.click('.chart-bar');assert.equal(a.q('.chart-readout').textContent,first.dataset.label);
  assert.equal(first.getAttribute('aria-pressed'),'true');
  a.click('[data-nav="users"]');a.click('.breadcrumb [data-nav="home"]');assert.match(a.q('h1').textContent,/Todo en su lugar/);
  a.click('[data-nav="users"]');a.click('.brand');assert.match(a.q('h1').textContent,/Todo en su lugar/);
  a.change('#demo-role','f1');a.click('[data-nav="sync"]');
  assert.ok(a.q('.daily-chart').compareDocumentPosition(a.q('.sync-row'))&a.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  const bars=[...a.document.querySelectorAll('.chart-bar')];assert.equal(bars.reduce((n,b)=>n+Number(b.dataset.count),0),12);
  a.click('.brand');assert.match(a.q('h1').textContent,/Nuevo registro/);
  assert.deepEqual(a.errors,[]);a.close();
});
test('evidence types start checked, empty selection shows none, campaign change selects allowed types',()=>{
  const a=createApp();a.login();a.click('[data-nav="evidence"]');
  assert.equal(a.document.querySelectorAll('[name="filter-type"]:checked').length,3);
  for(const value of ['lona','espectacular','barda']){const box=a.q('[name="filter-type"][value="'+value+'"]');box.checked=false;box.dispatchEvent(new a.dom.window.Event('change',{bubbles:true}));}
  assert.equal(a.document.querySelectorAll('.evidence-card').length,0);
  a.change('#filter-campaign','p2');assert.equal(a.document.querySelectorAll('[name="filter-type"]:checked').length,1);assert.equal(a.q('[name="filter-type"]').value,'espectacular');
  a.click('[data-action="clear-filters"]');assert.equal(a.document.querySelectorAll('.evidence-card').length,18);
  assert.deepEqual(a.errors,[]);a.close();
});
test('coordinator deletion confirms, retains original evidence and blocks future editing and capture',async()=>{
  const a=createApp();a.login();a.change('#demo-role','c1');a.click('[data-nav="users"]');
  assert.ok(a.q('.tree [data-id="m2"] .avatar').classList.contains('role-coordinator'));
  assert.ok(a.q('.tree [data-id="m4"] .avatar').classList.contains('role-collaborator'));
  a.click('.tree [data-id="m4"]');a.click('[data-action="toggle-user-status"]');await new Promise(r=>setTimeout(r,0));
  assert.ok(a.q('.tree [data-id="m4"] .avatar').classList.contains('is-inactive'));
  a.click('[data-action="delete-user"]');assert.ok(a.q('[data-action="confirm-delete-user"]'));a.click('[data-action="user-detail"][data-id="m4"]');
  a.click('[data-action="delete-user"]');a.click('[data-action="confirm-delete-user"]');await new Promise(r=>setTimeout(r,0));
  const d=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data;
  assert.equal(d.memberships.find(m=>m.id==='m4').status,'deleted');assert.equal(d.records.length,18);
  a.change('#user-status','deleted');a.click('.tree [data-id="m4"]');assert.equal(a.document.querySelector('[data-action="toggle-user-status"]'),null);a.click('[data-action="close-dialog"]');
  a.click('[data-nav="evidence"]');assert.match(a.q('#page').textContent,/Sofía LópezDado de baja/);
  a.click('[data-action="record-detail"][data-id="r1"]');assert.match(a.q('#modal').textContent,/Dado de baja/);a.click('[data-action="close-dialog"]');
  a.change('#demo-role','f1');assert.equal(a.document.querySelector('[data-action="seal-record"]'),null);
  assert.deepEqual(a.errors,[]);a.close();
});
const tick=()=>new Promise(r=>setTimeout(r,20));
test('seal tries cloud automatically, lost confirmation stays queued, retry preserves ID and restores receipt',async()=>{
  const receipts=new Map();let postCalls=0,loseReply=true;
  const fetcher=async(path,options)=>{
    if(options.method==='GET')return new Response(JSON.stringify({records:[...receipts.values()]}),{status:200});
    postCalls++;const p=JSON.parse(options.body);let result=receipts.get(p.record.id);
    if(!result){result={record:p.record,context:p.context,receipt:{id:p.record.id,number:19,receivedAt:'2026-10-07T12:00:00Z',kind:'demo-metadata'}};receipts.set(p.record.id,result);}
    if(loseReply){loseReply=false;throw new TypeError('connection lost');}
    return new Response(JSON.stringify(result),{status:201});
  };
  let a=createApp(null,fetcher);await tick();a.login();a.change('#demo-role','f1');
  a.change('[name="capture-type"][value="lona"]','lona');a.click('[data-action="add-media"][data-kind="photo"]');a.click('[data-action="seal-record"]');await tick();
  assert.equal(postCalls,1);a.click('[data-nav="sync"]');assert.equal(a.document.querySelectorAll('.sync-row .pill.amber').length,1);
  a.click('[data-action="sync"]');await tick();assert.equal(postCalls,2);assert.equal(receipts.size,1);assert.ok(a.q('[data-action="sync"]').disabled);
  assert.match(a.q('.sync-row').textContent,/En nube/);const stored=JSON.parse(a.dom.window.localStorage.getItem('controlpublicidad-screens-v1')).data;
  const r=stored.records.find(r=>r.cloudReceipt);assert.equal(r.number,19);assert.equal(r.media.length,1);
  assert.deepEqual(a.errors,[]);a.close();
  a=createApp(null,fetcher);await tick();a.login();a.change('#demo-role','f1');a.click('[data-nav="sync"]');
  assert.match(a.q('#page').textContent,/En nube/);assert.equal(a.document.querySelectorAll('.sync-row').length,6);assert.deepEqual(a.errors,[]);a.close();
});
