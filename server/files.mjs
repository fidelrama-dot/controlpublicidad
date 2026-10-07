import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {openSync,writeFileSync,fsyncSync,closeSync,renameSync,mkdirSync,readFileSync,existsSync,chmodSync,unlinkSync} from 'node:fs';
import {dirname,join} from 'node:path';
export const CHUNK_BYTES=256*1024;
export function atomicWrite(path,bytes){
  mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const temp=path+'.'+randomBytes(8).toString('hex')+'.tmp';
  let fd;
  try{fd=openSync(temp,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temp,path);
    const directory=openSync(dirname(path),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
  }catch(error){if(fd!==undefined)closeSync(fd);try{unlinkSync(temp);}catch{}throw error;}
}
export class FileVault {
  constructor(directory,{key,development=false}={}){
    this.directory=directory;mkdirSync(directory,{recursive:true,mode:0o700});
    if(key){if(!/^[a-f0-9]{64}$/i.test(key))throw Error('CP_STORAGE_KEY must contain 64 hexadecimal characters.');this.key=Buffer.from(key,'hex');}
    else if(development){const path=join(directory,'vault.key');if(!existsSync(path))atomicWrite(path,randomBytes(32));chmodSync(path,0o600);this.key=readFileSync(path);}
    else throw Error('CP_STORAGE_KEY is required outside development.');
    if(this.key.length!==32)throw Error('Invalid storage key.');
  }
  path(record,media,index){return join(this.directory,record,media,index+'.aes');}
  write(record,media,index,bytes){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv,{authTagLength:16});
    cipher.setAAD(Buffer.from(`cp-v1:${record}:${media}:${index}`));
    const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
    atomicWrite(this.path(record,media,index),Buffer.concat([iv,cipher.getAuthTag(),encrypted]));
  }
  read(record,media,index){
    const bytes=readFileSync(this.path(record,media,index));
    const decipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12),{authTagLength:16});
    decipher.setAAD(Buffer.from(`cp-v1:${record}:${media}:${index}`));decipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]);
  }
}
