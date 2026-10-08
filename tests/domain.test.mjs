import test from 'node:test';
import assert from 'node:assert/strict';
import {seedData,scopedMemberships,visibleCampaigns,canManageMember,visibleRecords,filterRecords,validateCampaign,assertCapture,assertEditable,finalFilename,dateInMexico,dailyEvidence,captureCampaigns,googleMapsUrl} from '../src/domain.mjs';
const fixture=()=>{const data=seedData();return {data,actor:id=>data.users.find(u=>u.id===id)};};
test('leaders see only their campaign branches, including descendants',()=>{
  const {data,actor}=fixture();
  assert.deepEqual(visibleCampaigns(data,actor('l1')).map(c=>c.id),['p1','p3']);
  assert.deepEqual(visibleCampaigns(data,actor('l2')).map(c=>c.id),['p2']);
  assert.equal(visibleRecords(data,actor('l1')).some(r=>r.campaignId==='p2'),false);
  assert.equal(scopedMemberships(data,actor('l1')).some(m=>m.userId==='f4'),false);
});
test('a coordinator cannot view or edit another coordinator branch',()=>{
  const {data,actor}=fixture(),diego=actor('c1');
  assert.deepEqual(scopedMemberships(data,diego).map(m=>m.id),['m2','m4','m5']);
  assert.equal(visibleRecords(data,diego).some(r=>r.membershipId==='m6'),false);
  assert.equal(canManageMember(data,diego,data.memberships.find(m=>m.id==='m4')),true);
  assert.equal(canManageMember(data,diego,data.memberships.find(m=>m.id==='m6')),false);
  assert.equal(canManageMember(data,diego,{id:'attack',role:'collaborator',parentId:'m2',campaignId:'p2'}),false);
});
test('a leader can manage direct coordinators but only consult their collaborators',()=>{
  const {data,actor}=fixture(),leader=actor('l1');
  assert.equal(canManageMember(data,leader,data.memberships.find(m=>m.id==='m2')),true);
  assert.equal(canManageMember(data,leader,data.memberships.find(m=>m.id==='m4')),false);
  assert.equal(canManageMember(data,leader,data.memberships.find(m=>m.id==='m8')),false);
});
test('inactive parent does not retain administration privileges',()=>{
  const {data,actor}=fixture();data.memberships.find(m=>m.id==='m2').status='inactive';
  assert.equal(canManageMember(data,actor('c1'),data.memberships.find(m=>m.id==='m4')),false);
  assert.equal(visibleCampaigns(data,actor('c1')).length,0);
  assert.ok(visibleRecords(data,actor('l1')).some(r=>r.membershipId==='m4'));
});
test('only administrator can create campaigns with exactly one leader and valid types',()=>{
  const {data,actor}=fixture(),input={name:'Campaña nueva',location:'Morelia',leaderId:'l1',types:['lona','barda']};
  assert.equal(validateCampaign(actor('a1'),input,data).name,input.name);
  assert.throws(()=>validateCampaign(actor('l1'),input,data));
  assert.throws(()=>validateCampaign(actor('a1'),{...input,leaderId:'c1'},data));
  assert.throws(()=>validateCampaign(actor('a1'),{...input,types:[]},data));
  assert.throws(()=>validateCampaign(actor('a1'),{...input,types:['lona','lona']},data));
  assert.throws(()=>validateCampaign(actor('a1'),{...input,types:['otro']},data));
});
test('capture validates campaign membership and one permitted type',()=>{
  const {data,actor}=fixture(),media=[{kind:'photo'}];
  assert.equal(assertCapture(data,actor('f1'),'p1','lona',media).id,'m4');
  assert.throws(()=>assertCapture(data,actor('f1'),'p2','lona',media));
  assert.throws(()=>assertCapture(data,actor('f1'),'p1',['lona','barda'],media));
  assert.throws(()=>assertCapture(data,actor('a1'),'p1','lona',media));
  assert.throws(()=>assertCapture(data,actor('f1'),'p1','lona',[]));
  assert.throws(()=>assertCapture(data,actor('f1'),'p1','lona',[{kind:'audio'}]));
});
test('10 photos and 3 videos are accepted but either extra file is rejected',()=>{
  const {data,actor}=fixture(),photos=Array.from({length:10},()=>({kind:'photo'})),videos=Array.from({length:3},()=>({kind:'video'}));
  assert.doesNotThrow(()=>assertCapture(data,actor('f1'),'p1','lona',[...photos,...videos]));
  assert.throws(()=>assertCapture(data,actor('f1'),'p1','lona',[...photos,...videos,{kind:'photo'}]));
  assert.throws(()=>assertCapture(data,actor('f1'),'p1','lona',[...photos,...videos,{kind:'video'}]));
});
test('sealed records cannot be edited regardless of upload state',()=>{
  assert.doesNotThrow(()=>assertEditable({status:'draft'}));
  for(const status of ['pending','synced','uploading','error'])assert.throws(()=>assertEditable({status}));
});
test('date filters use Mexico City capture date, with combined campaign and type filters',()=>{
  assert.equal(dateInMexico('2026-10-07T02:00:00Z'),'2026-10-06');
  const records=[{id:1,campaignId:'p1',type:'lona',capturedAt:'2026-10-07T02:00:00Z'},{id:2,campaignId:'p1',type:'barda',capturedAt:'2026-10-07T08:00:00Z'},{id:3,campaignId:'p2',type:'lona',capturedAt:'2026-10-07T02:00:00Z'}];
  assert.deepEqual(filterRecords(records,{campaign:'p1',types:['lona'],from:'2026-10-06',to:'2026-10-06'}).map(r=>r.id),[1]);
  assert.deepEqual(filterRecords(records,{types:['lona','barda']}).map(r=>r.id),[1,2,3]);
});
test('filenames preserve numbering and reject invalid media positions',()=>{
  assert.equal(finalFilename('Morelia se mueve',2,13,'MP4'),'Morelia se mueve - 2 - 13.mp4');
  assert.equal(finalFilename('A/B',2,1,'jpg'),'A_B - 2 - 1.jpg');
  assert.throws(()=>finalFilename('Morelia',0,1,'jpg'));
  assert.throws(()=>finalFilename('Morelia',1,14,'jpg'));
});

test('explicit empty type selection yields zero records, default selection yields all',()=>{
  const d=seedData();assert.equal(filterRecords(d.records,{types:[]}).length,0);assert.equal(filterRecords(d.records).length,18);
});
test('daily evidence counts media on Mexico capture date and includes the latest capture',()=>{
  const rs=[{capturedAt:'2026-10-07T02:00:00Z',media:[{kind:'photo'},{kind:'photo'},{kind:'video'}]},{capturedAt:'2026-10-07T08:00:00Z',media:[{kind:'photo'}]}];
  const days=dailyEvidence(rs);assert.equal(days.at(-2).day,'2026-10-06');assert.equal(days.at(-2).photos,2);assert.equal(days.at(-2).videos,1);assert.equal(days.at(-1).photos,1);
});

test('capture is assigned to the active author at any field role, never a descendant or sibling',()=>{
  const {data,actor}=fixture(),media=[{kind:'photo'}];
  assert.equal(assertCapture(data,actor('l1'),'p1','lona',media).id,'m1');
  assert.equal(assertCapture(data,actor('l1'),'p3','barda',media).id,'m10');
  assert.equal(assertCapture(data,actor('c1'),'p1','barda',media).id,'m2');
  assert.throws(()=>assertCapture(data,actor('l1'),'p2','espectacular',media));assert.throws(()=>assertCapture(data,actor('c1'),'p2','espectacular',media));
  data.memberships.find(m=>m.id==='m1').status='inactive';
  assert.equal(captureCampaigns(data,actor('c1')).length,0);assert.throws(()=>assertCapture(data,actor('l1'),'p1','lona',media));
});
test('maps coordinates accept the equator and reject missing or out-of-range GPS',()=>{
  assert.equal(new URL(googleMapsUrl({lat:0,lng:0})).searchParams.get('query'),'0,0');
  for(const gps of [null,{lat:null,lng:0},{lat:91,lng:0},{lat:0,lng:181}])assert.equal(googleMapsUrl(gps),null);
});
