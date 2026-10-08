export const TYPE_NAMES = {lona:'Lona', espectacular:'Espectacular', barda:'Barda'};
export const ROLE_NAMES = {admin:'Administrador', leader:'Líder', coordinator:'Coordinador', collaborator:'Colaborador'};
export const CAPTURE_ROLES = ['leader','coordinator','collaborator'];
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
  if(['transferred','deleted'].includes(target.status)) return false;
  if(actor.role==='admin') return true;
  if(target.role!==CHILD_ROLE[actor.role]) return false;
  const parent=data.memberships.find(m=>m.id===target.parentId);
  return Boolean(parent && parent.userId===actor.id && parent.status==='active' && parent.campaignId===target.campaignId);
}
export function visibleRecords(data,actor) {
  const scope=new Set(scopedMemberships(data,actor).map(m=>m.id));
  return data.records.filter(r=>scope.has(r.membershipId)||CAPTURE_ROLES.includes(actor.role)&&data.memberships.some(m=>m.id===r.membershipId&&m.userId===actor.id));
}
export function teamSummary(data,memberId) {
  const scope=descendants(data,memberId),members=data.memberships.filter(m=>scope.has(m.id));
  const records=data.records.filter(r=>scope.has(r.membershipId)),media=records.flatMap(r=>r.media);
  return {people:new Set(members.filter(m=>m.status==='active').map(m=>m.userId)).size,records:records.length,photos:media.filter(m=>m.kind==='photo').length,videos:media.filter(m=>m.kind==='video').length,own:records.filter(r=>r.membershipId===memberId).length};
}
export function manualAssignment(data,actor,input) {
  if(actor.role==='collaborator')throw Error('Tu rol no permite dar de alta usuarios.');
  const role=actor.role==='admin'?input.role:CHILD_ROLE[actor.role];
  if(!['leader','coordinator','collaborator'].includes(role)||role==='leader'&&actor.role!=='admin')throw Error('Rol inválido.');
  if(role==='leader')return {role,campaignId:null,parentId:null};
  const parent=actor.role==='admin'?data.memberships.find(m=>m.id===input.parentId):data.memberships.find(m=>m.userId===actor.id&&m.campaignId===input.campaignId&&m.status==='active');
  if(!parent||parent.status!=='active'||parent.campaignId!==input.campaignId||parent.role!==(role==='coordinator'?'leader':'coordinator')||!data.campaigns.some(c=>c.id===parent.campaignId&&c.status==='active'))throw Error('Selecciona un superior activo en la campaña.');
  if(actor.role!=='admin'&&input.parentId&&input.parentId!==parent.id)throw Error('No puedes dar de alta usuarios en otra rama.');
  return {role,campaignId:parent.campaignId,parentId:parent.id};
}
export function transferTarget(data,actor,memberId,parentId) {
  if(actor.role!=='admin')throw Error('Solo el administrador puede trasladar personas entre equipos.');
  const source=data.memberships.find(m=>m.id===memberId),parent=data.memberships.find(m=>m.id===parentId);
  if(!source||!['coordinator','collaborator'].includes(source.role)||!['active','inactive'].includes(source.status))throw Error('Selecciona un coordinador o colaborador activo o inactivo.');
  const expected=source.role==='coordinator'?'leader':'coordinator';
  if(!parent||parent.role!==expected||parent.status!=='active'||parent.role==='coordinator'&&!data.memberships.some(m=>m.id===parent.parentId&&m.role==='leader'&&m.status==='active')||!data.campaigns.some(c=>c.id===parent.campaignId&&c.status==='active'))throw Error('Selecciona un '+ROLE_NAMES[expected].toLowerCase()+' activo de destino.');
  if(source.parentId===parent.id)throw Error('La persona ya pertenece a este equipo.');
  const scope=descendants(data,source.id),branch=data.memberships.filter(m=>scope.has(m.id)&&!['transferred','deleted'].includes(m.status));
  if(branch.some(m=>m.status==='invited'))throw Error('Resuelve las invitaciones pendientes del equipo antes de trasladarlo.');
  if(branch.some(m=>data.memberships.some(x=>!scope.has(x.id)&&x.userId===m.userId&&x.campaignId===parent.campaignId&&!['transferred','deleted'].includes(x.status))))throw Error('Una persona del equipo ya pertenece a la campaña de destino.');
  return {source,parent,branch};
}
export function captureCampaigns(data,actor){
  if(!CAPTURE_ROLES.includes(actor.role)||actor.active===false||actor.deleted)return [];
  return data.campaigns.filter(c=>c.status==='active'&&data.memberships.some(m=>{
    if(m.userId!==actor.id||m.role!==actor.role||m.campaignId!==c.id||m.status!=='active')return false;
    let ancestor=m;const seen=new Set();
    while(ancestor.parentId){if(seen.has(ancestor.id))return false;seen.add(ancestor.id);ancestor=data.memberships.find(p=>p.id===ancestor.parentId);if(!ancestor||ancestor.status!=='active'||ancestor.campaignId!==c.id)return false;}
    return ancestor.role==='leader';
  }));
}
export function dateInMexico(iso) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
  const get=t=>parts.find(p=>p.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function filterRecords(records,{campaign='',types=null,from='',to='',mediaKind=''}={}) {
  return records.filter(r=>(!campaign||r.campaignId===campaign)&&(types===null||types.includes(r.type))&&(!mediaKind||r.media?.some(m=>m.kind===mediaKind))&&(!from||dateInMexico(r.capturedAt)>=from)&&(!to||dateInMexico(r.capturedAt)<=to));
}
export function validateCampaign(actor,input,data) {
  if(actor.role!=='admin') throw Error('Solo el administrador puede crear campañas.');
  if(!input.name?.trim()||!input.location?.trim()) throw Error('Completa el nombre y la ubicación.');
  if(!data.users.some(u=>u.id===input.leaderId&&u.role==='leader'&&u.active!==false)) throw Error('Selecciona un líder activo.');
  if(!input.types?.length||new Set(input.types).size!==input.types.length||input.types.some(t=>!TYPE_NAMES[t])) throw Error('Selecciona uno o varios tipos válidos.');
  return {...input,name:input.name.trim(),location:input.location.trim()};
}
export function assertCapture(data,actor,campaignId,type,media) {
  const member=data.memberships.find(m=>m.userId===actor.id&&m.campaignId===campaignId&&m.role===actor.role&&m.status==='active');
  if(!member || !captureCampaigns(data,actor).some(c=>c.id===campaignId)) throw Error('La captura está disponible para líderes, coordinadores y colaboradores con una asignación activa en su propia campaña.');
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

export function assertDeletable(data,actor,m) {
  if(!m||m.status==='deleted'||m.status==='transferred'||!(m.global?actor.role==='admin':canManageMember(data,actor,m)))throw Error('No tienes permiso para eliminar este usuario.');
  if(m.role==='leader'&&!m.global)throw Error('La campaña debe conservar su líder. No puede eliminarse mientras esté asignado.');
  if(data.memberships.some(x=>x.parentId===m.id&&!['deleted','transferred'].includes(x.status)))throw Error('Mueve o elimina primero las personas a su cargo, incluidas las inactivas.');
  return m;
}
export function dailyEvidence(records,days=4) {
  const last=records.length?records.map(r=>dateInMexico(r.capturedAt)).sort().at(-1):dateInMexico(new Date().toISOString());
  return Array.from({length:days},(_,i)=>{const date=new Date(last+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i-days+1);const day=date.toISOString().slice(0,10),media=records.filter(r=>dateInMexico(r.capturedAt)===day).flatMap(r=>r.media);return {day,photos:media.filter(m=>m.kind==='photo').length,videos:media.filter(m=>m.kind==='video').length};});
}

export function googleMapsUrl(gps){
  if(!Number.isFinite(gps?.lat)||!Number.isFinite(gps?.lng)||Math.abs(gps.lat)>90||Math.abs(gps.lng)>180)return null;
  const url=new URL('https://www.google.com/maps/search/');url.searchParams.set('api','1');url.searchParams.set('query',`${gps.lat},${gps.lng}`);return url.toString();
}
