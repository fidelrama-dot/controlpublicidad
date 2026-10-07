import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {FileVault,CHUNK_BYTES} from '../server/files.mjs';
import {Service,ApiError,hash} from '../server/service.mjs';
import {createHttpServer} from '../server/http.mjs';
function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'cp-test-'));
  let store=new Store(join(directory,'db.sqlite'));
  let vault=new FileVault(join(directory,'media'),{development:true});
  let clock=Date.now();
  let service=new Service(store,vault,{development:true,now:()=>clock});service.seed();
  return {
    directory,get store(){return store;},get service(){return service;},get vault(){return vault;},
    actor:id=>service.data().users.find(u=>u.id===id),advance:ms=>clock+=ms,
    reopen(){store.close();store=new Store(join(directory,'db.sqlite'));vault=new FileVault(join(directory,'media'),{development:true});service=new Service(store,vault,{development:true,now:()=>clock});},
    close(){store.close();rmSync(directory,{recursive:true,force:true});}
  };
}
function manifest(member='m4',bytes=Buffer.from([255,216,255,224,1,2,3,4])){
  const gps={lat:19.705,lng:-101.198,accuracy:6,capturedAt:'2026-10-07T12:00:00Z'};
  return {id:randomUUID(),membershipId:member,type:member==='m9'?'espectacular':'lona',notes:'Prueba de evidencia',device:{name:'Equipo',brand:'Marca',model:'Modelo',installationId:randomUUID()},media:[{id:randomUUID(),kind:'photo',mime:'image/jpeg',bytes:bytes.length,sha256:hash(bytes),capturedAt:'2026-10-07T12:00:00Z',gps}]};
}
const forbidden=(fn,status)=>assert.throws(fn,error=>error instanceof ApiError&&error.status===status);
test('SQLite campaigns and per-campaign profile edits persist through restart',()=>{
  const f=fixture();
  const c=f.service.createCampaign(f.actor('a1'),{name:'Nueva',location:'Morelia',leaderId:'l1',types:['lona','barda']});
  f.service.updateMember(f.actor('c1'),'m4',{name:'Nombre en mi equipo',status:'active'});
  assert.equal(f.service.data().users.find(u=>u.id==='f1').name,'Sofía López');
  f.reopen();
  assert.equal(f.service.data().campaigns.find(x=>x.id===c.id).types.length,2);
  assert.equal(f.service.data().memberships.find(m=>m.id==='m4').displayName,'Nombre en mi equipo');
  assert.equal(f.store.all("SELECT id FROM memberships WHERE campaign_id=? AND role='leader'",c.id).length,1);f.close();
});
test('server denies sibling edits, cross-campaign invites and non-admin campaign creation',()=>{
  const f=fixture();
  forbidden(()=>f.service.updateMember(f.actor('c1'),'m6',{name:'Ataque',status:'inactive'}),404);
  forbidden(()=>f.service.updateMember(f.actor('l1'),'m4',{name:'Ataque',status:'active'}),404);
  forbidden(()=>f.service.createCampaign(f.actor('l1'),{name:'Ataque',location:'Morelia',leaderId:'l1',types:['lona']}),403);
  forbidden(()=>f.service.invite(f.actor('c1'),{name:'Persona',contact:'new@example.invalid',campaignId:'p2',role:'collaborator'},'http://localhost'),404);
  forbidden(()=>f.service.invite(f.actor('c1'),{name:'Persona',contact:'new@example.invalid',campaignId:'p1',parentId:'m3',role:'collaborator'},'http://localhost'),403);
  assert.deepEqual(f.service.bootstrap(f.actor('c1')).memberships.map(m=>m.id),['m2','m4','m5']);f.close();
});
test('leader cannot be disabled and active descendants must be resolved before coordinator deactivation',()=>{
  const f=fixture();
  forbidden(()=>f.service.updateMember(f.actor('a1'),'m1',{name:'Mariana',status:'inactive'}),409);
  forbidden(()=>f.service.updateMember(f.actor('l1'),'m2',{name:'Diego',status:'inactive'}),409);
  f.service.updateMember(f.actor('c1'),'m4',{name:'Sofía',status:'inactive'});
  assert.equal(f.service.data().memberships.find(m=>m.id==='m5').status,'active');f.close();
});
test('invitation is contact-bound, expiring, one-time and stored without its plaintext token',()=>{
  const f=fixture();
  const i=f.service.invite(f.actor('c1'),{name:'Nueva persona',contact:'new@example.invalid',campaignId:'p1'},'http://localhost');
  assert.match(i.link,/invite=/);assert.notEqual(f.store.get('SELECT token_hash FROM invitations WHERE id=?',i.id).token_hash,i.token);
  forbidden(()=>f.service.acceptInvite(f.actor('f2'),i.token),404);
  const u=f.service.data().users.find(u=>u.id===i.userId);
  assert.equal(f.service.acceptInvite(u,i.token).accepted,true);
  forbidden(()=>f.service.acceptInvite(u,i.token),404);
  const other=f.service.invite(f.actor('c1'),{name:'Otra',contact:'other@example.invalid',campaignId:'p1'},'http://localhost');
  f.advance(8*86400000);forbidden(()=>f.service.acceptInvite(f.actor(other.userId),other.token),404);f.close();
});
test('OTP codes are one-time, limited to 5 attempts, and sessions expire',async()=>{
  const f=fixture();
  let r=await f.service.requestCode('admin@example.invalid');
  forbidden(()=>f.service.verify('admin@example.invalid','bad'),401);
  for(let i=0;i<5;i++)forbidden(()=>f.service.verify('admin@example.invalid','000000'===r.developmentCode?'000001':'000000'),401);
  forbidden(()=>f.service.verify('admin@example.invalid',r.developmentCode),401);
  f.advance(31000);r=await f.service.requestCode('admin@example.invalid');
  const session=f.service.verify('admin@example.invalid',r.developmentCode);
  assert.equal(f.service.session(session.sessionToken).user.id,'a1');
  forbidden(()=>f.service.verify('admin@example.invalid',r.developmentCode),401);
  f.advance(9*3600000);forbidden(()=>f.service.session(session.sessionToken),401);f.close();
});
test('renewal invalidates the previous invitation and cancellation blocks both tokens',()=>{
  const f=fixture(),i=f.service.invite(f.actor('c1'),{name:'Persona',contact:'renew@example.invalid',campaignId:'p1'},'http://localhost');
  const renewed=f.service.renewInvite(f.actor('c1'),i.id,'http://localhost');
  forbidden(()=>f.service.acceptInvite(f.actor(i.userId),i.token),404);
  forbidden(()=>f.service.renewInvite(f.actor('c2'),i.id,'http://localhost'),404);
  f.service.revokeInvite(f.actor('c1'),i.id);
  forbidden(()=>f.service.acceptInvite(f.actor(i.userId),new URL(renewed.link).searchParams.get('invite')),404);f.close();
});
test('a newly invited leader receives no campaign before verified acceptance',()=>{
  const f=fixture(),i=f.service.invite(f.actor('a1'),{name:'Líder',contact:'leader@example.invalid',role:'leader'},'http://localhost');
  const input={name:'Campaña',location:'Morelia',leaderId:i.userId,types:['lona']};
  forbidden(()=>f.service.createCampaign(f.actor('a1'),input),409);
  assert.equal(f.service.bootstrap(f.actor(i.userId)).campaigns.length,0);
  f.service.acceptInvite(f.actor(i.userId),i.token);
  assert.ok(f.service.createCampaign(f.actor('a1'),input).id);f.close();
});
test('uploads resume after restart, encrypt bytes, verify all hashes, and finalize idempotently',()=>{
  const f=fixture(),bytes=Buffer.alloc(CHUNK_BYTES+8,3);bytes.set([255,216,255,224]);
  const m=manifest('m4',bytes),mid=m.media[0].id;
  f.service.createRecord(f.actor('f1'),m);
  forbidden(()=>f.service.finalize(f.actor('f1'),m.id),409);
  f.service.uploadChunk(f.actor('f1'),m.id,mid,0,bytes.subarray(0,CHUNK_BYTES));
  assert.equal(f.service.uploadChunk(f.actor('f1'),m.id,mid,0,bytes.subarray(0,CHUNK_BYTES)).duplicate,true);
  assert.notDeepEqual(readFileSync(f.vault.path(m.id,mid,0)),bytes.subarray(0,CHUNK_BYTES));
  f.reopen();
  assert.deepEqual(f.service.recordStatus(f.actor('f1'),m.id).media[0].received,[0]);
  f.service.createRecord(f.actor('f1'),m);
  f.service.uploadChunk(f.actor('f1'),m.id,mid,1,bytes.subarray(CHUNK_BYTES));
  const final=f.service.finalize(f.actor('f1'),m.id);assert.equal(final.status,'synced');assert.equal(final.number,1);
  assert.equal(f.service.finalize(f.actor('f1'),m.id).number,1);
  assert.deepEqual(f.service.media(f.actor('c1'),m.id,mid).bytes,bytes);
  assert.equal(f.service.media(f.actor('l1'),m.id,mid).filename,'Morelia se mueve - 1 - 1.jpg');
  forbidden(()=>f.service.uploadChunk(f.actor('f1'),m.id,mid,0,bytes.subarray(0,CHUNK_BYTES)),409);
  forbidden(()=>f.service.createRecord(f.actor('f1'),{...m,notes:'Alterado'}),409);
  forbidden(()=>f.service.recordStatus(f.actor('c2'),m.id),404);f.close();
});
test('altered or corrupted files never produce a confirmed record',()=>{
  const f=fixture(),bytes=Buffer.from([255,216,255,224,1,2,3,4]),m=manifest('m4',bytes);
  f.service.createRecord(f.actor('f1'),m);
  f.service.uploadChunk(f.actor('f1'),m.id,m.media[0].id,0,Buffer.from([255,216,255,224,4,3,2,1]));
  forbidden(()=>f.service.finalize(f.actor('f1'),m.id),409);
  assert.equal(f.service.recordStatus(f.actor('f1'),m.id).status,'uploading');
  const encryptedPath=f.vault.path(m.id,m.media[0].id,0),encrypted=readFileSync(encryptedPath);encrypted[30]^=1;writeFileSync(encryptedPath,encrypted);
  assert.throws(()=>f.vault.read(m.id,m.media[0].id,0));f.close();
});
test('server refuses spoofed author, inactive collaborator, limits, and invalid GPS',()=>{
  const f=fixture(),m=manifest();
  forbidden(()=>f.service.createRecord(f.actor('f2'),m),403);
  forbidden(()=>f.service.createRecord(f.actor('a1'),m),403);
  const over={...m,media:Array.from({length:11},()=>({...m.media[0],id:randomUUID()}))};
  forbidden(()=>f.service.createRecord(f.actor('f1'),over),400);
  const bad={...m,media:[{...m.media[0],gps:{lat:100,lng:0,accuracy:4,capturedAt:'2026-10-07T12:00:00Z'}}]};
  forbidden(()=>f.service.createRecord(f.actor('f1'),bad),400);
  f.service.updateMember(f.actor('c1'),'m4',{name:'Sofía',status:'inactive'});
  forbidden(()=>f.service.createRecord(f.actor('f1'),m),403);f.close();
});
test('HTTP requires session, CSRF and same-origin writes, and exposes no static data files',async()=>{
  const f=fixture();
  const server=createHttpServer(f.service,{origin:'http://127.0.0.1:0'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address='http://127.0.0.1:'+server.address().port;
  const headers={'Content-Type':'application/json',Origin:address};
  try{
    let r=await fetch(address+'/api/bootstrap',{headers});assert.equal(r.status,401);
    r=await fetch(address+'/api/auth/request',{method:'POST',headers,body:JSON.stringify({contact:'admin@example.invalid'})});
    const code=(await r.json()).developmentCode;
    r=await fetch(address+'/api/auth/verify',{method:'POST',headers,body:JSON.stringify({contact:'admin@example.invalid',code})});
    assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const result=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];
    const payload=JSON.stringify({name:'HTTP',location:'Morelia',leaderId:'l1',types:['lona']});
    r=await fetch(address+'/api/campaigns',{method:'POST',headers:{...headers,Cookie:cookie},body:payload});assert.equal(r.status,403);
    r=await fetch(address+'/api/campaigns',{method:'POST',headers:{...headers,Cookie:cookie,'X-CSRF-Token':result.csrf,Origin:'https://evil.example.invalid'},body:payload});assert.equal(r.status,403);
    r=await fetch(address+'/api/campaigns',{method:'POST',headers:{...headers,Cookie:cookie,'X-CSRF-Token':result.csrf},body:payload});assert.equal(r.status,201);
    r=await fetch(address+'/server/.data/controlpublicidad.sqlite',{headers:{...headers,Cookie:cookie}});assert.equal(r.status,404);
    r=await fetch(address+'/api/auth/verify',{method:'POST',headers,body:'null'});assert.equal(r.status,400);
  }finally{await new Promise(resolve=>server.close(resolve));f.close();}
});
