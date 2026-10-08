import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createCloudWorker} from '../cloud/worker.mjs';
import {seedData} from '../src/domain.mjs';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../cloud/drizzle',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../cloud/drizzle/'+file,import.meta.url),'utf8'));
  const env={DB:{prepare(sql){return {bind(...params){const statement=sqlite.prepare(sql);return {async first(){return statement.get(...params)||null;},async all(){return {results:statement.all(...params)};},async run(){return statement.run(...params);}};}};}}};
  const worker=createCloudWorker('<html>ControlPublicidad</html>');
  return {env,sqlite,async request(method='GET',payload,owner='owner-one',origin='https://test.invalid',path='/api/preview/records'){
    return worker.fetch(new Request('https://test.invalid'+path,{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),Origin:origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),env);
  }};
}
function payload(id='test-record'){
  const d=seedData(),members=d.memberships.filter(m=>['m4','m2','m1'].includes(m.id));
  return {record:{...d.records[0],id,source:'demo',author:{id:'f1',name:'Sofía López'},campaignName:d.campaigns[0].name},context:{memberships:members,users:d.users.filter(u=>['l1','c1','f1'].includes(u.id)),campaigns:[d.campaigns[0]]},baseline:18};
}
test('cloud storage isolates owners, preserves immutable payloads and retries without duplicate numbering',async()=>{
  const f=fixture(),p=payload();
  assert.equal((await f.request('POST',p,null)).status,401);
  assert.equal((await f.request('POST',p,'owner-one','https://other.invalid')).status,403);
  const first=await (await f.request('POST',p)).json();assert.equal(first.receipt.number,19);
  const retry=await (await f.request('POST',p)).json();assert.deepEqual(retry.receipt,first.receipt);
  const modified=structuredClone(p);modified.record.notes='Changed after sealing';assert.equal((await f.request('POST',modified)).status,409);
  assert.equal((await (await f.request('GET',null,'another-owner')).json()).records.length,0);
  assert.equal((await (await f.request('GET')).json()).records.length,1);
  const next=await (await f.request('POST',payload('next-record'))).json();assert.equal(next.receipt.number,20);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM preview_records').get().n,2);f.sqlite.close();
});
test('cloud validates campaign types and media limits and refuses unavailable persistence',async()=>{
  const f=fixture(),p=payload();p.context.campaigns[0].types=['lona'];p.record.type='barda';assert.equal((await f.request('POST',p)).status,400);
  p.record.type='lona';p.record.media=Array.from({length:11},(_,i)=>({kind:'photo',seq:i+1}));assert.equal((await f.request('POST',p)).status,400);
  const worker=createCloudWorker('');const response=await worker.fetch(new Request('https://test.invalid/api/preview/records',{headers:{'oai-authenticated-user-id':'owner'}}),{});assert.equal(response.status,503);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM preview_records').get().n,0);f.sqlite.close();
});

test('cloud deletion marker persists independently of immutable records and stays isolated by owner',async()=>{
  const f=fixture();const saved=await (await f.request('POST',payload())).json();
  const mark={id:'m4',userId:'f1',name:'Sofía López',source:'demo',global:false};
  assert.equal((await f.request('POST',mark,'owner-one','https://test.invalid','/api/preview/deletions')).status,201);
  assert.equal((await f.request('POST',mark,'owner-one','https://test.invalid','/api/preview/deletions')).status,201);
  const list=await (await f.request('GET')).json();assert.equal(list.deletions.length,1);assert.equal(list.deletions[0].id,'m4');assert.deepEqual(list.records[0].record,saved.record);
  assert.equal((await (await f.request('GET',null,'another-owner')).json()).deletions.length,0);f.sqlite.close();
});

test('cloud accepts leader and coordinator author snapshots without changing immutable retry behavior',async()=>{
  const f=fixture();
  for(const [author,member,name] of [['l1','m1','Mariana Torres'],['c1','m2','Diego Méndez']]){
    const p=payload('role-'+author);p.record.author={id:author,name};p.record.membershipId=member;
    p.context.memberships=p.context.memberships.filter(m=>m.id===member||m.id==='m1');p.context.users=p.context.users.filter(u=>u.id===author||u.id==='l1');
    const response=await f.request('POST',p);assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.record.author.id,author);
    const retry=await (await f.request('POST',p)).json();assert.equal(retry.receipt.number,saved.receipt.number);
  }
  f.sqlite.close();
});
