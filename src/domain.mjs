export const TYPE_NAMES = {lona:'Lona', espectacular:'Espectacular', barda:'Barda'};
export const ROLE_NAMES = {admin:'Administrador', leader:'Líder', coordinator:'Coordinador', collaborator:'Colaborador'};
export const CHILD_ROLE = {admin:'leader', leader:'coordinator', coordinator:'collaborator'};
export function seedData() {
  return {
    users:[
      {id:'a1', name:'Fidel Ramírez', role:'admin', contact:'admin@example.invalid'},
      {id:'l1', name:'Mariana Torres', role:'leader', contact:'mariana@example.invalid'},
      {id:'l2', name:'Andrés Rojas', role:'leader', contact:'andres@example.invalid'},
      {id:'c1', name:'Diego Méndez', role:'coordinator', contact:'diego@example.invalid'},
      {id:'c2', name:'Elena García', role:'coordinator', contact:'elena@example.invalid'},
      {id:'c3', name:'Pablo Ruiz', role:'coordinator', contact:'pablo@example.invalid'},
      {id:'f1', name:'Sofía López', role:'collaborator', contact:'sofia@example.invalid'},
      {id:'f2', name:'Luis Hernández', role:'collaborator', contact:'luis@example.invalid'},
      {id:'f3', name:'Valeria Cruz', role:'collaborator', contact:'valeria@example.invalid'},
      {id:'f4', name:'Carlos Vega', role:'collaborator', contact:'carlos@example.invalid'}
    ],
    campaigns:[
      {id:'p1', name:'Morelia se mueve', location:'Centro Histórico, Morelia', leaderId:'l1', types:['lona','espectacular','barda'], color:'mint', status:'active'},
      {id:'p2', name:'Presencia en el poniente', location:'Av. Madero Poniente, Morelia', leaderId:'l2', types:['espectacular'], color:'sand', status:'active'},
      {id:'p3', name:'Comunidad visible', location:'Altozano, Morelia', leaderId:'l1', types:['lona','barda'], color:'lilac', status:'active'}
    ],
    memberships:[
      {id:'m1', campaignId:'p1', userId:'l1', role:'leader', parentId:null, status:'active'},
      {id:'m2', campaignId:'p1', userId:'c1', role:'coordinator', parentId:'m1', status:'active'},
      {id:'m3', campaignId:'p1', userId:'c2', role:'coordinator', parentId:'m1', status:'active'},
      {id:'m4', campaignId:'p1', userId:'f1', role:'collaborator', parentId:'m2', status:'active'},
      {id:'m5', campaignId:'p1', userId:'f2', role:'collaborator', parentId:'m2', status:'active'},
      {id:'m6', campaignId:'p1', userId:'f3', role:'collaborator', parentId:'m3', status:'active'},
      {id:'m7', campaignId:'p2', userId:'l2', role:'leader', parentId:null, status:'active'},
      {id:'m8', campaignId:'p2', userId:'c3', role:'coordinator', parentId:'m7', status:'active'},
      {id:'m9', campaignId:'p2', userId:'f4', role:'collaborator', parentId:'m8', status:'active'},
      {id:'m10', campaignId:'p3', userId:'l1', role:'leader', parentId:null, status:'active'}
    ],
    records: Array.from({length:18}, (_,i)=>{
      const mi = ['m4','m5','m6','m9'][i%4];
      return {id:'r'+(i+1), number:i+1, campaignId:mi==='m9'?'p2':'p1', membershipId:mi,
        type:mi==='m9'?'espectacular':['lona','barda','espectacular'][i%3],
        capturedAt:`2026-10-${String(6-i%4).padStart(2,'0')}T${String(10+i%8).padStart(2,'0')}:24:00-06:00`,
        lat:19.702+(i%6)*0.0013, lng:-101.201+(i%5)*0.0017, accuracy:5+i%4,
        notes:['Instalación completa, visible desde ambos sentidos.','Evidencia del punto asignado.','Superficie y fijación revisadas.'][i%3],
        media:[{kind:'photo', seq:1},{kind:'photo', seq:2},...(i%3===0?[{kind:'video',seq:3}]:[])],
        status:'synced', device:{name:'Equipo de campo',brand:'Samsung',model:'SM-A566E',installationId:'demo-device-'+mi}};
    }),
    invitations:[], audit:[]
  };
}
export function descendants(data, rootId) {
  const found=new Set([rootId]);
  let changed=true;
  while(changed) {
    changed=false;
    for(const m of data.memberships) if(m.parentId && found.has(m.parentId) && !found.has(m.id)) {found.add(m.id);changed=true;}
  }
  return found;
}
export function scopedMemberships(data, actor) {
  if(actor.role==='admin') return [...data.memberships];
  const roots=data.memberships.filter(m=>m.userId===actor.id && m.status==='active');
  const allowed=new Set(roots.flatMap(m=>[...descendants(data,m.id)]));
  return data.memberships.filter(m=>allowed.has(m.id));
}
export function visibleCampaigns(data,actor) {
  if(actor.role==='admin') return [...data.campaigns];
  const ids=new Set(scopedMemberships(data,actor).map(m=>m.campaignId));
  return data.campaigns.filter(c=>ids.has(c.id));
}
export function canManageMember(data,actor,target) {
  if(!target) return false;
  if(actor.role==='admin') return true;
  if(target.role!==CHILD_ROLE[actor.role]) return false;
  const parent=data.memberships.find(m=>m.id===target.parentId);
  return Boolean(parent && parent.userId===actor.id && parent.status==='active' && parent.campaignId===target.campaignId);
}
export function visibleRecords(data,actor) {
  const scope=new Set(scopedMemberships(data,actor).map(m=>m.id));
  return data.records.filter(r=>scope.has(r.membershipId));
}
export function dateInMexico(iso) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
  const get=t=>parts.find(p=>p.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function filterRecords(records,{campaign='',types=[],from='',to=''}={}) {
  return records.filter(r=>(!campaign||r.campaignId===campaign)&&(!types.length||types.includes(r.type))&&(!from||dateInMexico(r.capturedAt)>=from)&&(!to||dateInMexico(r.capturedAt)<=to));
}
export function validateCampaign(actor,input,data) {
  if(actor.role!=='admin') throw Error('Solo el administrador puede crear campañas.');
  if(!input.name?.trim()||!input.location?.trim()) throw Error('Completa el nombre y la ubicación.');
  if(!data.users.some(u=>u.id===input.leaderId&&u.role==='leader')) throw Error('Selecciona un líder.');
  if(!input.types?.length||new Set(input.types).size!==input.types.length||input.types.some(t=>!TYPE_NAMES[t])) throw Error('Selecciona uno o varios tipos válidos.');
  return {...input,name:input.name.trim(),location:input.location.trim()};
}
export function assertCapture(data,actor,campaignId,type,media) {
  const member=data.memberships.find(m=>m.userId===actor.id&&m.campaignId===campaignId&&m.role==='collaborator'&&m.status==='active');
  if(!member || actor.role!=='collaborator') throw Error('La captura está disponible para colaboradores asignados.');
  const c=data.campaigns.find(c=>c.id===campaignId);
  if(!c?.types.includes(type)) throw Error('Elige un tipo permitido por la campaña.');
  if(media.some(m=>!['photo','video'].includes(m.kind))) throw Error('Tipo de evidencia inválido.');
  if(media.filter(m=>m.kind==='photo').length>10||media.filter(m=>m.kind==='video').length>3) throw Error('Máximo 10 fotos y 3 videos.');
  if(!media.length) throw Error('Agrega al menos una evidencia.');
  return member;
}
export function assertEditable(record) {
  if(record.status!=='draft') throw Error('El registro está sellado y no puede modificarse.');
}
export function finalFilename(campaignName,number,seq,extension) {
  if(!Number.isSafeInteger(number)||number<1||!Number.isSafeInteger(seq)||seq<1||seq>13) throw Error('Numeración inválida.');
  if(!/^(jpg|jpeg|png|mp4|webm)$/i.test(extension)) throw Error('Formato inválido.');
  const safe=campaignName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_');
  return `${safe} - ${number} - ${seq}.${extension.toLowerCase()}`;
}
