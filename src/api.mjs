export class ApiClient {
  constructor({fetcher=globalThis.fetch.bind(globalThis)}={}){this.fetcher=fetcher;this.csrf=null;}
  async request(path,{method='GET',body,raw=false}={}){
    const headers={};
    if(this.csrf)headers['X-CSRF-Token']=this.csrf;
    if(body!==undefined)headers['Content-Type']=raw?'application/octet-stream':'application/json';
    let response;
    try{response=await this.fetcher(path,{method,credentials:'same-origin',headers,body:body===undefined?undefined:raw?body:JSON.stringify(body)});}
    catch{throw Error('No hay conexión con el servidor. Conserva tus registros e intenta de nuevo.');}
    const result=await response.json();
    if(!response.ok){const error=Error(result.error||'No se pudo completar la operación.');error.status=response.status;throw error;}
    return result;
  }
  async session(){const result=await this.request('/api/session');this.csrf=result.csrf;return result;}
  requestCode(contact){return this.request('/api/auth/request',{method:'POST',body:{contact}});}
  async verify(contact,code){const result=await this.request('/api/auth/verify',{method:'POST',body:{contact,code}});this.csrf=result.csrf;return result;}
  bootstrap(){return this.request('/api/bootstrap');}
  async uploadRecord(manifest,blobs,onProgress=()=>{}){
    let status=await this.request('/api/records',{method:'POST',body:manifest});
    if(status.status==='synced')return status;
    const total=manifest.media.reduce((n,m)=>n+Math.ceil(m.bytes/status.chunkBytes),0);
    let completed=status.media.reduce((n,m)=>n+m.received.length,0);
    onProgress({completed,total});
    for(const media of manifest.media){
      const blob=blobs.get(media.id);
      if(!blob||blob.size!==media.bytes)throw Error('Falta una copia local íntegra de la evidencia.');
      const received=new Set(status.media.find(m=>m.id===media.id).received);
      for(let index=0;index<Math.ceil(blob.size/status.chunkBytes);index++){
        if(received.has(index))continue;
        const fragment=blob.slice(index*status.chunkBytes,(index+1)*status.chunkBytes);
        await this.request(`/api/records/${manifest.id}/media/${media.id}/chunks/${index}`,{method:'PUT',body:fragment,raw:true});
        onProgress({completed:++completed,total});
      }
    }
    return this.request(`/api/records/${manifest.id}/finalize`,{method:'POST'});
  }
}

// Private hosted prototype: real cloud persistence for DEMO metadata only.
export class PreviewCloudClient {
  constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetch=fetcher;}
  async request(method,body,path='/api/preview/records'){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await this.fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
      const value=await response.json();if(!response.ok)throw Error(value.error||'No se pudo confirmar el registro en la nube.');return value;
    }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw Error('Sin conexión con la nube. El registro sigue pendiente en este dispositivo.');throw error;}
    finally{clearTimeout(timer);}
  }
  list(){return this.request('GET');}
  save(payload){return this.request('POST',payload);}
  deletion(payload){return this.request('POST',payload,'/api/preview/deletions');}
}
