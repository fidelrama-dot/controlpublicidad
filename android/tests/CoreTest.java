package com.controlpublicidad.app;

import org.json.*;
import javax.crypto.*;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;

public final class CoreTest {
 private static int assertions=0;
 private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
 private interface Checked{void run()throws Exception;}
 private static void rejects(Checked fn,String message)throws Exception{boolean rejected=false;try{fn.run();}catch(Exception e){rejected=true;}check(rejected,message);}
 private static RecordStore fresh()throws Exception{KeyGenerator gen=KeyGenerator.getInstance("AES");gen.init(256);return new RecordStore(new CryptoFiles(Files.createTempDirectory("cp-android-test-").toFile(),gen.generateKey()));}
 private static JSONObject draft(RecordStore store,String owner)throws Exception{
  return store.create(owner,new JSONObject().put("id","sofia").put("name","Sofía").put("role","collaborator"),new JSONObject().put("id","cantera").put("name","Casa Cantera").put("types",new JSONArray().put("lona")),new JSONObject().put("id","member-sofia"),new JSONObject().put("installationId",UUID.randomUUID().toString()).put("name","Test").put("brand","Test").put("model","Test"));
 }
 private static JSONObject photo(RecordStore store,JSONObject r,byte[] bytes)throws Exception{return store.importPhoto(store.begin(r.getString("id"),"photo",new JSONObject().put("lat",19.7).put("lng",-101.2).put("accuracy",6).put("capturedAt",RecordStore.now())),bytes);}
 private static void crypto()throws Exception{
  RecordStore s=fresh();byte[] original="original evidencia GPS autor notas".getBytes("UTF-8");s.files.write("a.bin",original);byte[] encrypted1=Files.readAllBytes(s.files.file("a.bin").toPath());s.files.write("a.bin",original);byte[] encrypted2=Files.readAllBytes(s.files.file("a.bin").toPath());
  check(!Arrays.equals(encrypted1,encrypted2),"Every encryption must use a fresh IV");check(Arrays.equals(original,s.files.read("a.bin",1000)),"Lossless round trip");check(!new String(encrypted2,"ISO-8859-1").contains("original evidencia"),"No plaintext bytes on disk");
  Files.copy(s.files.file("a.bin").toPath(),s.files.file("b.bin").toPath());rejects(()->s.files.read("b.bin",1000),"AAD rejects file substitution");
  encrypted2[encrypted2.length-1]^=1;Files.write(s.files.file("a.bin").toPath(),encrypted2);rejects(()->s.files.read("a.bin",1000),"GCM rejects alteration");
  s.files.write("pending.bin",original);Files.move(s.files.file("pending.bin").toPath(),s.files.file("pending.bin.new").toPath());check(s.files.recoverWrite("pending.bin"),"Recover authenticated complete pre-rename write");check(Arrays.equals(original,s.files.read("pending.bin",1000)),"Recovered bytes match original");
  s.files.write("partial.bin",original);byte[] partial=Files.readAllBytes(s.files.file("partial.bin").toPath());Files.delete(s.files.file("partial.bin").toPath());Files.write(s.files.file("partial.bin.new").toPath(),Arrays.copyOf(partial,20));rejects(()->s.files.recoverWrite("partial.bin"),"Never promote incomplete ciphertext");check(!s.files.exists("partial.bin"),"No invalid replacement committed");
 }
 private static void records()throws Exception{
  RecordStore s=fresh();JSONObject r=draft(s,"test|sofia");String rid=r.getString("id");check(s.records("test|other").isEmpty(),"Profile isolation");rejects(()->s.update(rid,"barda",""),"Casa Cantera allows lona only");rejects(()->s.seal(rid),"Cannot seal empty draft");
  byte[] jpeg={-1,-40,-1,4,5,6};JSONObject m=photo(s,r,jpeg);check(m.getString("sha256").equals(CryptoFiles.hash(new ByteArrayInputStream(jpeg))),"Original hash preserved");check(m.getJSONObject("gps").getDouble("accuracy")==6,"Capture GPS preserved");
  // Crash after journal commit but before the record index commit.
  s.writeJson("record-"+rid+".json",r);s.recoverJournals();check(s.record(rid).getJSONArray("media").length()==1,"Replay capture journal");s.recoverJournals();check(s.record(rid).getJSONArray("media").length()==1,"Idempotent recovery");
  s.update(rid,"lona","Nota final");JSONObject sealed=s.seal(rid);String frozen=sealed.getJSONObject("manifest").toString();rejects(()->s.update(rid,"lona","cambiar"),"No edits after sealing");rejects(()->s.begin(rid,"photo",null),"No additions after sealing");
  // The sealed journal stays authoritative across a stale or missing record cache.
  s.writeJson("record-"+rid+".json",r);check(s.record(rid).getString("status").equals("pending"),"Recover seal even with stale cache");check(s.record(rid).getJSONObject("manifest").toString().equals(frozen),"Frozen seal survives stale cache");s.files.remove("record-"+rid+".json");check(s.records("test|sofia").size()==1,"Enumerate seal without cache");
  rejects(()->s.received(rid,new JSONObject().put("id",rid).put("status","uploading").put("number",1)),"Never claim incomplete upload");s.received(rid,new JSONObject().put("id",rid).put("status","synced").put("number",7));s.files.remove("record-"+rid+".json");check(s.record(rid).getInt("number")==7,"Durable receipt journal");check(Arrays.equals(jpeg,s.files.read("media-"+m.getString("id")+".bin",1000)),"Local original retained after receipt");
  for(String name:s.files.names())if(!name.endsWith(".new")){String bytes=new String(Files.readAllBytes(s.files.file(name).toPath()),"ISO-8859-1");check(!bytes.contains("Casa Cantera")&&!bytes.contains("Nota final"),"Metadata encrypted at rest");}
 }
 private static void limits()throws Exception{
  RecordStore s=fresh();JSONObject r=draft(s,"test|limits");for(int i=0;i<10;i++)photo(s,r,new byte[]{-1,-40,-1,1});rejects(()->s.begin(r.getString("id"),"photo",null),"Max 10 photos");
  for(int i=0;i<3;i++){JSONObject p=s.begin(r.getString("id"),"video",null);File raw=File.createTempFile("video-test-",".mp4");Files.write(raw.toPath(),new byte[]{0,0,0,0,102,116,121,112,1,2});s.importVideo(p,raw);raw.delete();}rejects(()->s.begin(r.getString("id"),"video",null),"Max 3 videos");check(s.seal(r.getString("id")).getJSONArray("media").length()==13,"Max mixed record accepted");
  RecordStore damaged=fresh();JSONObject d=draft(damaged,"test|damage");JSONObject m=photo(damaged,d,new byte[]{-1,-40,-1,1});byte[] bytes=Files.readAllBytes(damaged.files.file("media-"+m.getString("id")+".bin").toPath());bytes[20]^=1;Files.write(damaged.files.file("media-"+m.getString("id")+".bin").toPath(),bytes);rejects(()->damaged.seal(d.getString("id")),"Never seal corrupted copy");check(damaged.record(d.getString("id")).getString("status").equals("draft"),"Retain damaged draft without pretending sealed");
  RecordStore interrupted=fresh();JSONObject ir=draft(interrupted,"test|cut");JSONObject ip=interrupted.begin(ir.getString("id"),"video",null);interrupted.files.write("recovery-"+ip.getString("id")+".bin",new byte[]{1,2,3});interrupted.archiveInterrupted();check(interrupted.pending()==null,"Can continue after archiving interrupted capture");check(interrupted.files.exists("recovery-"+ip.getString("id")+".bin"),"Never delete interrupted original");check(interrupted.record(ir.getString("id")).getJSONArray("interrupted").length()==1,"Retain interrupted provenance");
 }
 private static void policy()throws Exception{
  JSONObject actor=new JSONObject().put("id","sofia").put("role","collaborator"),leader=new JSONObject().put("id","l").put("campaignId","c").put("userId","mariana").put("role","leader").put("parentId",JSONObject.NULL).put("status","active");JSONObject coord=new JSONObject().put("id","d").put("campaignId","c").put("userId","diego").put("role","coordinator").put("parentId","l").put("status","active");JSONObject child=new JSONObject().put("id","s").put("campaignId","c").put("userId","sofia").put("role","collaborator").put("parentId","d").put("status","active");
  JSONObject data=new JSONObject().put("memberships",new JSONArray().put(leader).put(coord).put(child)).put("campaigns",new JSONArray().put(new JSONObject().put("id","c").put("status","active").put("types",new JSONArray().put("lona"))));check(Policy.assignments(data,actor,false).size()==1,"Active own branch captures");coord.put("status","inactive");check(Policy.assignments(data,actor,false).isEmpty(),"Inactive parent blocks local capture");coord.put("status","active");leader.put("parentId","d");check(Policy.assignments(data,actor,false).isEmpty(),"Reject ancestry cycle");leader.put("parentId",JSONObject.NULL);
  data.put("memberships",new JSONArray().put(child));check(Policy.assignments(data,actor,true).isEmpty(),"Remote must fail closed without server eligibility");data.put("captureAssignments",new JSONArray().put(new JSONObject().put("membershipId","s").put("campaignId","c")));check(Policy.assignments(data,actor,true).size()==1,"Remote own eligibility without parent data leakage");actor.put("id","other");check(Policy.assignments(data,actor,true).isEmpty(),"Remote assignment never authorizes another person");rejects(()->new ApiClient.HttpTransport("http://example.com","",""),"No plaintext HTTP");rejects(()->new ApiClient.HttpTransport("https://user:password@example.com","",""),"No embedded URL credentials");
 }
 private static final class MockServer implements ApiClient.Transport{
  final int chunk=256*1024;JSONObject manifest;final Map<Integer,byte[]> pieces=new TreeMap<>();boolean cut=true;int puts=0;final String mid;MockServer(String mid){this.mid=mid;}
  public JSONObject request(String method,String path,byte[] body,String ct)throws Exception{
   if(method.equals("POST")&&path.equals("/api/records")){JSONObject input=new JSONObject(new String(body,"UTF-8"));if(manifest!=null)check(manifest.toString().equals(input.toString()),"Retries keep the identical manifest");manifest=input;JSONArray received=new JSONArray();for(int k:pieces.keySet())received.put(k);return new JSONObject().put("id",manifest.getString("id")).put("status","uploading").put("chunkBytes",chunk).put("media",new JSONArray().put(new JSONObject().put("id",mid).put("received",received)));}
   if(method.equals("PUT")){int index=Integer.parseInt(path.substring(path.lastIndexOf('/')+1));if(index==1&&cut){cut=false;throw new IOException("Network cut");}check(!pieces.containsKey(index),"Retry skips received chunks");pieces.put(index,body);puts++;return new JSONObject();}
   if(path.endsWith("/finalize")){ByteArrayOutputStream all=new ByteArrayOutputStream();for(byte[] bytes:pieces.values())all.write(bytes);check(CryptoFiles.hash(new ByteArrayInputStream(all.toByteArray())).equals(manifest.getJSONArray("media").getJSONObject(0).getString("sha256")),"Server sees identical original bytes");return new JSONObject().put("id",manifest.getString("id")).put("status","synced").put("number",1);}
   throw new IOException("Unexpected route");
  }
 }
 private static void upload()throws Exception{
  RecordStore s=fresh();JSONObject r=draft(s,"test|upload");byte[] bytes=new byte[700_000];new SecureRandom().nextBytes(bytes);bytes[0]=-1;bytes[1]=-40;bytes[2]=-1;JSONObject m=photo(s,r,bytes);JSONObject sealed=s.seal(r.getString("id"));MockServer remote=new MockServer(m.getString("id"));ApiClient client=new ApiClient(remote);
  rejects(()->client.upload(s,sealed,t->{}),"Interrupted upload remains pending");check(s.record(r.getString("id")).getString("status").equals("pending"),"No false confirmed state after network loss");check(remote.pieces.size()==1,"One chunk accepted before loss");JSONObject receipt=client.upload(s,sealed,t->{});s.received(r.getString("id"),receipt);check(remote.puts==3,"Only missing fragments retried");check(s.record(r.getString("id")).getString("status").equals("synced"),"Complete receipt marks synced");check(Arrays.equals(bytes,s.files.read("media-"+m.getString("id")+".bin",800_000)),"Never remove original after sync");
 }
 public static void main(String[] args)throws Exception{crypto();records();limits();policy();upload();System.out.println("Android core: "+assertions+" assertions passed (JVM; hardware and Android Keystore require device validation).");}
}
