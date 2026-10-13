// One source → two outputs.   node scripts/build.mjs web [/base-path]   |   win   |   all [/base-path]
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'
const [,, mode='all', base=''] = process.argv
const run=(c,a,env={})=>{const r=spawnSync(c,a,{stdio:'inherit',shell:true,env:{...process.env,...env}});if(r.status)process.exit(r.status)}
const copy=(f,t)=>{fs.rmSync(t,{recursive:true,force:true});fs.cpSync(f,t,{recursive:true})}
if(mode==='web'||mode==='all'){ run('npx',['next','build'],{NEXT_PUBLIC_BASE_PATH:base}); copy('out','web'); console.log(`\n✔ Web build → ./web  (base path "${base||'/'}"). Host it anywhere, or run: npm run server`) }
if(mode==='win'||mode==='all'){ run('npx',['next','build'],{NEXT_PUBLIC_BASE_PATH:''}); run('npx',['electron-builder','--win','portable']); console.log('\n✔ Windows exe → ./release') }
