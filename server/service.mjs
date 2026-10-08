import {createHash,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {seedData,scopedMemberships,visibleCampaigns,canManageMember,visibleRecords,validateCampaign,manualAssignment,transferTarget,assertDeletable,CAPTURE_ROLES,TYPE_NAMES,finalFilename,captureCampaigns} from '../src/domain.mjs';
import {CHUNK_BYTES} from './files.mjs';
export class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(400,label+' inválido.');return value.trim();};
const uuid=value=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw new ApiError(400,'Identificador inválido.');return value.toLowerCase();};
export function contact(value){
  value=text(value,150,'Contacto');
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return value.toLowerCase();
  const phone=value.replace(/[ ()-]/g,'');
  if(/^\+[1-9][0-9]{7,14}$/.test(phone))return phone;
  throw new ApiError(400,'Ingresa un correo o celular con código de país.');
}
const equal=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
const at=value=>{if(typeof value!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new ApiError(400,'La fecha debe incluir zona horaria.');return new Date(value).toISOString();};
const coordinate=gps=>{
  if(gps===null)return null;
  if(!gps||!Number.isFinite(gps.lat)||!Number.isFinite(gps.lng)||Math.abs(gps.lat)>90||Math.abs(gps.lng)>180||!Number.isFinite(gps.accuracy)||gps.accuracy<0)throw new ApiError(400,'Lectura GPS inválida.');
  return {lat:gps.lat,lng:gps.lng,accuracy:gps.accuracy,capturedAt:at(gps.capturedAt)};
};
export class Service {
  constructor(store,vault,{development=false,deliverCode,now=()=>Date.now()}={}){
    this.store=store;this.vault=vault;this.development=development;this.deliverCode=deliverCode;this.now=now;
    if(!development&&!deliverCode)throw Error('Configure an email/SMS verification delivery adapter before enabling non-development access.');
  }
  seed(){
    if(this.store.get('SELECT id FROM users LIMIT 1'))return;
    const demo=seedData();
    this.store.transaction(()=>{
      for(const u of demo.users)this.store.run('INSERT INTO users(id,name,contact,role) VALUES(?,?,?,?)',u.id,u.name,u.contact,u.role);
      for(const c of demo.campaigns)this.store.run('INSERT INTO campaigns(id,name,location,leader_id,types) VALUES(?,?,?,?,?)',c.id,c.name,c.location,c.leaderId,JSON.stringify(c.types));
      for(const m of demo.memberships)this.store.run('INSERT INTO memberships(id,campaign_id,user_id,role,parent_id,status) VALUES(?,?,?,?,?,?)',m.id,m.campaignId,m.userId,m.role,m.parentId,m.status);
    });
  }
  audit(actor,action,target,campaignId=null){this.store.run('INSERT INTO audit(actor_id,campaign_id,action,target,at) VALUES(?,?,?,?,?)',actor.id,campaignId,action,target,new Date(this.now()).toISOString());}
  async requestCode(raw){
    const value=contact(raw),existing=this.store.get('SELECT * FROM otp WHERE contact=?',value);
    if(existing&&this.now()-existing.requested_at<30000)throw new ApiError(429,'Espera 30 segundos antes de pedir otro código.');
    const code=String(randomInt(0,1000000)).padStart(6,'0'),salt=token();
    this.store.run('INSERT INTO otp(contact,hash,salt,expires_at,attempts,requested_at) VALUES(?,?,?,?,0,?) ON CONFLICT(contact) DO UPDATE SET hash=excluded.hash,salt=excluded.salt,expires_at=excluded.expires_at,attempts=0,requested_at=excluded.requested_at',value,hash(salt+code),salt,this.now()+300000,this.now());
    const eligible=this.store.get('SELECT id FROM users WHERE contact=? AND active=1',value);
    if(eligible&&this.deliverCode){try{await this.deliverCode({contact:value,code});}catch{this.store.run('DELETE FROM otp WHERE contact=?',value);throw new ApiError(503,'No se pudo entregar el código. Intenta nuevamente.');}}
    return {message:'Si tienes acceso, recibirás un código de verificación.',...(this.development&&eligible?{developmentCode:code}:{}),expiresIn:300};
  }
  verify(raw,code){
    const value=contact(raw),otp=this.store.get('SELECT * FROM otp WHERE contact=?',value);
    if(!otp||otp.expires_at<=this.now()||otp.attempts>=5||typeof code!=='string'||!/^\d{6}$/.test(code))throw new ApiError(401,'Código inválido o vencido.');
    this.store.run('UPDATE otp SET attempts=attempts+1 WHERE contact=?',value);
    if(!equal(hash(otp.salt+code),otp.hash))throw new ApiError(401,'Código inválido o vencido.');
    const u=this.store.get('SELECT * FROM users WHERE contact=? AND active=1',value);
    if(!u)throw new ApiError(401,'Código inválido o vencido.');
    const sessionToken=token(),csrf=token(),expires=this.now()+8*60*60*1000;
    this.store.transaction(()=>{this.store.run('DELETE FROM otp WHERE contact=?',value);this.store.run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',hash(sessionToken),u.id,csrf,expires);});
    return {sessionToken,csrf,expiresAt:expires,user:{id:u.id,name:u.name,role:u.role,contact:u.contact}};
  }
  session(sessionToken){
    if(typeof sessionToken!=='string'||sessionToken.length>100)throw new ApiError(401,'Inicia sesión.');
    const s=this.store.get('SELECT s.*,u.name,u.contact,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',hash(sessionToken));
    if(!s||s.expires_at<=this.now()||!s.active)throw new ApiError(401,'La sesión venció. Inicia sesión.');
    return {user:{id:s.user_id,name:s.name,role:s.role,contact:s.contact},csrf:s.csrf,expiresAt:s.expires_at};
  }
  logout(sessionToken){this.store.run('DELETE FROM sessions WHERE token_hash=?',hash(sessionToken));}
  data(){return this.store.snapshot();}
  bootstrap(actor){
    const d=this.data(),members=scopedMemberships(d,actor),memberIds=new Set(members.map(m=>m.id));
    const campaigns=visibleCampaigns(d,actor),users=new Set(members.map(m=>m.userId));users.add(actor.id);
    const captureIds=new Set(captureCampaigns(d,actor).map(c=>c.id));
    const captureAssignments=d.memberships.filter(m=>m.userId===actor.id&&m.role===actor.role&&m.status==='active'&&captureIds.has(m.campaignId)).map(m=>({membershipId:m.id,campaignId:m.campaignId}));
    const result={captureAssignments,users:actor.role==='admin'?d.users:d.users.filter(u=>users.has(u.id)),campaigns,memberships:members,records:visibleRecords(d,actor).filter(r=>r.status==='synced'),invitations:d.invitations.filter(i=>actor.role==='admin'||i.createdBy===actor.id||memberIds.has(i.membershipId)),audit:d.audit.filter(a=>actor.role==='admin'||a.actorId===actor.id),drafts:{}};
    return result;
  }
  member(actor,id,manage=false){
    const d=this.data(),m=scopedMemberships(d,actor).find(m=>m.id===id);
    if(!m||manage&&!canManageMember(d,actor,m))throw new ApiError(404,'Usuario no disponible.');
    return m;
  }
  createCampaign(actor,input){
    let valid;try{valid=validateCampaign(actor,input,this.data());}catch(error){throw new ApiError(actor.role==='admin'?400:403,error.message);}
    if(!this.store.get("SELECT id FROM users WHERE id=? AND active=1 AND role='leader'",valid.leaderId))throw new ApiError(400,'Selecciona un líder activo.');
    const invitation=this.store.get("SELECT status FROM invitations WHERE user_id=? AND role='leader' AND membership_id IS NULL ORDER BY rowid DESC LIMIT 1",valid.leaderId);
    if(invitation&&invitation.status!=='accepted')throw new ApiError(409,'El líder debe aceptar su invitación antes de asignarlo a una campaña.');
    if(valid.name.length>100||valid.location.length>150)throw new ApiError(400,'Nombre o ubicación demasiado largos.');
    const id=randomUUID();
    this.store.transaction(()=>{this.store.run('INSERT INTO campaigns(id,name,location,leader_id,types) VALUES(?,?,?,?,?)',id,valid.name,valid.location,valid.leaderId,JSON.stringify(valid.types));
      this.store.run("INSERT INTO memberships(id,campaign_id,user_id,role,parent_id,status) VALUES(?,?,?,'leader',NULL,'active')",randomUUID(),id,valid.leaderId);this.audit(actor,'Creó campaña',id,id);});
    return {id,...valid};
  }
  updateMember(actor,id,input){
    const m=this.member(actor,id,true),name=text(input.name,80,'Nombre'),status=input.status;
    if(!['active','inactive'].includes(status)||m.status==='invited')throw new ApiError(400,'La invitación requiere aceptación; elige un estado válido.');
    if(m.role==='leader'&&status!=='active')throw new ApiError(409,'La campaña debe conservar su líder activo.');
    if(status==='active'&&m.parentId&&!this.store.get("SELECT id FROM memberships WHERE id=? AND status='active'",m.parentId))throw new ApiError(409,'Reactiva primero al superior directo.');
    if(status==='inactive'&&this.store.get("SELECT id FROM memberships WHERE parent_id=? AND status='active'",m.id))throw new ApiError(409,'Resuelve primero el equipo activo de este usuario.');
    this.store.transaction(()=>{this.store.run('UPDATE memberships SET status=?,display_name=? WHERE id=?',status,name,id);
      if(actor.role==='admin')this.store.run('UPDATE users SET name=? WHERE id=?',name,m.userId);this.audit(actor,'Actualizó pertenencia',id,m.campaignId);});
    return this.member(actor,id);
  }
  deleteMember(actor,id){
    const m=this.member(actor,id,true);
    try{assertDeletable(this.data(),actor,m);}catch(error){throw new ApiError(409,error.message);}
    this.store.transaction(()=>{this.store.run("UPDATE memberships SET status='deleted' WHERE id=?",id);this.store.run("UPDATE invitations SET status='revoked' WHERE membership_id=? AND status='pending'",id);this.audit(actor,'Eliminó usuario; conserva evidencias',id,m.campaignId);});
    return {id,status:'deleted'};
  }
  deleteGlobalUser(actor,id){
    if(actor.role!=='admin')throw new ApiError(403,'Solo el administrador puede eliminar cuentas sin campaña.');
    const u=this.store.get("SELECT * FROM users WHERE id=? AND role='leader' AND deleted=0",id);
    if(!u||this.store.get('SELECT id FROM memberships WHERE user_id=?',id))throw new ApiError(409,'La cuenta tiene campañas asignadas o no está disponible.');
    this.store.transaction(()=>{this.store.run('UPDATE users SET active=0,deleted=1 WHERE id=?',id);this.store.run('DELETE FROM sessions WHERE user_id=?',id);this.store.run("UPDATE invitations SET status='revoked' WHERE user_id=? AND status='pending'",id);this.audit(actor,'Eliminó cuenta sin campaña',id);});
    return {id,status:'deleted'};
  }
  createUser(actor,input){
    const name=text(input.name,80,'Nombre'),value=contact(input.contact);
    let assignment;try{assignment=manualAssignment(this.data(),actor,input);}catch(error){throw new ApiError(403,error.message);}
    const existing=this.store.get('SELECT * FROM users WHERE contact=?',value);
    if(existing)throw new ApiError(409,'El contacto ya está registrado. Usa su ficha para modificarlo o moverlo.');
    const userId=randomUUID(),memberId=assignment.campaignId?randomUUID():null;
    this.store.transaction(()=>{
      this.store.run('INSERT INTO users(id,name,contact,role) VALUES(?,?,?,?)',userId,name,value,assignment.role);
      if(memberId)this.store.run("INSERT INTO memberships(id,campaign_id,user_id,role,parent_id,status,display_name) VALUES(?,?,?,?,?,'active',?)",memberId,assignment.campaignId,userId,assignment.role,assignment.parentId,name);
      this.audit(actor,'Alta manual de usuario',memberId||userId,assignment.campaignId);
    });
    return {userId,membershipId:memberId,...assignment};
  }
  updateGlobalUser(actor,id,input){
    if(actor.role!=='admin')throw new ApiError(403,'Solo el administrador puede modificar cuentas sin campaña.');
    const u=this.store.get("SELECT * FROM users WHERE id=? AND role='leader' AND deleted=0",id);
    if(!u||this.store.get('SELECT id FROM memberships WHERE user_id=?',id))throw new ApiError(404,'Cuenta sin campaña no disponible.');
    if(this.store.get("SELECT id FROM invitations WHERE user_id=? AND status='pending'",id))throw new ApiError(409,'Resuelve primero la invitación pendiente.');
    const name=text(input.name,80,'Nombre');if(!['active','inactive'].includes(input.status))throw new ApiError(400,'Estado inválido.');
    this.store.transaction(()=>{this.store.run('UPDATE users SET name=?,active=? WHERE id=?',name,input.status==='active'?1:0,id);this.store.run('DELETE FROM sessions WHERE user_id=?',id);this.audit(actor,'Actualizó cuenta sin campaña',id);});
    return {id,name,status:input.status};
  }
  transferMember(actor,id,input){
    let valid;try{valid=transferTarget(this.data(),actor,id,input.parentId);}catch(error){throw new ApiError(actor.role==='admin'?409:403,error.message);}
    const {source,parent,branch}=valid,mapping=new Map(branch.map(m=>[m.id,randomUUID()])),newId=mapping.get(source.id);
    this.store.transaction(()=>{
      for(const m of branch)this.store.run("UPDATE memberships SET status='transferred' WHERE id=?",m.id);
      // Insert the coordinator before its collaborators to preserve parent constraints.
      for(const m of [source,...branch.filter(m=>m.id!==source.id)]){
        const id=mapping.get(m.id),parentId=m.id===source.id?parent.id:mapping.get(m.parentId);
        this.store.run('INSERT INTO memberships(id,campaign_id,user_id,role,parent_id,status,display_name) VALUES(?,?,?,?,?,?,?)',id,parent.campaignId,m.userId,m.role,parentId,m.status,m.displayName);
        this.audit(actor,'Trasladó '+m.id+' a '+id,id,parent.campaignId);
      }
    });
    return {membershipId:newId,previousMembershipId:source.id,campaignId:parent.campaignId,parentId:parent.id,moved:branch.length};
  }
  invite(actor,input,origin){
    if(actor.role==='collaborator')throw new ApiError(403,'Tu rol no permite invitar usuarios.');
    const name=text(input.name,80,'Nombre'),value=contact(input.contact);
    const role=actor.role==='admin'?input.role:actor.role==='leader'?'coordinator':'collaborator';
    if(!['leader','coordinator','collaborator'].includes(role)||role==='leader'&&actor.role!=='admin')throw new ApiError(403,'Rol inválido.');
    let parent=null,campaignId=null;
    if(role!=='leader'){
      campaignId=input.campaignId;
      if(actor.role==='admin')parent=this.data().memberships.find(m=>m.id===input.parentId);
      else parent=this.data().memberships.find(m=>m.userId===actor.id&&m.campaignId===campaignId&&m.status==='active');
      const expected=role==='coordinator'?'leader':'coordinator';
      if(!parent||parent.campaignId!==campaignId||parent.role!==expected||parent.status!=='active')throw new ApiError(404,'Superior no disponible.');
      if(actor.role!=='admin'&&input.parentId&&input.parentId!==parent.id)throw new ApiError(403,'No puedes invitar a otra rama.');
    }
    const existing=this.store.get('SELECT * FROM users WHERE contact=?',value),userId=existing?.id||randomUUID(),memberId=role==='leader'?null:randomUUID(),id=randomUUID(),inviteToken=token();
    if(existing&&(existing.role!==role||!existing.active))throw new ApiError(409,'Este contacto ya tiene otro rol o está desactivado.');
    if(memberId&&this.store.get("SELECT id FROM memberships WHERE campaign_id=? AND user_id=? AND status NOT IN ('transferred','deleted')",campaignId,userId))throw new ApiError(409,'El usuario ya pertenece a esta campaña.');
    if(this.store.get("SELECT id FROM invitations WHERE user_id=? AND role=? AND status='pending'",userId,role))throw new ApiError(409,'Ya existe una invitación pendiente para este usuario.');
    this.store.transaction(()=>{
      if(!existing)this.store.run('INSERT INTO users(id,name,contact,role) VALUES(?,?,?,?)',userId,name,value,role);
      if(memberId)this.store.run("INSERT INTO memberships(id,campaign_id,user_id,role,parent_id,status,display_name) VALUES(?,?,?,?,?,'invited',?)",memberId,campaignId,userId,role,parent.id,name);
      this.store.run('INSERT INTO invitations(id,token_hash,membership_id,user_id,contact,role,created_by,expires_at) VALUES(?,?,?,?,?,?,?,?)',id,hash(inviteToken),memberId,userId,value,role,actor.id,this.now()+7*86400000);
      this.audit(actor,'Generó invitación',id,campaignId);
    });
    return {id,token:inviteToken,link:origin+'/?server=1&invite='+encodeURIComponent(inviteToken),membershipId:memberId,userId,role,expiresAt:this.now()+7*86400000,status:'pending'};
  }
  acceptInvite(actor,inviteToken){
    const i=this.store.get('SELECT * FROM invitations WHERE token_hash=?',hash(String(inviteToken)));
    if(!i||i.status!=='pending'||i.expires_at<=this.now()||i.user_id!==actor.id||i.contact!==actor.contact)throw new ApiError(404,'Invitación inválida, vencida o de otro contacto.');
    if(i.membership_id){const m=this.data().memberships.find(m=>m.id===i.membership_id),p=this.data().memberships.find(parent=>parent.id===m?.parentId);
      if(!p||p.status!=='active')throw new ApiError(409,'El superior de esta invitación ya no está activo.');}
    this.store.transaction(()=>{this.store.run("UPDATE invitations SET status='accepted' WHERE id=?",i.id);
      if(i.membership_id)this.store.run("UPDATE memberships SET status='active' WHERE id=?",i.membership_id);
      this.audit(actor,'Aceptó invitación',i.id);});
    return {accepted:true};
  }
  revokeInvite(actor,id){
    const i=this.store.get('SELECT * FROM invitations WHERE id=?',id);
    if(!i||i.status!=='pending')throw new ApiError(404,'Invitación no disponible.');
    if(i.membership_id)this.member(actor,i.membership_id,true);
    else if(actor.role!=='admin')throw new ApiError(404,'Invitación no disponible.');
    this.store.transaction(()=>{this.store.run("UPDATE invitations SET status='revoked' WHERE id=?",id);
      if(i.membership_id)this.store.run("UPDATE memberships SET status='inactive' WHERE id=?",i.membership_id);
      this.audit(actor,'Canceló invitación',id);});
    return {revoked:true};
  }
  renewInvite(actor,id,origin){
    const i=this.store.get('SELECT * FROM invitations WHERE id=?',id);
    if(!i||i.status!=='pending')throw new ApiError(404,'Invitación no disponible.');
    if(i.membership_id)this.member(actor,i.membership_id,true);else if(actor.role!=='admin')throw new ApiError(404,'Invitación no disponible.');
    const value=token(),expiresAt=this.now()+7*86400000;
    this.store.transaction(()=>{this.store.run('UPDATE invitations SET token_hash=?,expires_at=? WHERE id=?',hash(value),expiresAt,id);this.audit(actor,'Renovó invitación',id);});
    return {id,link:origin+'/?server=1&invite='+encodeURIComponent(value),expiresAt};
  }
  createRecord(actor,input){
    const id=uuid(input.id),d=this.data(),member=d.memberships.find(m=>m.id===input.membershipId);
    const sealed=this.store.get('SELECT * FROM records WHERE id=?',id);
    if(!CAPTURE_ROLES.includes(actor.role)||!member||member.role!==actor.role||member.userId!==actor.id||!sealed&&member.status!=='active')throw new ApiError(403,'Solo un líder, coordinador o colaborador activo puede registrar sus propias evidencias.');
    if(!sealed){let ancestor=member;while(ancestor.parentId){ancestor=d.memberships.find(m=>m.id===ancestor.parentId);if(!ancestor||ancestor.status!=='active')throw new ApiError(403,'La rama no está activa.');}}
    const c=d.campaigns.find(c=>c.id===member.campaignId);
    if(!c||c.status!=='active'||!TYPE_NAMES[input.type]||!c.types.includes(input.type))throw new ApiError(400,'Tipo no permitido por la campaña.');
    if(!Array.isArray(input.media)||!input.media.length||input.media.length>13)throw new ApiError(400,'Agrega entre 1 y 13 evidencias.');
    const counts={photo:0,video:0},media=input.media.map((m,i)=>{
      const mid=uuid(m.id);if(!['photo','video'].includes(m.kind))throw new ApiError(400,'Tipo de archivo inválido.');
      counts[m.kind]++;const mimes=m.kind==='photo'?['image/jpeg','image/png']:['video/mp4','video/webm'];
      if(!mimes.includes(m.mime)||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>(m.kind==='photo'?12:50)*1024*1024||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256))throw new ApiError(400,'Formato, tamaño o hash inválido.');
      const capturedAt=at(m.capturedAt),suffix=m.capturedAt.endsWith('Z')?'+00:00':m.capturedAt.slice(-6);
      const offsetMinutes=(Number(suffix.slice(1,3))*60+Number(suffix.slice(4,6)))*(suffix[0]==='-'?-1:1);
      return {id:mid,kind:m.kind,mime:m.mime,bytes:m.bytes,sha256:m.sha256,seq:i+1,capturedAt,offsetMinutes,gps:coordinate(m.gps)};
    });
    if(counts.photo>10||counts.video>3||new Set(media.map(m=>m.id)).size!==media.length)throw new ApiError(400,'Máximo 10 fotos y 3 videos con identificadores únicos.');
    if(typeof input.notes!=='string'||input.notes.length>1000)throw new ApiError(400,'Notas inválidas.');
    const dev=input.device;if(!dev||typeof dev.installationId!=='string'||dev.installationId.length>100)throw new ApiError(400,'Falta el identificador de instalación.');
    const device={installationId:text(dev.installationId,100,'Dispositivo'),name:String(dev.name||'').slice(0,100),brand:String(dev.brand||'').slice(0,100),model:String(dev.model||'').slice(0,100)};
    const record={id,campaignId:c.id,campaignName:c.name,membershipId:member.id,author:{id:actor.id,name:member.displayName||actor.name},type:input.type,notes:input.notes,device,media,capturedAt:media[0].capturedAt,lat:media[0].gps?.lat??null,lng:media[0].gps?.lng??null,accuracy:media[0].gps?.accuracy??null};
    const old=this.store.get('SELECT * FROM records WHERE id=?',id);
    if(old){
      const previous=JSON.parse(old.manifest);
      if(previous.membershipId!==member.id)throw new ApiError(404,'Registro no disponible.');
      const comparable={...record,campaignName:previous.campaignName,author:previous.author};
      if(old.manifest!==JSON.stringify(comparable))throw new ApiError(409,'El registro ya está sellado con otro contenido.');
      return this.recordStatus(actor,id);
    }
    this.store.transaction(()=>{this.store.run('INSERT INTO records(id,campaign_id,membership_id,manifest,created_at) VALUES(?,?,?,?,?)',id,c.id,member.id,JSON.stringify(record),new Date(this.now()).toISOString());this.audit(actor,'Selló manifiesto',id,c.id);});
    return this.recordStatus(actor,id);
  }
  record(actor,id,write=false){
    const r=this.store.get('SELECT * FROM records WHERE id=?',id);
    if(!r)throw new ApiError(404,'Registro no disponible.');
    const manifest=JSON.parse(r.manifest),scope=scopedMemberships(this.data(),actor);
    const author=CAPTURE_ROLES.includes(actor.role)&&manifest.author.id===actor.id;
    if(!scope.some(m=>m.id===r.membership_id)&&!author||write&&!author)throw new ApiError(404,'Registro no disponible.');
    if(write&&r.status==='synced')throw new ApiError(409,'El registro ya fue confirmado y es inmutable.');
    return {...r,manifest};
  }
  recordStatus(actor,id){
    const r=this.record(actor,id);
    return {id,status:r.status,number:r.number,chunkBytes:CHUNK_BYTES,media:r.manifest.media.map(m=>({id:m.id,received:this.store.all('SELECT chunk_index FROM chunks WHERE record_id=? AND media_id=? ORDER BY chunk_index',id,m.id).map(c=>c.chunk_index),expected:Math.ceil(m.bytes/CHUNK_BYTES)}))};
  }
  uploadChunk(actor,id,mediaId,index,bytes){
    const r=this.record(actor,id,true),m=r.manifest.media.find(m=>m.id===mediaId);
    if(!m||!Number.isSafeInteger(index)||index<0||index>=Math.ceil(m.bytes/CHUNK_BYTES))throw new ApiError(400,'Fragmento inválido.');
    const expected=Math.min(CHUNK_BYTES,m.bytes-index*CHUNK_BYTES);
    if(bytes.length!==expected)throw new ApiError(400,'Tamaño de fragmento incorrecto.');
    const h=hash(bytes),old=this.store.get('SELECT * FROM chunks WHERE record_id=? AND media_id=? AND chunk_index=?',id,mediaId,index);
    if(old){if(old.hash!==h)throw new ApiError(409,'El fragmento ya existe con otro contenido.');return {stored:true,duplicate:true};}
    this.vault.write(id,mediaId,index,bytes);
    this.store.run('INSERT INTO chunks(record_id,media_id,chunk_index,hash,size) VALUES(?,?,?,?,?)',id,mediaId,index,h,bytes.length);
    return {stored:true,duplicate:false};
  }
  finalize(actor,id){
    const existing=this.record(actor,id);
    if(existing.status==='synced')return this.recordStatus(actor,id);
    const r=this.record(actor,id,true);
    for(const m of r.manifest.media){
      const total=Math.ceil(m.bytes/CHUNK_BYTES),chunks=this.store.all('SELECT * FROM chunks WHERE record_id=? AND media_id=? ORDER BY chunk_index',id,m.id);
      if(chunks.length!==total)throw new ApiError(409,'Faltan fragmentos; conserva la copia local.');
      const checksum=createHash('sha256');let size=0,signature;
      for(const chunk of chunks){const bytes=this.vault.read(id,m.id,chunk.chunk_index);if(hash(bytes)!==chunk.hash)throw new ApiError(409,'Fragmento alterado.');if(!signature)signature=bytes.subarray(0,16);checksum.update(bytes);size+=bytes.length;}
      if(size!==m.bytes||checksum.digest('hex')!==m.sha256)throw new ApiError(409,'La evidencia no coincide con su hash original.');
      const valid=m.mime==='image/jpeg'?signature[0]===255&&signature[1]===216&&signature[2]===255:m.mime==='image/png'?signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m.mime==='video/webm'?signature.subarray(0,4).equals(Buffer.from([26,69,223,163])):signature.subarray(4,8).toString()==='ftyp';
      if(!valid)throw new ApiError(400,'El contenido no coincide con el formato declarado.');
    }
    this.store.transaction(()=>{const number=this.store.get('SELECT COALESCE(MAX(number),0)+1 AS n FROM records WHERE campaign_id=?',r.campaign_id).n;
      this.store.run("UPDATE records SET status='synced',number=?,received_at=? WHERE id=?",number,new Date(this.now()).toISOString(),id);this.audit(actor,'Confirmó evidencia íntegra',id,r.campaign_id);});
    return this.recordStatus(actor,id);
  }
  media(actor,id,mediaId){
    const r=this.record(actor,id),m=r.manifest.media.find(m=>m.id===mediaId);
    if(r.status!=='synced'||!m)throw new ApiError(404,'Archivo no disponible.');
    const chunks=this.store.all('SELECT chunk_index FROM chunks WHERE record_id=? AND media_id=? ORDER BY chunk_index',id,mediaId);
    const bytes=Buffer.concat(chunks.map(c=>this.vault.read(id,mediaId,c.chunk_index)));
    return {bytes,mime:m.mime,filename:finalFilename(r.manifest.campaignName,r.number,m.seq,m.mime==='image/jpeg'?'jpg':m.mime==='image/png'?'png':m.mime==='video/mp4'?'mp4':'webm')};
  }
}
