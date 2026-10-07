import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {FileVault} from './files.mjs';
import {Service} from './service.mjs';
import {createHttpServer} from './http.mjs';
const development=process.argv.includes('--demo');
const directory=process.env.CP_DATA_DIR||fileURLToPath(new URL('./.data',import.meta.url));
const host=development?'127.0.0.1':process.env.CP_HOST||'127.0.0.1';
const port=Number(process.env.CP_PORT||4173);
const origin=process.env.CP_ORIGIN||'http://127.0.0.1:'+port;
if(!development)throw Error('Email/SMS delivery adapter is not configured. Use --demo for local development; production startup is disabled.');
const store=new Store(join(directory,'controlpublicidad.sqlite'));
const vault=new FileVault(join(directory,'media'),{development,key:process.env.CP_STORAGE_KEY});
const service=new Service(store,vault,{development});service.seed();
const server=createHttpServer(service,{origin});
server.listen(port,host,()=>console.log(`ControlPublicidad local: ${origin}/?server=1\nAcceso de desarrollo: admin@example.invalid (el código aparece en pantalla).\nNo es un servicio publicado ni una conexión a la nube.`));
function stop(){server.close(()=>{store.close();process.exit(0);});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
