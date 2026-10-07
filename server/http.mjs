import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ApiError} from './service.mjs';
import {CHUNK_BYTES} from './files.mjs';
const htmlPath=fileURLToPath(new URL('../index.html',import.meta.url));
function send(response,status,value,headers={}){
  const body=JSON.stringify(value);response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});response.end(body);
}
async function body(request,limit,json=true){
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>limit)throw new ApiError(413,'La solicitud excede el tamaño permitido.');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  if(!json)return bytes;
  if(!String(request.headers['content-type']||'').startsWith('application/json'))throw new ApiError(415,'Usa application/json.');
  try{const parsed=JSON.parse(bytes.toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed;}catch{throw new ApiError(400,'JSON inválido.');}
}
export function createHttpServer(service,{origin='http://127.0.0.1:4173'}={}){
  const parsedOrigin=new URL(origin);
  if(service.development&&!['127.0.0.1','localhost','[::1]'].includes(parsedOrigin.hostname))throw Error('Development access is restricted to loopback.');
  if(!service.development&&parsedOrigin.protocol!=='https:')throw Error('HTTPS origin is required outside development.');
  const rate=new Map();
  const server=createServer(async(request,response)=>{
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Permissions-Policy','camera=(self), microphone=(self), geolocation=(self)');
    try{
      const url=new URL(request.url,origin),path=url.pathname,method=request.method;
      if(request.headers.host!==parsedOrigin.host)throw new ApiError(403,'Host no permitido.');
      if(!['GET','HEAD'].includes(method)&&request.headers.origin&&request.headers.origin!==origin)throw new ApiError(403,'Origen no permitido.');
      if(path==='/'&&method==='GET'){
        if(!url.searchParams.has('server')){response.writeHead(302,{Location:'/?server=1'});response.end();return;}
        const bytes=readFileSync(htmlPath);
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});response.end(bytes);return;
      }
      if(path==='/api/status'&&method==='GET'){send(response,200,{development:service.development,mode:'server',captureReady:false,cloud:false});return;}
      if(path==='/api/auth/request'&&method==='POST'){
        const ip=request.socket.remoteAddress,key=ip,now=Date.now(),entry=rate.get(key)||{count:0,until:now+600000};
        if(now>entry.until){entry.count=0;entry.until=now+600000;}entry.count++;rate.set(key,entry);
        if(entry.count>30)throw new ApiError(429,'Demasiados intentos; intenta más tarde.');
        for(const [k,v]of rate)if(v.until<now)rate.delete(k);
        const input=await body(request,1024);send(response,200,await service.requestCode(input.contact));return;
      }
      if(path==='/api/auth/verify'&&method==='POST'){
        const input=await body(request,1024),result=service.verify(input.contact,input.code);
        send(response,200,{user:result.user,csrf:result.csrf,expiresAt:result.expiresAt},{'Set-Cookie':`cp_session=${result.sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${service.development?'':'; Secure'}`});return;
      }
      const cookie=String(request.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cp_session='));
      const sessionToken=cookie?.slice('cp_session='.length),session=service.session(sessionToken),actor=session.user;
      if(!['GET','HEAD'].includes(method)&&request.headers['x-csrf-token']!==session.csrf)throw new ApiError(403,'Verificación CSRF requerida.');
      if(path==='/api/session'&&method==='GET'){send(response,200,{...session,development:service.development});return;}
      if(path==='/api/auth/logout'&&method==='POST'){service.logout(sessionToken);send(response,200,{loggedOut:true},{'Set-Cookie':'cp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return;}
      if(path==='/api/bootstrap'&&method==='GET'){send(response,200,service.bootstrap(actor));return;}
      if(path==='/api/campaigns'&&method==='POST'){send(response,201,service.createCampaign(actor,await body(request,4096)));return;}
      if(path==='/api/users'&&method==='POST'){send(response,201,service.createUser(actor,await body(request,4096)));return;}
      let match;
      if((match=path.match(/^\/api\/users\/([^/]+)$/))&&method==='PATCH'){send(response,200,service.updateGlobalUser(actor,match[1],await body(request,4096)));return;}
      if((match=path.match(/^\/api\/memberships\/([^/]+)\/transfer$/))&&method==='POST'){send(response,200,service.transferMember(actor,match[1],await body(request,4096)));return;}
      if((match=path.match(/^\/api\/memberships\/([^/]+)$/))&&method==='PATCH'){send(response,200,service.updateMember(actor,match[1],await body(request,4096)));return;}
      if(path==='/api/invitations'&&method==='POST'){send(response,201,service.invite(actor,await body(request,4096),origin));return;}
      if(path==='/api/invitations/accept'&&method==='POST'){const input=await body(request,1024);send(response,200,service.acceptInvite(actor,input.token));return;}
      if((match=path.match(/^\/api\/invitations\/([^/]+)\/renew$/))&&method==='POST'){send(response,200,service.renewInvite(actor,match[1],origin));return;}
      if((match=path.match(/^\/api\/invitations\/([^/]+)$/))&&method==='DELETE'){send(response,200,service.revokeInvite(actor,match[1]));return;}
      if(path==='/api/records'&&method==='POST'){send(response,201,service.createRecord(actor,await body(request,32768)));return;}
      if((match=path.match(/^\/api\/records\/([^/]+)$/))&&method==='GET'){send(response,200,service.recordStatus(actor,match[1]));return;}
      if((match=path.match(/^\/api\/records\/([^/]+)\/media\/([^/]+)\/chunks\/(\d+)$/))&&method==='PUT'){
        send(response,200,service.uploadChunk(actor,match[1],match[2],Number(match[3]),await body(request,CHUNK_BYTES,false)));return;
      }
      if((match=path.match(/^\/api\/records\/([^/]+)\/finalize$/))&&method==='POST'){send(response,200,service.finalize(actor,match[1]));return;}
      if((match=path.match(/^\/api\/records\/([^/]+)\/media\/([^/]+)$/))&&method==='GET'){
        const result=service.media(actor,match[1],match[2]);
        response.writeHead(200,{'Content-Type':result.mime,'Content-Length':result.bytes.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':"inline; filename*=UTF-8''"+encodeURIComponent(result.filename)});response.end(result.bytes);return;
      }
      throw new ApiError(404,'Recurso no disponible.');
    }catch(error){
      if(response.headersSent){response.destroy();return;}
      const status=error instanceof ApiError?error.status:500;
      if(status===500)console.error('Request failed:',error.code||error.name);
      send(response,status,{error:status===500?'No se pudo completar la operación. Conserva la copia local e intenta de nuevo.':error.message});
    }
  });
  server.once('listening',()=>{if(service.development&&parsedOrigin.port==='0'){parsedOrigin.port=String(server.address().port);origin=parsedOrigin.origin;}});
  return server;
}
