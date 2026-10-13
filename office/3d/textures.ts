import * as THREE from 'three'
const base=new Map<string,THREE.CanvasTexture>()
/** Procedural floor materials (no asset downloads). */
export function floorTexture(kind:'wood'|'carpet',w:number,d:number){
  if(!base.has(kind)){
    const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d')!
    if(kind==='wood'){ x.fillStyle='#8a6a4a';x.fillRect(0,0,256,256); for(let i=0;i<8;i++){x.fillStyle=`hsl(${26+Math.random()*8},${32+Math.random()*12}%,${30+Math.random()*12}%)`;x.fillRect(0,i*32,256,30);x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,i*32+30,256,2)} for(let i=0;i<500;i++){x.fillStyle='rgba(0,0,0,.05)';x.fillRect(Math.random()*256,Math.random()*256,Math.random()*70,1)} }
    else { x.fillStyle='#8a8f98';x.fillRect(0,0,256,256); for(let i=0;i<7000;i++){const v=110+Math.random()*60;x.fillStyle=`rgb(${v},${v+3},${v+8})`;x.fillRect(Math.random()*256,Math.random()*256,2,2)} }
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;base.set(kind,t)
  }
  const t=base.get(kind)!.clone(); t.repeat.set(w/(kind==='wood'?3:2),d/(kind==='wood'?3:2)); t.needsUpdate=true; return t
}
