import { readFile, writeFile } from 'node:fs/promises';
const shell = await readFile(new URL('./src/shell.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./src/styles.css', import.meta.url), 'utf8');
const domain = (await readFile(new URL('./src/domain.mjs', import.meta.url), 'utf8')).replace(/^export /gm, '');
const app = (await readFile(new URL('./src/app.mjs', import.meta.url), 'utf8')).replace(/^import .*from '\.\/domain\.mjs';\n/m, '');
await writeFile(new URL('./index.html', import.meta.url), shell.replace('/* STYLES */', css).replace('/* APP */', domain + '\n' + app));
console.log('Prototipo generado: index.html');
