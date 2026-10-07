import test from 'node:test';
import assert from 'node:assert/strict';
import {seedData,scopedMemberships,visibleCampaigns,canManageMember,visibleRecords,filterRecords,validateCampaign,assertCapture,assertEditable,finalFilename,dateInMexico} from '../src/domain.mjs';
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
