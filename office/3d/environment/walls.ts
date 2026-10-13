import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WALLS } from '../layout'
/** All wall segments merged into 4 geometries (solid / glass / top caps / base) → 4 draw calls instead of ~170 meshes. */
export function buildWalls(){
  const solid:THREE.BufferGeometry[]=[],glass:THREE.BufferGeometry[]=[],caps:THREE.BufferGeometry[]=[],base:THREE.BufferGeometry[]=[]
  const place=(g:THREE.BufferGeometry,rot:number,x:number,y:number,z:number)=>{g.rotateY(rot);g.translate(x,y,z);return g}
  for(const s of WALLS){ const dx=s.x2-s.x1,dz=s.z2-s.z1,L=Math.hypot(dx,dz),cx=(s.x1+s.x2)/2,cz=(s.z1+s.z2)/2,rot=-Math.atan2(dz,dx)
    if(s.glass){glass.push(place(new THREE.BoxGeometry(L,s.h,0.05),rot,cx,s.h/2,cz))}
    else{solid.push(place(new THREE.BoxGeometry(L,s.h,0.1),rot,cx,s.h/2,cz)); if(s.h>1.5)base.push(place(new THREE.BoxGeometry(L,0.12,0.13),rot,cx,0.06,cz))}
    caps.push(place(new THREE.BoxGeometry(L,0.06,0.16),rot,cx,s.h+0.03,cz)) }
  const m=(a:THREE.BufferGeometry[])=>mergeGeometries(a,false)!
  return {solid:m(solid),glass:m(glass),caps:m(caps),base:m(base)}
}
