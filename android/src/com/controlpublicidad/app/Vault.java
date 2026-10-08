package com.controlpublicidad.app;

import android.content.Context;
import android.os.Build;
import android.security.keystore.*;
import android.media.MediaMetadataRetriever;
import org.json.*;
import java.io.*;
import java.security.KeyStore;

import javax.crypto.*;

public final class Vault {
 private static RecordStore store;
 public static synchronized RecordStore get(Context context)throws Exception{
  if(store!=null)return store;File root=new File(context.getNoBackupFilesDir(),"vault");String alias="controlpublicidad-vault-v1";
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);SecretKey key;
  if(ks.containsAlias(alias))key=(SecretKey)ks.getKey(alias,null);
  else{
   if(root.isDirectory()&&root.list()!=null&&root.list().length>0)throw new IOException("La clave del teléfono no está disponible. No se borrará la bóveda.");
   KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");gen.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());key=gen.generateKey();
  }
  RecordStore created=new RecordStore(new CryptoFiles(root,key,directory->{java.io.FileDescriptor fd=null;try{fd=android.system.Os.open(directory.getAbsolutePath(),android.system.OsConstants.O_RDONLY,0);android.system.Os.fsync(fd);}catch(android.system.ErrnoException e){throw new IOException("No se pudo sincronizar la bóveda.",e);}finally{if(fd!=null)try{android.system.Os.close(fd);}catch(android.system.ErrnoException ignored){}}}));JSONObject settings=created.settings();created.settings(settings);store=created;return store;
 }
 public static JSONObject device(Context context,RecordStore store)throws Exception{
  String name=Build.MANUFACTURER+" "+Build.MODEL;try{String system=android.provider.Settings.Global.getString(context.getContentResolver(),"device_name");if(system!=null&&!system.trim().isEmpty())name=system.trim();}catch(SecurityException ignored){}
  return new JSONObject().put("installationId",store.settings().getString("installationId")).put("name",name).put("brand",Build.BRAND).put("model",Build.MODEL);
 }
 public static File incoming(Context c,String mid)throws Exception{RecordStore.id(mid);File dir=new File(c.getNoBackupFilesDir(),"incoming");if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("No hay espacio para grabar.");return new File(dir,mid+".mp4");}
 public static String recover(Context context)throws Exception{
  RecordStore s=get(context);s.recoverJournals();JSONObject p=s.pending();if(p==null)return "";String mid=p.getString("id");
  s.files.recoverWrite("media-"+mid+".bin");
  if(s.files.exists("media-"+mid+".bin")){
   // Complete the interrupted commit from the original encrypted bytes and capture journal.
   long size=0;try(InputStream in=s.files.open("media-"+mid+".bin")){byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)size+=n;}s.complete(p,size);File raw=incoming(context,mid);if(raw.exists())raw.delete();return "Se recuperó una captura pendiente.";
  }
  File raw=incoming(context,mid);
  if(raw.isFile()&&raw.length()>0){
   MediaMetadataRetriever probe=new MediaMetadataRetriever();boolean valid=false;
   try{probe.setDataSource(raw.getAbsolutePath());valid=probe.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!=null;}catch(Exception ignored){}finally{probe.release();}
   if(valid){s.importVideo(p,raw);raw.delete();return "Se recuperó un video de la grabación anterior.";}
   try(InputStream in=new FileInputStream(raw)){s.files.write("recovery-"+mid+".bin",in);}p.put("recoveryError",true);s.pending(p);raw.delete();
   return "Hay una grabación interrumpida que no se pudo abrir. Sus bytes se conservaron cifrados. Puedes conservarla aparte desde el registro y continuar.";
  }
  if(s.files.exists("recovery-"+mid+".bin"))return "Se conserva una grabación interrumpida cifrada, pendiente de revisión.";
  s.cancelEmptyPending();return "La captura anterior no llegó a generar un archivo. Tu borrador se conserva.";
 }
 public static JSONObject demo(Context c)throws Exception{try(InputStream in=c.getAssets().open("demo.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);return new JSONObject(out.toString("UTF-8"));}}
 public static String owner(JSONObject settings){return settings.optBoolean("remote",false)?settings.optString("origin")+"|"+settings.optJSONObject("user").optString("id"):"local-test|"+settings.optString("demoUser","f1");}
}
