import {assertCapture} from '../src/domain.mjs';

class CloudError extends Error {constructor(status,message){super(message);this.status=status;}}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function database(env){if(!env.DB?.prepare)throw new CloudError(503,'La nube no está disponible. Conserva el registro local y vuelve a intentar.');return env.DB;}
function validatePayload(input){
  const r=input.record,c=input.context;
  if(!r||!c||r.source!=='demo'||typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(r.id)||!Array.isArray(r.media)||!Array.isArray(c.users)||!Array.isArray(c.memberships)||!Array.isArray(c.campaigns))throw new CloudError(400,'Registro de prueba inválido.');
  if(c.users.length>3||c.memberships.length>3||c.campaigns.length!==1||!r.author?.id||typeof r.author.name!=='string'||r.author.name.length>80||typeof r.notes!=='string'||r.notes.length>2000||!Number.isFinite(Date.parse(r.capturedAt)))throw new CloudError(400,'Datos incompletos o demasiado largos.');
  const author=c.users.find(u=>u.id===r.author.id),campaign=c.campaigns.find(x=>x.id===r.campaignId);
  try{const m=assertCapture(c,author||{},r.campaignId,r.type,r.media);if(m.id!==r.membershipId||campaign.name!==r.campaignName)throw Error('Asignación inválida.');}catch(error){throw new CloudError(400,error.message);}
  if(r.media.some((m,i)=>m.seq!==i+1||m.bytes||m.url||!Number.isFinite(Date.parse(m.capturedAt||r.capturedAt))))throw new CloudError(400,'Esta vista acepta únicamente metadatos de ejemplo, sin archivos reales.');
  if(!Number.isSafeInteger(input.baseline)||input.baseline<0||input.baseline>1e9)throw new CloudError(400,'Numeración inválida.');
  return {record:r,context:c};
}
function result(row){const payload=JSON.parse(row.payload);return {...payload,receipt:{id:row.id,number:row.number,receivedAt:row.received_at,kind:'demo-metadata'}};}
export function createCloudWorker(html){
  return {async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/'&&request.method==='GET')return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"}});
    if(!url.pathname.startsWith('/api/preview/'))return json({error:'Ruta no disponible.'},404);
    try{
      // Sites dispatch authenticates the private owner and supplies this trusted identity.
      // Demo roles inside the UI are examples, not production accounts.
      const owner=request.headers.get('oai-authenticated-user-id');
      if(!owner)throw new CloudError(401,'Inicia sesión en esta vista privada para guardar en la nube.');
      const db=database(env);
      if(url.pathname==='/api/preview/records'&&request.method==='GET'){
        const rows=await db.prepare('SELECT * FROM preview_records WHERE owner_id=? ORDER BY received_at').bind(owner).all();
        const deletions=await db.prepare('SELECT id,user_id AS userId,global_account AS global,name,deleted_at AS deletedAt FROM preview_deletions WHERE owner_id=?').bind(owner).all();
        return json({records:rows.results.map(result),deletions:deletions.results,kind:'demo-metadata'});
      }
      if(url.pathname==='/api/preview/deletions'&&request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))throw new CloudError(403,'Origen o formato no permitido.');
        const text=await request.text();if(text.length>1024)throw new CloudError(413,'Solicitud demasiado grande.');
        let p;try{p=JSON.parse(text);}catch{throw new CloudError(400,'JSON inválido.');}
        if(p.source!=='demo'||typeof p.id!=='string'||!/^[a-zA-Z0-9:-]{1,110}$/.test(p.id)||typeof p.userId!=='string'||p.userId.length>100||typeof p.name!=='string'||p.name.length>80||typeof p.global!=='boolean')throw new CloudError(400,'Baja de prueba inválida.');
        await db.prepare('INSERT INTO preview_deletions(owner_id,id,user_id,global_account,name,deleted_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,id) DO NOTHING').bind(owner,p.id,p.userId,p.global?1:0,p.name,new Date().toISOString()).run();
        return json({id:p.id,kind:'demo-deletion'},201);
      }
      if(url.pathname==='/api/preview/records'&&request.method==='POST'){
        if(request.headers.get('Origin')!==url.origin||!request.headers.get('Content-Type')?.startsWith('application/json'))throw new CloudError(403,'Origen o formato no permitido.');
        const text=await request.text();if(text.length>32768)throw new CloudError(413,'Registro demasiado grande.');
        let input;try{input=JSON.parse(text);}catch{throw new CloudError(400,'JSON inválido.');}
        const payload=validatePayload(input),serialized=canonical(payload),r=payload.record;
        await db.prepare(`INSERT INTO preview_records(owner_id,id,campaign_id,payload,number,received_at)
          SELECT ?,?,?,?,MAX(COALESCE(MAX(number),0),?)+1,? FROM preview_records WHERE owner_id=? AND campaign_id=?
          ON CONFLICT(owner_id,id) DO NOTHING`).bind(owner,r.id,r.campaignId,serialized,input.baseline,new Date().toISOString(),owner,r.campaignId).run();
        const row=await db.prepare('SELECT * FROM preview_records WHERE owner_id=? AND id=?').bind(owner,r.id).first();
        if(!row)throw new CloudError(503,'No se pudo confirmar el registro. Intenta nuevamente.');
        if(row.payload!==serialized)throw new CloudError(409,'Este registro ya está sellado con otro contenido. Se conserva el original.');
        return json(result(row),201);
      }
      return json({error:'Operación no disponible.'},405);
    }catch(error){if(!error.status)console.error('Preview record storage failed:',error.message);return json({error:error.status?error.message:'No se pudo guardar en la nube. Conserva el registro local y vuelve a intentar.'},error.status||503);}
  }};
}
