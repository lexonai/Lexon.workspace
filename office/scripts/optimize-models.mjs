// Compress GLB/GLTF assets: Meshopt (or Draco) geometry + WebP/KTX2 textures, resized.  node scripts/optimize-models.mjs [dir|file] [--draco] [--ktx2] [--size=1024]
// KTX2 needs the `toktx` tool (KTX-Software) on PATH; WebP is the default and needs nothing extra.
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'
const args=process.argv.slice(2),target=args.find(a=>!a.startsWith('--'))||'public/models',has=f=>args.includes(f),size=(args.find(a=>a.startsWith('--size='))||'--size=1024').split('=')[1]
const files=(p)=>fs.statSync(p).isDirectory()?fs.readdirSync(p).flatMap(f=>files(path.join(p,f))):/\.(glb|gltf)$/i.test(p)&&!/\.opt\./i.test(p)?[p]:[]
const list=files(target); if(!list.length){console.log('No .glb/.gltf files found in',target);process.exit(0)}
for(const f of list){ const out=f.replace(/\.(glb|gltf)$/i,'.glb'); const tmp=out+'.tmp'
  const r=spawnSync('npx',['-y','@gltf-transform/cli','optimize',f,tmp,'--compress',has('--draco')?'draco':'meshopt','--texture-compress',has('--ktx2')?'ktx2':'webp','--texture-size',size],{stdio:'inherit',shell:true})
  if(r.status){console.error('✗',f);continue}
  const a=fs.statSync(f).size,b=fs.statSync(tmp).size; fs.renameSync(tmp,out); console.log(`✓ ${f}: ${(a/1024).toFixed(0)} KB → ${(b/1024).toFixed(0)} KB (${Math.round((1-b/a)*100)}% smaller)`) }
