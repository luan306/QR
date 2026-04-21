import fs from 'fs';
console.log('dumpchars running');
const p = 'routes/template.routes.js';
console.log('cwd', process.cwd());
console.log('exists', fs.existsSync(p));
try {
  console.log('realpath', fs.realpathSync(p));
} catch(e){ console.log('realpath error', e.message); }
let content;
try {
  content = fs.readFileSync(p,'utf8');
  console.log('length', content.length);
} catch(e) {
  console.error('read error', e);
}
let idx=0;
for(const ch of content){
  process.stdout.write(idx+':'+JSON.stringify(ch)+'('+ch.charCodeAt(0)+')');
  if(ch==='\n') process.stdout.write('\n');
  idx++;
}
