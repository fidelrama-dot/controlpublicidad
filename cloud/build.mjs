import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
const html=(await readFile('index.html','utf8')).replace('</head>','<meta name="controlpublicidad-cloud" content="1"></head>');
const domain=(await readFile('src/domain.mjs','utf8')).replace(/^export /gm,'');
const worker=(await readFile('cloud/worker.mjs','utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',domain+'\n'+worker+'\nexport default createCloudWorker('+JSON.stringify(html)+');\n');
await cp('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Worker y panel de prueba preparados.');
