package com.controlpublicidad.app;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

/** One encrypted document per record plus a durable per-capture recovery journal. */
public final class RecordStore {
 public final CryptoFiles files;
 public RecordStore(CryptoFiles files){this.files=files;}
 public static String now(){return Instant.now().toString();}
 public JSONObject json(String name)throws Exception{return new JSONObject(new String(files.read(name,1024*1024),StandardCharsets.UTF_8));}
 public void writeJson(String name,JSONObject data)throws Exception{files.write(name,data.toString().getBytes(StandardCharsets.UTF_8));}
 public static String id(String value)throws IOException{if(value==null||!value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"))throw new IOException("Identificador inválido.");return value;}
 public synchronized JSONObject settings()throws Exception{return files.exists("settings.json")?json("settings.json"):new JSONObject().put("installationId",UUID.randomUUID().toString());}
 public synchronized void settings(JSONObject value)throws Exception{writeJson("settings.json",value);}
 public synchronized JSONObject record(String id)throws Exception{
  id=id(id);String cache="record-"+id+".json",seal="seal-"+id+".json";
  if(!files.exists(seal))return json(cache);
  JSONObject r=json(seal);if(files.exists(cache))r.put("lastError",json(cache).optString("lastError"));
  if(files.exists("receipt-"+id+".json")){JSONObject receipt=json("receipt-"+id+".json");if(!id.equals(receipt.optString("id"))||!"synced".equals(receipt.optString("status"))||receipt.optInt("number")<=0)throw new IOException("Confirmación local inválida.");r.put("status","synced").put("number",receipt.getInt("number")).put("receivedAt",receipt.getString("confirmedLocallyAt")).put("lastError","");}
  return r;
 }
 public synchronized List<JSONObject> records(String owner)throws Exception{
  List<JSONObject> values=new ArrayList<>();Set<String> ids=new HashSet<>();for(String name:files.names())if(name.matches("(record|seal)-[a-f0-9-]{36}\\.json"))ids.add(name.substring(name.indexOf('-')+1,name.length()-5));for(String rid:ids){JSONObject r=record(rid);if(owner.equals(r.getString("owner")))values.add(r);}
  values.sort((a,b)->b.optString("createdAt").compareTo(a.optString("createdAt")));return values;
 }
 public synchronized JSONObject draft(String owner)throws Exception{for(JSONObject r:records(owner))if("draft".equals(r.optString("status")))return r;return null;}
 public synchronized JSONObject create(String owner,JSONObject actor,JSONObject campaign,JSONObject membership,JSONObject device)throws Exception{
  if(draft(owner)!=null)throw new IOException("Ya tienes un borrador. Continúa ese registro.");
  JSONObject r=new JSONObject().put("id",UUID.randomUUID().toString()).put("owner",owner).put("authorId",actor.getString("id")).put("authorName",membership.optString("displayName",actor.getString("name"))).put("campaignId",campaign.getString("id")).put("campaignName",campaign.getString("name")).put("membershipId",membership.getString("id")).put("allowedTypes",new JSONArray(campaign.getJSONArray("types").toString())).put("type",campaign.getJSONArray("types").getString(0)).put("notes","").put("device",device).put("media",new JSONArray()).put("status","draft").put("createdAt",now());
  writeJson("record-"+r.getString("id")+".json",r);return r;
 }
 private static void editable(JSONObject r)throws Exception{if(!"draft".equals(r.getString("status")))throw new IOException("El registro sellado no se puede modificar.");}
 public synchronized JSONObject update(String rid,String type,String notes)throws Exception{
  JSONObject r=record(rid);editable(r);if(!contains(r.getJSONArray("allowedTypes"),type))throw new IOException("Tipo no habilitado en esta campaña.");if(notes.length()>1000)throw new IOException("Notas: máximo 1,000 caracteres.");
  r.put("type",type).put("notes",notes);writeJson("record-"+rid+".json",r);return r;
 }
 public static boolean contains(JSONArray values,String text){for(int i=0;i<values.length();i++)if(text.equals(values.optString(i)))return true;return false;}
 public static int count(JSONObject r,String kind)throws Exception{int n=0;JSONArray a=r.getJSONArray("media");for(int i=0;i<a.length();i++)if(kind.equals(a.getJSONObject(i).getString("kind")))n++;return n;}
 public synchronized JSONObject begin(String rid,String kind,JSONObject gps)throws Exception{
  JSONObject r=record(rid);editable(r);if(files.exists("pending.json"))throw new IOException("Hay una captura pendiente de recuperar.");
  if(!Arrays.asList("photo","video").contains(kind))throw new IOException("Tipo inválido.");if(count(r,kind)>=("photo".equals(kind)?10:3))throw new IOException("Se alcanzó el límite de archivos.");
  JSONObject p=new JSONObject().put("recordId",rid).put("record",new JSONObject(r.toString())).put("id",UUID.randomUUID().toString()).put("kind",kind).put("mime","photo".equals(kind)?"image/jpeg":"video/mp4").put("capturedAt",now()).put("gps",gps==null?JSONObject.NULL:gps);
  writeJson("pending.json",p);return p;
 }
 public synchronized JSONObject pending()throws Exception{return files.exists("pending.json")?json("pending.json"):null;}
 public synchronized void pending(JSONObject p)throws Exception{writeJson("pending.json",p);}
 public synchronized void cancelEmptyPending()throws Exception{
  JSONObject p=pending();if(p!=null&&!files.exists("media-"+p.getString("id")+".bin"))files.remove("pending.json");
 }
 public synchronized JSONObject importPhoto(JSONObject pending,byte[] bytes)throws Exception{
  String mid=id(pending.getString("id"));files.write("media-"+mid+".bin",bytes);return complete(pending,bytes.length);
 }
 public synchronized JSONObject importVideo(JSONObject pending,File raw)throws Exception{
  try(InputStream in=new FileInputStream(raw)){files.write("media-"+id(pending.getString("id"))+".bin",in);}return complete(pending,raw.length());
 }
 public synchronized JSONObject complete(JSONObject pending,long bytes)throws Exception{
  String mid=id(pending.getString("id")),rid=id(pending.getString("recordId"));
  JSONObject media=new JSONObject().put("id",mid).put("kind",pending.getString("kind")).put("mime",pending.getString("mime")).put("capturedAt",pending.getString("capturedAt")).put("gps",pending.optJSONObject("gps")==null?JSONObject.NULL:pending.getJSONObject("gps")).put("bytes",bytes).put("sha256",files.hash("media-"+mid+".bin"));
  JSONObject journal=new JSONObject().put("recordId",rid).put("record",pending.getJSONObject("record")).put("media",media);
  writeJson("capture-"+mid+".json",journal);attach(journal);
  files.remove("pending.json");return media;
 }
 private void attach(JSONObject journal)throws Exception{
  String rid=id(journal.getString("recordId"));JSONObject r=files.exists("record-"+rid+".json")?record(rid):new JSONObject(journal.getJSONObject("record").toString());
  JSONObject media=journal.getJSONObject("media");JSONArray a=r.getJSONArray("media");for(int i=0;i<a.length();i++)if(a.getJSONObject(i).getString("id").equals(media.getString("id")))return;
  editable(r);a.put(media);writeJson("record-"+rid+".json",r);
 }
 public synchronized void archiveInterrupted()throws Exception{
  JSONObject p=pending();if(p==null||!files.exists("recovery-"+p.getString("id")+".bin"))throw new IOException("No se encontró una copia cifrada de la grabación.");
  JSONObject r=record(p.getString("recordId"));editable(r);JSONArray interrupted=r.optJSONArray("interrupted");if(interrupted==null){interrupted=new JSONArray();r.put("interrupted",interrupted);}
  if(!contains(interrupted,p.getString("id")))interrupted.put(p.getString("id"));writeJson("interrupted-"+p.getString("id")+".json",p);writeJson("record-"+r.getString("id")+".json",r);files.remove("pending.json");
 }
 public synchronized int recoverJournals()throws Exception{int n=0;for(String name:files.names())if(name.matches("capture-[a-f0-9-]{36}\\.json")){attach(json(name));n++;}return n;}
 public static JSONObject manifest(JSONObject r)throws Exception{
  JSONArray media=new JSONArray();JSONArray source=r.getJSONArray("media");for(int i=0;i<source.length();i++){JSONObject m=source.getJSONObject(i);media.put(new JSONObject(m.toString()));}
  return new JSONObject().put("id",r.getString("id")).put("membershipId",r.getString("membershipId")).put("type",r.getString("type")).put("notes",r.getString("notes")).put("device",new JSONObject(r.getJSONObject("device").toString())).put("media",media);
 }
 public synchronized JSONObject seal(String rid)throws Exception{
  JSONObject r=record(rid);editable(r);JSONObject p=pending();if(p!=null&&rid.equals(p.optString("recordId")))throw new IOException("Recupera primero la captura pendiente.");
  if(r.getJSONArray("media").length()==0)throw new IOException("Toma al menos una foto o video.");
  if(!contains(r.getJSONArray("allowedTypes"),r.getString("type")))throw new IOException("Tipo no permitido.");
  if(count(r,"photo")>10||count(r,"video")>3)throw new IOException("Límite de archivos excedido.");
  JSONArray a=r.getJSONArray("media");for(int i=0;i<a.length();i++){JSONObject m=a.getJSONObject(i);long limit="photo".equals(m.getString("kind"))?12L*1024*1024:50L*1024*1024;if(m.getLong("bytes")<=0||m.getLong("bytes")>limit)throw new IOException("Un archivo excede el límite del receptor. El borrador se conserva.");if(!files.hash("media-"+m.getString("id")+".bin").equals(m.getString("sha256")))throw new IOException("No se pudo verificar un archivo. Conserva el teléfono.");}
  r.put("manifest",manifest(r)).put("sealedAt",now()).put("status","pending").put("lastError","");writeJson("seal-"+rid+".json",r);writeJson("record-"+rid+".json",r);return r;
 }
 public synchronized void received(String rid,JSONObject receipt)throws Exception{
  JSONObject r=record(rid);if(!"synced".equals(receipt.optString("status"))||!rid.equals(receipt.optString("id"))||receipt.optInt("number",0)<=0)throw new IOException("El servidor no confirmó el registro completo.");
  receipt=new JSONObject(receipt.toString()).put("confirmedLocallyAt",now());writeJson("receipt-"+rid+".json",receipt);r.put("status","synced").put("number",receipt.getInt("number")).put("receivedAt",receipt.getString("confirmedLocallyAt")).put("lastError","");writeJson("record-"+rid+".json",r);
 }
 public synchronized void error(String rid,String message)throws Exception{JSONObject r=record(rid);if(!"draft".equals(r.optString("status"))&&!"synced".equals(r.optString("status"))){r.put("lastError",message);writeJson("record-"+rid+".json",r);}}
}
