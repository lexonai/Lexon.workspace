'use client'
import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { ROOMS } from '@/config/office.config'
import { DOORS } from '../layout'
import { buildWalls } from './walls'
import { floorTexture } from '../textures'
import { useOffice } from '@/store/officeStore'
const KIND:Record<string,'wood'|'carpet'>={meeting:'wood',break:'wood'}
function Sign({pos,rotY=0,w,h,bg,lines,fg='#fff',size=26,glow}:{pos:[number,number,number];rotY?:number;w:number;h:number;bg:string;lines:string[];fg?:string;size?:number;glow?:string}){
  const tex=useMemo(()=>{const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*h/w);const x=c.getContext('2d')!;x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);x.fillStyle=fg;x.font=`600 ${size}px Inter,sans-serif`;x.textAlign='center';lines.forEach((l,i)=>x.fillText(l,256,c.height/2+(i-(lines.length-1)/2)*(size+8)+size/3));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t},[])
  return <group position={pos} rotation={[0,rotY,0]}><mesh><boxGeometry args={[w+0.08,h+0.08,0.04]}/><meshStandardMaterial color="#1c1e23"/></mesh><mesh position={[0,0,0.025]}><planeGeometry args={[w,h]}/><meshBasicMaterial map={tex}/></mesh>{glow&&<pointLight position={[0,0,0.6]} intensity={1.2} distance={4} color={glow}/>}</group>
}
const W=640,H=360
function drawInfo(c:CanvasRenderingContext2D,title:string,room:string,t:number){
  const o=useOffice.getState(); c.fillStyle='#0a1630';c.fillRect(0,0,W,H);const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#10285a');g.addColorStop(1,'#050a18');c.fillStyle=g;c.fillRect(0,0,W,H)
  c.fillStyle='#e8eaed';c.font='700 34px Inter,sans-serif';c.fillText(title,28,52);c.fillStyle='#7aa7ff';c.font='14px Inter,sans-serif';c.fillText('LEXON OFFICE · '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),28,76)
  const rc=o.busyIds.length>8||o.meetingRoom===room; if(rc){c.fillStyle='#3ddc84';c.font='600 16px Inter,sans-serif';c.fillText('● Team meeting in progress',28,106)}
  const tasks=o.tasks.filter((x:any)=>x.status!=='done').slice(0,4); c.font='15px Inter,sans-serif'
  if(!tasks.length){c.fillStyle='#8b919b';c.fillText('No active tasks',28,150)}
  tasks.forEach((x:any,i:number)=>{const y=140+i*50;c.fillStyle='#cfd6e0';c.fillText(String(x.title).slice(0,52),28,y);c.fillStyle='#1c2640';c.fillRect(28,y+10,W-90,8);c.fillStyle='#3b82f6';c.fillRect(28,y+10,(W-90)*Math.min(1,x.progress/100),8);c.fillStyle='#8b919b';c.fillText(x.progress+'%',W-52,y+18)})
  c.fillStyle='#8b919b';c.font='13px Inter,sans-serif';c.fillText(`${Object.values(o.people).filter((p:any)=>p.presence==='online').length} online · ${o.tasks.filter((x:any)=>x.status!=='done').length} open tasks`,28,H-24)
}
function InfoDisplay({pos,rotY,room,title}:{pos:[number,number,number];rotY:number;room:string;title:string}){
  const {tex,ctx}=useMemo(()=>{const c=document.createElement('canvas');c.width=W;c.height=H;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return {tex:t,ctx:c.getContext('2d')!}},[]); const last=useRef(0)
  useFrame(({clock})=>{ if(clock.elapsedTime-last.current<1)return; last.current=clock.elapsedTime; drawInfo(ctx,title,room,clock.elapsedTime); tex.needsUpdate=true })
  return <group position={pos} rotation={[0,rotY,0]}><mesh><boxGeometry args={[3.8,2.2,0.06]}/><meshStandardMaterial color="#0b0c0e"/></mesh><mesh position={[0,0,0.04]}><planeGeometry args={[3.7,2.08]}/><meshBasicMaterial map={tex}/></mesh></group>
}
const Box=({p,s,c,r=0.7,m=0}:{p:[number,number,number];s:[number,number,number];c:string;r?:number;m?:number})=><mesh position={p} castShadow receiveShadow><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={r} metalness={m}/></mesh>
function Walls(){ const g=useMemo(()=>buildWalls(),[]); return <group><mesh geometry={g.solid} castShadow receiveShadow><meshStandardMaterial color="#d3d7de" roughness={0.9}/></mesh><mesh geometry={g.base}><meshStandardMaterial color="#3a3e46"/></mesh><mesh geometry={g.caps}><meshStandardMaterial color="#20232a" roughness={0.6}/></mesh><mesh geometry={g.glass}><meshStandardMaterial color="#9fb4c8" transparent opacity={0.16} roughness={0.05} depthWrite={false}/></mesh></group> }
export function Building(){
  const focus=useOffice(s=>!!s.focusCam)
  return <group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.03,0]} receiveShadow><planeGeometry args={[140,90]}/><meshStandardMaterial color="#0d0e10"/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.012,-1]} receiveShadow><planeGeometry args={[46.8,3]}/><meshStandardMaterial color="#555a63" roughness={0.9}/></mesh>
    {Array.from({length:9}).map((_,i)=><mesh key={i} rotation={[-Math.PI/2,0,0]} position={[-20+i*5,0.02,-1]}><planeGeometry args={[1.6,0.07]}/><meshBasicMaterial color="#7aa7ff" transparent opacity={0.45}/></mesh>)}
    {ROOMS.map(r=><RoomFloor key={r.id} r={r}/>)}
    <Walls/>
    {DOORS.map((d,i)=>{const top=d.inn[1]<0;return <mesh key={i} position={[d.x+1.5,1.0,top?-2.05:0.05]} rotation={[0,Math.PI/2.4,0]} castShadow><boxGeometry args={[0.9,2.0,0.05]}/><meshStandardMaterial color="#b98a55" roughness={0.6}/></mesh>})}
    {/* signs & boards */}
    <Sign pos={[-17.6,1.6,-10.38]} w={3} h={1.2} bg="#f4f5f7" fg="#2b2f36" size={22} lines={['Sprint board','Todo · Doing · Done']}/>
    <Sign pos={[-8.2,1.7,-10.38]} w={1.2} h={0.8} bg="#d92d2d" size={24} lines={['▶ YouTube']} glow="#ff6a6a"/>
    <Sign pos={[-3.4,1.6,-10.38]} w={1.6} h={1.1} bg="#111317" size={22} lines={['Create','Record','Grow']}/>
    <Sign pos={[3.2,1.6,-10.38]} w={2.4} h={1.1} bg="#f4f5f7" fg="#2b2f36" size={22} lines={['Ideas','Content','Impact']}/>
    <Sign pos={[8.6,1.6,-10.38]} w={1.8} h={1.2} bg="#111317" size={20} lines={['Good Content','Builds Brands']}/>
    <Sign pos={[17.6,1.6,-10.38]} w={2.6} h={1.1} bg="#f4f5f7" fg="#2b2f36" size={22} lines={['Strategy','Q4 roadmap']}/>
    <InfoDisplay pos={[23.28,1.5,-6.5]} rotY={-Math.PI/2} room="conference" title="Conference"/>
    <InfoDisplay pos={[-23.28,1.5,4.5]} rotY={Math.PI/2} room="meeting" title="Better Together"/>
    {/* tables */}
    <Box p={[17.6,0.75,-6.5]} s={[5.4,0.08,1.8]} c="#9a6b3f" r={0.45}/><Box p={[17.6,0.37,-6.5]} s={[0.5,0.74,0.5]} c="#2a2d33"/>
    <Box p={[-17.6,0.75,4.5]} s={[4.4,0.08,1.6]} c="#a8764a" r={0.45}/><Box p={[-17.6,0.37,4.5]} s={[0.5,0.74,0.5]} c="#2a2d33"/>
    {/* break area */}
    <Box p={[18.2,0.45,1.2]} s={[10,0.9,0.9]} c="#2a2d33"/><Box p={[18.2,0.92,1.2]} s={[10,0.05,0.95]} c="#cfd2d8" r={0.3}/><Box p={[22.7,1.0,2.2]} s={[1.0,2.0,0.9]} c="#b9bdc4" r={0.3} m={0.5}/>
    <Box p={[14.0,1.13,1.0]} s={[0.4,0.42,0.35]} c="#16181b"/><mesh position={[14.0,1.2,1.2]}><boxGeometry args={[0.1,0.05,0.02]}/><meshBasicMaterial color="#ffcf6a"/></mesh><pointLight position={[14,1.6,1.4]} intensity={2} distance={3} color="#ffcf8a"/>
    <mesh position={[17.0,0.7,4.4]} castShadow><cylinderGeometry args={[0.8,0.8,0.05,24]}/><meshStandardMaterial color="#b88650" roughness={0.5}/></mesh><mesh position={[17.0,0.35,4.4]}><cylinderGeometry args={[0.07,0.07,0.7]}/><meshStandardMaterial color="#222"/></mesh>
    <Box p={[21.0,0.3,7.9]} s={[3.2,0.6,1.0]} c="#4a4a52" r={0.9}/><Box p={[21.0,0.8,8.2]} s={[3.2,0.6,0.15]} c="#4a4a52" r={0.9}/>
    {[19.6,20.6,21.6].map(x=><mesh key={x} position={[x,0.4,2.3]}><cylinderGeometry args={[0.18,0.18,0.8]}/><meshStandardMaterial color="#f5c542"/></mesh>)}
    {/* main floor extras */}
    <Box p={[-10.8,0.6,1.3]} s={[0.7,1.2,0.6]} c="#25282e"/><Box p={[10.8,0.45,1.3]} s={[0.9,0.9,0.6]} c="#c9ccd2"/>
    {focus&&ROOMS.map(r=><Html key={r.id} position={[r.x-r.w/2+1.2,r.z<0?2.3:1.2,r.z-r.d/2+0.4]} zIndexRange={[5,0]} style={{pointerEvents:'none'}}><div className="rlabel">{r.name}</div></Html>)}
  </group>
}
function RoomFloor({r}:{r:typeof ROOMS[number]}){ const k=KIND[r.id]||'carpet',tex=useMemo(()=>floorTexture(k,r.w,r.d),[k]); return <mesh rotation={[-Math.PI/2,0,0]} position={[r.x,0.01,r.z]} receiveShadow><planeGeometry args={[r.w-0.1,r.d-0.1]}/><meshStandardMaterial map={tex} color={k==='wood'?'#ffffff':'#8d929b'} roughness={k==='wood'?0.45:0.95}/></mesh> }
