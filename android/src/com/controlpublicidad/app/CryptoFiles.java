package com.controlpublicidad.app;

import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.channels.FileChannel;
import java.security.*;
import java.util.Arrays;

/** Authenticated encrypted files, bound to their logical name. No key is stored here. */
public final class CryptoFiles {
 public interface DirectorySync{void sync(File directory)throws IOException;}
 private final File root; private final SecretKey key;private final DirectorySync durability;
 private static final byte[] MAGIC={67,80,86,49};
 public CryptoFiles(File root,SecretKey key)throws IOException{this(root,key,CryptoFiles::javaSync);}
 public CryptoFiles(File root,SecretKey key,DirectorySync durability)throws IOException{this.root=root;this.key=key;this.durability=durability;if(!root.isDirectory()&&!root.mkdirs())throw new IOException("No se pudo preparar la bóveda.");}
 public File file(String name)throws IOException{if(!name.matches("[a-zA-Z0-9_.-]{1,180}")||name.contains(".."))throw new IOException("Nombre de archivo inválido.");return new File(root,name);}
 public boolean exists(String name)throws IOException{return file(name).isFile();}
 public synchronized void write(String name,byte[] bytes)throws Exception{write(name,new ByteArrayInputStream(bytes));}
 public synchronized void write(String name,InputStream input)throws Exception{
  File dest=file(name),tmp=file(name+".new");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key);
  byte[] nonce=cipher.getIV();if(nonce.length!=12)throw new IOException("Nonce incompatible.");cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
  try(FileOutputStream out=new FileOutputStream(tmp)){
   out.write(MAGIC);out.write(nonce);byte[] buf=new byte[65536];int n;
   while((n=input.read(buf))!=-1){byte[] part=cipher.update(buf,0,n);if(part!=null)out.write(part);}
   out.write(cipher.doFinal());out.getFD().sync();
  }catch(Exception e){tmp.delete();throw e;}
  // Atomic replacement preserves the previous valid file if interrupted before commit.
  Files.move(tmp.toPath(),dest.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
  syncDirectory();
 }
 public synchronized InputStream open(String name)throws Exception{
  return openPath(file(name),name);
 }
 private InputStream openPath(File physical,String name)throws Exception{
  FileInputStream in=new FileInputStream(physical);try{
   byte[] prefix=new byte[16];int offset=0,n;while(offset<prefix.length&&(n=in.read(prefix,offset,prefix.length-offset))>0)offset+=n;
   if(offset!=16||!Arrays.equals(MAGIC,Arrays.copyOf(prefix,4)))throw new IOException("Archivo cifrado inválido.");
   Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key,new GCMParameterSpec(128,Arrays.copyOfRange(prefix,4,16)));cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
   return new CipherInputStream(in,cipher);
  }catch(Exception e){in.close();throw e;}
 }
 public byte[] read(String name,int limit)throws Exception{try(InputStream in=open(name);ByteArrayOutputStream out=new ByteArrayOutputStream()){
  byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1){if(out.size()+n>limit)throw new IOException("Archivo demasiado grande.");out.write(buf,0,n);}return out.toByteArray();
 }}
 public String hash(String name)throws Exception{try(InputStream in=open(name)){return hash(in);}}
 public static String hash(InputStream in)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-256");byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)md.update(buf,0,n);StringBuilder s=new StringBuilder();for(byte b:md.digest())s.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return s.toString();}
 public synchronized boolean recoverWrite(String name)throws Exception{
  File dest=file(name),tmp=file(name+".new");if(dest.exists()||!tmp.exists())return false;
  try(InputStream in=openPath(tmp,name)){hash(in);} // A full GCM authentication pass before committing.
  Files.move(tmp.toPath(),dest.toPath(),StandardCopyOption.ATOMIC_MOVE);syncDirectory();return true;
 }
 private void syncDirectory()throws IOException{durability.sync(root);}
 private static void javaSync(File root)throws IOException{try(FileChannel directory=FileChannel.open(root.toPath(),StandardOpenOption.READ)){directory.force(true);}}
 public String[] names(){String[] names=root.list();return names==null?new String[0]:names;}
 public void remove(String name)throws IOException{File f=file(name);if(f.exists()&&!f.delete())throw new IOException("No se pudo retirar el archivo temporal.");}
}
