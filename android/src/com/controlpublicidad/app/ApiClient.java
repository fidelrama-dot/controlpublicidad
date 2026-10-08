package com.controlpublicidad.app;

import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** HTTPS, session cookie, CSRF and idempotent resumable upload. No simulated receipts. */
public final class ApiClient {
 public interface Transport {JSONObject request(String method,String path,byte[] body,String contentType)throws Exception;}
 public interface Progress {void update(String text);}
 public static final class HttpTransport implements Transport {
  private final String origin,cookie,csrf;
  public String newCookie="";
  public HttpTransport(String origin,String cookie,String csrf)throws Exception{
   URI u=new URI(origin.trim());if(!"https".equals(u.getScheme())||u.getHost()==null||u.getRawUserInfo()!=null||u.getRawQuery()!=null||u.getRawFragment()!=null||u.getRawPath()!=null&&!u.getRawPath().isEmpty()&&!"/".equals(u.getRawPath()))throw new IOException("Usa la dirección HTTPS del servidor, sin ruta ni credenciales.");
   this.origin=u.getScheme()+"://"+u.getRawAuthority();this.cookie=cookie;this.csrf=csrf;
  }
  public JSONObject request(String method,String path,byte[] body,String contentType)throws Exception{
   if(!path.startsWith("/api/"))throw new IOException("Ruta no permitida.");HttpURLConnection c=(HttpURLConnection)new URL(origin+path).openConnection();
   c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(45000);c.setRequestMethod(method);c.setRequestProperty("Accept","application/json");
   if(cookie!=null&&!cookie.isEmpty())c.setRequestProperty("Cookie",cookie);if(csrf!=null&&!csrf.isEmpty())c.setRequestProperty("X-CSRF-Token",csrf);
   try{
    if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type",contentType);c.setFixedLengthStreamingMode(body.length);try(OutputStream out=c.getOutputStream()){out.write(body);}}
    int status=c.getResponseCode();String ct=c.getHeaderField("Content-Type");if(ct==null||!ct.toLowerCase(Locale.ROOT).startsWith("application/json"))throw new IOException("La dirección no es la API móvil. El sitio web de prueba usa un servicio diferente.");
    InputStream in=status<400?c.getInputStream():c.getErrorStream();byte[] bytes=limited(in,2*1024*1024);JSONObject result=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
    if(status<200||status>=300)throw new IOException(result.optString("error","El servidor rechazó la operación ("+status+")."));
    String set=c.getHeaderField("Set-Cookie");if(set!=null&&set.startsWith("cp_session="))newCookie=set.split(";",2)[0];return result;
   }finally{c.disconnect();}
  }
  private byte[] limited(InputStream input,int max)throws IOException{if(input==null)throw new IOException("El servidor no respondió.");try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>max)throw new IOException("Respuesta demasiado grande.");out.write(buf,0,n);}return out.toByteArray();}}
 }
 private final Transport transport;
 public ApiClient(Transport transport){this.transport=transport;}
 public JSONObject json(String method,String path,JSONObject body)throws Exception{return transport.request(method,path,body==null?null:body.toString().getBytes(StandardCharsets.UTF_8),"application/json");}
 public JSONObject upload(RecordStore store,JSONObject record,Progress progress)throws Exception{
  String rid=RecordStore.id(record.getString("id"));JSONObject manifest=record.getJSONObject("manifest");
  // Authenticate every local file before sending any bytes.
  JSONArray media=manifest.getJSONArray("media");for(int i=0;i<media.length();i++){JSONObject m=media.getJSONObject(i);if(!store.files.hash("media-"+m.getString("id")+".bin").equals(m.getString("sha256")))throw new IOException("La copia local no coincide con su hash. Se conserva para revisión.");}
  progress.update("Consultando registro…");JSONObject status=json("POST","/api/records",manifest);
  if("synced".equals(status.optString("status")))return status;
  int chunk=status.getInt("chunkBytes");if(chunk<=0||chunk>1024*1024)throw new IOException("Tamaño de fragmento inválido.");JSONArray remote=status.getJSONArray("media");
  for(int i=0;i<media.length();i++){
   JSONObject m=media.getJSONObject(i),state=null;String mid=RecordStore.id(m.getString("id"));for(int j=0;j<remote.length();j++)if(mid.equals(remote.getJSONObject(j).optString("id")))state=remote.getJSONObject(j);if(state==null)throw new IOException("Falta un archivo en la respuesta del servidor.");
   Set<Integer> received=new HashSet<>();JSONArray list=state.getJSONArray("received");for(int j=0;j<list.length();j++)received.add(list.getInt(j));
   long bytes=m.getLong("bytes"),read=0;int index=0;
   try(InputStream in=store.files.open("media-"+mid+".bin")){
    while(read<bytes){int expected=(int)Math.min(chunk,bytes-read);byte[] part=new byte[expected];int off=0,n;while(off<expected&&(n=in.read(part,off,expected-off))>0)off+=n;if(off!=expected)throw new IOException("Archivo local incompleto.");
     if(!received.contains(index)){progress.update("Archivo "+(i+1)+" de "+media.length()+" · "+Math.round(100.0*(read+expected)/bytes)+"%");transport.request("PUT","/api/records/"+rid+"/media/"+mid+"/chunks/"+index,part,"application/octet-stream");}
     index++;read+=expected;
    }
    if(in.read()!=-1)throw new IOException("Tamaño de archivo alterado.");
   }
  }
  progress.update("Verificando evidencia completa…");JSONObject receipt=json("POST","/api/records/"+rid+"/finalize",new JSONObject());
  if(!"synced".equals(receipt.optString("status"))||!rid.equals(receipt.optString("id"))||receipt.optInt("number",0)<=0)throw new IOException("Falta confirmación íntegra del servidor.");return receipt;
 }
}
