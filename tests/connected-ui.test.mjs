import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {FileVault,CHUNK_BYTES} from '../server/files.mjs';
import {Service,hash} from '../server/service.mjs';
import {createHttpServer} from '../server/http.mjs';
import {ApiClient} from '../src/api.mjs';
async function connected(){
  const directory=mkdtempSync(join(tmpdir(),'cp-connected-'));
  const store=new Store(join(directory,'db.sqlite')),vault=new FileVault(join(directory,'media'),{development:true}),service=new Service(store,vault,{development:true});service.seed();
  const server=createHttpServer(service,{origin:'http://127.0.0.1:0'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let cookie='';
  const fetcher=async(path,options={})=>{
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})}});
    const value=response.headers.get('set-cookie');if(value)cookie=value.split(';')[0];
    return response;
  };
  return {store,service,origin,fetcher,close:async()=>{await new Promise(resolve=>server.close(resolve));store.close();rmSync(directory,{recursive:true,force:true});}};
}
async function waitFor(fn,message){
  const deadline=Date.now()+4000;
  while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,10));}
  throw Error(message);
}
test('connected screen signs in, creates campaigns and invitations, and saves scoped profile changes',async()=>{
  const f=await connected(),errors=[];
  const html=(await(await f.fetcher('/?server=1')).text()).replace('<script type="module">','<script>');
  const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{url:f.origin+'/?server=1',runScripts:'dangerously',virtualConsole:console,beforeParse(w){
    w.fetch=f.fetcher;w.structuredClone=structuredClone;w.scrollTo=()=>{};
    w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  }});
  const d=dom.window.document,q=s=>{const el=d.querySelector(s);assert.ok(el,'Missing '+s);return el;};
  const click=s=>q(s).click(),change=(s,v)=>{const el=q(s);el.value=v;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  const submit=s=>q(s).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  const login=async contact=>{
    q('#login-contact').value=contact;submit('#login-form');
    await waitFor(()=>d.querySelector('#login-code'),'code form');
    const code=q('#login-form .sub strong').textContent;q('#login-code').value=code;submit('#login-form');
    await waitFor(()=>d.querySelector('.sidebar'),'logged-in shell');
  };
  try{
    await waitFor(()=>d.querySelector('#login-contact'),'login');await new Promise(r=>setTimeout(r,30));
    await login('admin@example.invalid');
    assert.equal(d.querySelectorAll('#demo-role').length,0);
    assert.match(q('.demo-strip').textContent,/Cambios persistentes/);
    click('[data-action="new-campaign"]');q('#campaign-name').value='Campaña conectada';q('#campaign-location').value='Morelia';change('#campaign-leader','l1');q('[name="types"][value="lona"]').checked=true;
    submit('#campaign-form');await waitFor(()=>d.querySelectorAll('.campaign-card').length===4,'created campaign');
    assert.equal(f.store.all('SELECT id FROM campaigns').length,4);
    click('[data-nav="users"]');click('[data-action="new-user"]');
    q('#manual-name').value='Colaborador manual';q('#manual-contact').value='manual-ui@example.invalid';change('#manual-role','collaborator');change('#manual-parent','m2');submit('#manual-user-form');
    await waitFor(()=>!d.querySelector('#modal[open]'),'manual create');
    const manualUser=f.store.get('SELECT id FROM users WHERE contact=?','manual-ui@example.invalid');
    const manualMember=f.store.get('SELECT id FROM memberships WHERE user_id=?',manualUser.id);
    click('.tree [data-action="user-detail"][data-id="'+manualMember.id+'"]');click('[data-action="move-user"]');change('#move-campaign','p2');change('#move-parent','m8');submit('#move-user-form');
    await waitFor(()=>!d.querySelector('#modal[open]'),'manual transfer');
    assert.equal(f.store.get('SELECT status FROM memberships WHERE id=?',manualMember.id).status,'transferred');
    assert.equal(f.store.get("SELECT parent_id FROM memberships WHERE user_id=? AND status='active'",manualUser.id).parent_id,'m8');

    click('[data-nav="users"]');click('[data-action="invite-user"]');
    q('#invite-name').value='Líder nuevo';q('#invite-contact').value='leader-new@example.invalid';change('#invite-role','leader');submit('#invite-form');
    await waitFor(()=>d.querySelector('#invite-link'),'invitation link');
    assert.match(q('#invite-link').value,/invite=/);
    click('[data-action="close-dialog"]');
    assert.match(q('tbody').textContent,/Líder nuevo/);
    assert.equal(dom.window.localStorage.length,0);
    click('[data-action="logout"]');await waitFor(()=>d.querySelector('#login-contact'),'logout');
    await login('diego@example.invalid');click('[data-nav="users"]');
    assert.equal(d.querySelectorAll('tbody tr').length,3);assert.doesNotMatch(q('tbody').textContent,/Valeria Cruz/);
    click('.tree [data-action="user-detail"][data-id="m4"]');click('[data-action="edit-profile-name"]');q('#profile-name-input').value='Sofía del equipo';submit('#profile-name-form');
    await waitFor(()=>d.querySelector('#profile-name-slot')?.textContent.includes('Sofía del equipo'),'inline edit saved');
    click('[data-action="toggle-user-status"]');await waitFor(()=>d.querySelector('[data-action="toggle-user-status"]')?.textContent==='Inactivo','inline deactivated');
    click('[data-action="toggle-user-status"]');await waitFor(()=>d.querySelector('[data-action="toggle-user-status"]')?.textContent==='Activo','inline activated');
    assert.match(q('tbody').textContent,/Sofía del equipo/);
    assert.equal(f.store.get('SELECT display_name FROM memberships WHERE id=?','m4').display_name,'Sofía del equipo');
    assert.equal(f.store.get('SELECT name FROM users WHERE id=?','f1').name,'Sofía López');
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();await f.close();}
});
test('client retries interrupted upload, skips accepted chunks and preserves final number',async()=>{
  const f=await connected();
  let interrupted=false,putRequests=0;
  const client=new ApiClient({fetcher:async(path,options)=>{
    if(options?.method==='PUT'){putRequests++;if(path.endsWith('/1')&&!interrupted){interrupted=true;throw Error('test cut');}}
    return f.fetcher(path,options);
  }});
  try{
    const code=await client.requestCode('sofia@example.invalid');await client.verify('sofia@example.invalid',code.developmentCode);
    const bytes=Buffer.alloc(CHUNK_BYTES+8,7);bytes.set([255,216,255,224]);
    const mid=randomUUID(),manifest={id:randomUUID(),membershipId:'m4',type:'lona',notes:'',device:{installationId:randomUUID()},media:[{id:mid,kind:'photo',mime:'image/jpeg',bytes:bytes.length,sha256:hash(bytes),capturedAt:'2026-10-07T12:00:00Z',gps:null}]};
    const blobs=new Map([[mid,new Blob([bytes])]]);
    await assert.rejects(()=>client.uploadRecord(manifest,blobs),/No hay conexión/);
    const result=await client.uploadRecord(manifest,blobs);assert.equal(result.status,'synced');assert.equal(result.number,1);
    assert.equal(putRequests,3);
    const repeat=await client.uploadRecord(manifest,blobs);assert.equal(repeat.number,1);assert.equal(putRequests,3);
    assert.equal(blobs.get(mid).size,bytes.length);
  }finally{await f.close();}
});
