'use client'
import * as THREE from 'three'
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useOffice } from '@/store/officeStore'
import { world, seat, ensureWorld, STATUS } from '../world'
import { player } from '../player'
import { perf } from '../perf'
import { CAMS, hash } from '@/config/office.config'
import { ARCH, PANTS, TIES, archOf } from '../archetypes'
import { moodKey } from '@/lib/mood'
import { glbActive } from './GlbNear'
const MAX=64
const faceTex=()=>{ const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d')!;x.fillStyle='#f4f4f4';x.fillRect(0,0,512,256)
  const cx=128;x.fillStyle='rgba(0,0,0,.10)';x.beginPath();x.ellipse(cx,150,6,18,0,0,7);x.fill()                       // nose shade
  for(const s of [-1,1]){x.fillStyle='#fafafa';x.beginPath();x.ellipse(cx+s*26,118,13,7,0,0,7);x.fill();x.fillStyle='#3a2a20';x.beginPath();x.arc(cx+s*26,118,5.5,0,7);x.fill();x.fillStyle='#000';x.beginPath();x.arc(cx+s*26,118,2.6,0,7);x.fill()
    x.strokeStyle='#2a1d17';x.lineWidth=4;x.lineCap='round';x.beginPath();x.moveTo(cx+s*14,98);x.quadraticCurveTo(cx+s*28,90,cx+s*42,98);x.stroke()}
  x.fillStyle='#b5605f';x.beginPath();x.ellipse(cx,176,16,5,0,0,7);x.fill();x.fillStyle='#8f4443';x.fillRect(cx-15,175,30,1.6)
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t }
type P={pair?:boolean;k:string;geo:THREE.BufferGeometry;detail?:boolean;shadow?:boolean;pick?:boolean;map?:boolean;basic?:boolean}
const col=new Map<string,THREE.Color>(); const C=(h:string)=>{let c=col.get(h);if(!c){c=new THREE.Color(h);col.set(h,c)}return c}
const _m=new THREE.Matrix4(),_a=new THREE.Matrix4(),_b=new THREE.Matrix4(),_q=new THREE.Quaternion(),_e=new THREE.Euler(),_v=new THREE.Vector3(),_s=new THREE.Vector3()
const root=new THREE.Matrix4(),headM=new THREE.Matrix4()
function limb(out:THREE.Matrix4,base:THREE.Matrix4,px:number,py:number,pz:number,rx:number,ox:number,oy:number,oz:number,sx=1,sy=1,sz=1){ _a.makeTranslation(px,py,pz);_b.makeRotationX(rx);_a.multiply(_b);_b.makeTranslation(ox,oy,oz);_a.multiply(_b);if(sx!==1||sy!==1||sz!==1){_b.makeScale(sx,sy,sz);_a.multiply(_b)}out.multiplyMatrices(base,_a) }
export function Crowd(){
  const idsKey=useOffice(s=>Object.keys(s.people).join(',')),ids=useMemo(()=>idsKey.split(',').filter(Boolean),[idsKey])
  const parts:P[]=useMemo(()=>[
    {k:'legs',pair:true,geo:new THREE.CapsuleGeometry(0.08,0.62,3,8),shadow:true,pick:true},{k:'shoes',pair:true,geo:new THREE.BoxGeometry(0.11,0.07,0.22)},
    {k:'torso',geo:new THREE.CapsuleGeometry(0.17,0.4,3,10),shadow:true,pick:true},{k:'arms',pair:true,geo:new THREE.CapsuleGeometry(0.055,0.45,3,8),shadow:true},
    {k:'head',geo:new THREE.SphereGeometry(0.115,16,12),shadow:true,pick:true,map:true},{k:'hair',geo:new THREE.SphereGeometry(0.123,14,8,0,Math.PI*2,0,Math.PI/2)},{k:'dot',geo:new THREE.SphereGeometry(0.09,8,6),basic:true},
    {k:'hands',geo:new THREE.SphereGeometry(0.05,8,6),detail:true},{k:'neck',geo:new THREE.CylinderGeometry(0.04,0.045,0.08,8),detail:true},{k:'longhair',geo:new THREE.BoxGeometry(0.23,0.34,0.09),detail:true},
    {k:'bun',geo:new THREE.SphereGeometry(0.06,8,6),detail:true},{k:'glasses',geo:new THREE.BoxGeometry(0.2,0.045,0.01),detail:true},{k:'beard',geo:new THREE.BoxGeometry(0.15,0.07,0.06),detail:true},
    {k:'badge',geo:new THREE.BoxGeometry(0.07,0.1,0.01),detail:true},{k:'tie',geo:new THREE.BoxGeometry(0.04,0.22,0.01),detail:true},{k:'blazer',geo:new THREE.CapsuleGeometry(0.19,0.4,3,10),detail:true},
    {k:'cup',geo:new THREE.CylinderGeometry(0.04,0.035,0.09,8),detail:true},{k:'phone',geo:new THREE.BoxGeometry(0.05,0.11,0.015),detail:true}],[])
  const face=useMemo(()=>faceTex(),[]),mats=useMemo(()=>({std:new THREE.MeshStandardMaterial({color:'#fff',roughness:0.78}),head:new THREE.MeshStandardMaterial({color:'#fff',roughness:0.6,map:face}),basic:new THREE.MeshBasicMaterial({color:'#fff'})}),[face])
  const mesh=useRef<Record<string,THREE.InstancedMesh>>({}),sig=useRef<Record<string,string>>({}),ring=useRef<THREE.Mesh>(null!),hov=useRef<string|null>(null),[,setH]=useState(0)
  const setRef=(k:string)=>(el:THREE.InstancedMesh|null)=>{ if(el){mesh.current[k]=el;el.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,0),80);el.frustumCulled=false;el.count=0} }
  const camPos=useRef<THREE.Vector3[]>(CAMS.map(c=>new THREE.Vector3(c.pos[0],c.pos[1],c.pos[2])))
  useFrame(({clock,camera})=>{
    const o=useOffice.getState(),t=clock.elapsedTime,M=mesh.current; if(!M.legs)return
    const focus=!!o.focusCam, cams=focus?[camera.position]:camPos.current, near2=(perf.near+10)**2
    const cnt:Record<string,number>={}; for(const p of parts)cnt[p.k]=0
    const put=(k:string,m:THREE.Matrix4,color?:string)=>{ const n=cnt[k]++; const im=M[k]; im.setMatrixAt(n,m); if(color)im.setColorAt(n,C(color)) }
    ids.forEach((id,i)=>{
      const P=o.people[id]; if(!P)return; if(glbActive.has(id)){_m.makeScale(0,0,0);for(const k of ['torso','head','hair','dot'])M[k].setMatrixAt(i,_m);for(const k of ['legs','shoes','arms']){M[k].setMatrixAt(2*i,_m);M[k].setMatrixAt(2*i+1,_m)};return}; const w=ensureWorld(id),st=P.state,s=seat(id),ak=archOf(P),A=ARCH[ak],H=hash(id)
      const atHome=Math.hypot(w.x-s.x,w.z-s.z)<0.2,sit=!w.moving&&st!=='WALKING'&&(w.pose?w.pose==='sit':(s.sit&&atHome))
      const ph=(H%100)/16,tt=t+ph,by=sit?-0.4:Math.sin(tt*1.5)*0.004,sw=w.moving?Math.sin(tt*8)*0.6:0
      let a=w.moving?-sw*0.8:0,b=w.moving?sw*0.8:0,hx=0
      if(!w.moving){ if(st==='TYPING'||st==='WORKING'){a=-1.0+Math.sin(tt*14)*0.12;b=-1.0+Math.cos(tt*13)*0.12;hx=0.22} else if(st==='READING'){a=-0.9;b=-0.9;hx=0.28}
        else if(st==='TALKING'||st==='MEETING'){a=-0.6+Math.sin(tt*4)*0.4;b=-0.25+Math.sin(tt*3)*0.15;hx=Math.sin(tt*2)*0.05} else if(st==='CALLING'){a=-2.4;b=-0.1} else if(st==='BREAK'){const sip=Math.sin(tt*0.9)>0.6;b=-1.3-(sip?0.8:0);a=-0.25;hx=sip?-0.15:0} }
      const sc=A.height*(P.build||1),wd=A.width*(P.build||1)
      _e.set(0,w.ry,0);_q.setFromEuler(_e);_v.set(w.x,by,w.z);_s.set(wd,sc,wd);root.compose(_v,_q,_s)
      const sig0=`${P.shirt}|${P.skin}|${P.hair}|${ak}|${P.glasses}|${P.beard}`,fresh=sig.current[id]!==sig0
      const shirt=P.shirt||'#4b5a4a',skin=P.skin||'#c99772',hair=P.hair||'#1b1512',pants=PANTS[H%PANTS.length]
      const legA=sit?-1.5:sw,legB=sit?-1.5:-sw
      limb(_m,root,-0.09,0.9,0,legA,0,-0.4,0);M.legs.setMatrixAt(2*i,_m);limb(_m,root,0.09,0.9,0,legB,0,-0.4,0);M.legs.setMatrixAt(2*i+1,_m)
      limb(_m,root,-0.09,0.9,0,legA,0,-0.83,0.05);M.shoes.setMatrixAt(2*i,_m);limb(_m,root,0.09,0.9,0,legB,0,-0.83,0.05);M.shoes.setMatrixAt(2*i+1,_m)
      limb(_m,root,0,1.2,0,0,0,0,0,A.female?0.9:1,1,A.female?0.9:1);M.torso.setMatrixAt(i,_m)
      limb(_m,root,-0.25,1.42,0,a,0,-0.28,0);M.arms.setMatrixAt(2*i,_m);limb(_m,root,0.25,1.42,0,b,0,-0.28,0);M.arms.setMatrixAt(2*i+1,_m)
      headM.copy(root);limb(headM,root,0,1.5,0,hx,0,0,0)
      limb(_m,headM,0,0,0,0,0,0.1,0);M.head.setMatrixAt(i,_m); limb(_m,headM,0,0,0,0,0,0.16,-0.01);M.hair.setMatrixAt(i,_m)
      limb(_m,root,0,2.15,0,0,0,0,0);M.dot.setMatrixAt(i,_m)
      if(fresh){ sig.current[id]=sig0; for(const j of [0,1]){M.legs.setColorAt(2*i+j,C(pants));M.shoes.setColorAt(2*i+j,C('#111214'));M.arms.setColorAt(2*i+j,C(shirt))};M.torso.setColorAt(i,C(shirt));M.head.setColorAt(i,C(skin));M.hair.setColorAt(i,C(hair)); M.legs.instanceColor!.needsUpdate=true }
      M.dot.setColorAt(i,C(STATUS[P.presence]||'#6b7280'))
      // ---- detail parts: only for nearby characters (compacted → real LOD) ----
      let d2=1e9;for(const c of cams)d2=Math.min(d2,(c.x-w.x)**2+(c.y-1.4)**2+(c.z-w.z)**2); if(d2>near2)return
      limb(_m,root,-0.25,1.42,0,a,0,-0.58,0);put('hands',_m,skin);limb(_m,root,0.25,1.42,0,b,0,-0.58,0);put('hands',_m,skin)
      limb(_m,root,0,1.5,0,0,0,0,0);put('neck',_m,skin)
      if(A.hair==='long'||A.hair==='exec'){limb(_m,headM,0,0,0,0,0,0.04,-0.08);put('longhair',_m,hair)} if(A.hair==='bun'){limb(_m,headM,0,0,0,0,0,0.27,-0.05);put('bun',_m,hair)}
      if(P.glasses){limb(_m,headM,0,0,0,0,0,0.11,0.11);put('glasses',_m,'#16181c')} if(P.beard||(A.beard&&H%2===0)){limb(_m,headM,0,0,0,0,0,0.03,0.07);put('beard',_m,hair)}
      if(P.isManager){limb(_m,root,0,1.2,0,0,0,0,0,0.93,1.02,0.93);put('blazer',_m,'#1b2a4a')} else if(!A.female&&H%3===0){limb(_m,root,0,1.32,0.175,0,0,0,0);put('tie',_m,TIES[H%TIES.length])} else if(H%3===1){limb(_m,root,0.1,1.3,0.172,0,0,0,0);put('badge',_m,'#f2f2f2')}
      if(st==='BREAK'){limb(_m,root,0.25,1.42,0,b,0,-0.62,0.06);put('cup',_m,'#f1f1f1')} if(st==='CALLING'){limb(_m,root,-0.25,1.42,0,a,0,-0.5,0.04);put('phone',_m,'#0b0b0c')}
    })
    for(const p of parts){const im=M[p.k];im.count=p.detail?cnt[p.k]:p.pair?ids.length*2:ids.length;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true}
    // selection ring
    const sel=o.selected&&world[o.selected]; if(ring.current){ring.current.visible=!!sel;if(sel)ring.current.position.set(world[o.selected!].x,0.03,world[o.selected!].z)}
  })
  const pickH=(e:any)=>{e.stopPropagation();if(player.dragged)return;const id=ids[e.object===mesh.current.legs?e.instanceId>>1:e.instanceId];if(id)useOffice.getState().set({selected:id,chatWith:null})}
  const over=(e:any)=>{hov.current=ids[e.object===mesh.current.legs?e.instanceId>>1:e.instanceId]||null;document.body.style.cursor='pointer'}
  return <group>
    {parts.map(p=><instancedMesh key={p.k} ref={setRef(p.k)} args={[p.geo,p.basic?mats.basic:p.map?mats.head:mats.std,p.pair?MAX*2:MAX]} castShadow={!!p.shadow&&perf.shadows} onClick={p.pick?pickH:undefined} onPointerOver={p.pick?over:undefined} onPointerOut={p.pick?()=>{document.body.style.cursor='';hov.current=null}:undefined} raycast={p.pick?undefined:(()=>null) as any}/>)}
    <mesh ref={ring} rotation={[-Math.PI/2,0,0]} visible={false}><ringGeometry args={[0.36,0.44,32]}/><meshBasicMaterial color="#3b82f6" transparent opacity={0.95}/></mesh>
  </group>
}
function Tag({id}:{id:string}){
  const g=useRef<THREE.Group>(null!),p=useOffice(s=>s.people[id]),sel=useOffice(s=>s.selected===id),labels=useOffice(s=>s.settings.showNames),mood=useOffice(s=>moodKey(s.people[id],s.tasks))
  useFrame(()=>{const w=world[id];if(w&&g.current)g.current.position.set(w.x,0,w.z)})
  if(!p)return null; const [lab,colr]=mood.split('|')
  return <group ref={g}><Html position={[0,2.0,0]} center zIndexRange={[4,0]} style={{pointerEvents:'none'}}><div className="tag"><i className={p.presence==='online'?'blink':''} style={{background:STATUS[p.presence]}}/>{(sel||labels)&&<span>{p.name}</span>}{lab&&<em style={{color:colr}}>{lab}</em>}{p.state==='CALLING'&&<b>📞</b>}</div></Html></group>
}
function Bubble({id}:{id:string}){ const g=useRef<THREE.Group>(null!),t=useOffice(s=>s.bubbles[id]?.text); useFrame(()=>{const w=world[id];if(w&&g.current)g.current.position.set(w.x,0,w.z)}); return t?<group ref={g}><Html position={[0,2.45,0]} center zIndexRange={[6,0]} style={{pointerEvents:'none'}}><div className="bubble">{t}</div></Html></group>:null }
/** DOM tags/bubbles only exist in focus / Free Walk and only for the ~10 nearest people (DOM updates every frame are expensive). */
export function CrowdLabels(){
  const focus=useOffice(s=>!!s.focusCam),bub=useOffice(s=>Object.keys(s.bubbles).join(',')),[ids,setIds]=useState<string[]>([]),last=useRef(0)
  useFrame(({camera,clock})=>{ if(clock.elapsedTime-last.current<0.3)return;last.current=clock.elapsedTime;const o=useOffice.getState()
    if(!o.focusCam){if(ids.length)setIds([]);return}
    const d=Object.keys(o.people).filter(id=>world[id]).map(id=>({id,d:Math.hypot(world[id].x-camera.position.x,world[id].z-camera.position.z)})).filter(x=>x.d<perf.near+6).sort((a,b)=>a.d-b.d).slice(0,10).map(x=>x.id)
    if(o.selected&&!d.includes(o.selected))d.push(o.selected); if(d.join()!==ids.join())setIds(d) })
  if(!focus)return null
  return <>{ids.map(id=><Tag key={id} id={id}/>)}{bub.split(',').filter(Boolean).map(id=><Bubble key={id} id={id}/>)}</>
}
