'use client'
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useOffice } from '@/store/officeStore'
import { player } from '@/3d/player'
import { blocked, roomAt } from '@/3d/layout'
/** Free Walk: you are a 3D character. WASD/arrows + on-screen joystick to move, drag to rotate the camera, wheel to zoom. Walls and furniture block you. */
export function PlayerRig(){
  const {camera,gl}=useThree(); const mode=useOffice(s=>s.mode)
  const g=useRef<THREE.Group>(null!),lL=useRef<THREE.Group>(null!),rL=useRef<THREE.Group>(null!),last=useRef(0)
  useEffect(()=>{
    if(mode!=='walk')return; const d=gl.domElement; let drag:{x:number;y:number}|null=null,moved=0
    const kd=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.tagName==='INPUT'||(e.target as HTMLElement)?.tagName==='TEXTAREA')return;player.keys.add(e.key.toLowerCase())},ku=(e:KeyboardEvent)=>player.keys.delete(e.key.toLowerCase())
    const pd=(e:PointerEvent)=>{player.dragged=false;moved=0;drag={x:e.clientX,y:e.clientY}},pm=(e:PointerEvent)=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};moved+=Math.abs(dx)+Math.abs(dy);if(moved>6)player.dragged=true;player.yaw-=dx*0.006;player.pitch=Math.max(0.05,Math.min(1.25,player.pitch+dy*0.004))},pu=()=>{drag=null}
    const wh=(e:WheelEvent)=>{player.dist=Math.max(1.6,Math.min(8,player.dist+e.deltaY*0.004))}
    window.addEventListener('keydown',kd);window.addEventListener('keyup',ku);d.addEventListener('pointerdown',pd);window.addEventListener('pointermove',pm);window.addEventListener('pointerup',pu);d.addEventListener('wheel',wh,{passive:true})
    return()=>{window.removeEventListener('keydown',kd);window.removeEventListener('keyup',ku);d.removeEventListener('pointerdown',pd);window.removeEventListener('pointermove',pm);window.removeEventListener('pointerup',pu);d.removeEventListener('wheel',wh);player.keys.clear()}
  },[mode,gl])
  useFrame((st,dt0)=>{
    if(mode!=='walk')return; const dt=Math.min(dt0,0.1),k=player.keys
    let ix=(k.has('d')||k.has('arrowright')?1:0)-(k.has('a')||k.has('arrowleft')?1:0)+player.jx, iz=(k.has('w')||k.has('arrowup')?1:0)-(k.has('s')||k.has('arrowdown')?1:0)-player.jz
    const l=Math.hypot(ix,iz); if(l>1){ix/=l;iz/=l}
    const sp=(k.has('shift')?5.2:3.0)*dt, fx=Math.sin(player.yaw),fz=Math.cos(player.yaw), mx=(fx*iz+(-fz)*ix)*sp, mz=(fz*iz+fx*ix)*sp
    player.moving=l>0.05
    if(player.moving){ if(!blocked(player.x+mx,player.z))player.x+=mx; if(!blocked(player.x,player.z+mz))player.z+=mz
      let diff=Math.atan2(mx,mz)-player.ry;diff=Math.atan2(Math.sin(diff),Math.cos(diff));player.ry+=diff*Math.min(1,dt*10) }
    g.current.position.set(player.x,0,player.z);g.current.rotation.y=player.ry
    const sw=player.moving?Math.sin(st.clock.elapsedTime*9)*0.6:0;lL.current.rotation.x=sw;rL.current.rotation.x=-sw
    const tx=player.x,ty=1.45,tz=player.z,cd=player.dist,cp=player.pitch
    camera.position.set(tx-fx*cd*Math.cos(cp),ty+cd*Math.sin(cp),tz-fz*cd*Math.cos(cp)); camera.lookAt(tx,ty,tz)
    last.current+=dt; if(last.current>0.4){ last.current=0; const o=useOffice.getState(),r=roomAt(player.x,player.z)
      if(r!==o.playerRoom){ o.set({playerRoom:r})
        if((r==='conference'||r==='meeting')&&!o.callState&&!o.roomCallReq&&o.busyIds.length===0){ const ids=(Object.values(o.people) as any[]).filter(p=>!p.isManager&&p.presence==='online'&&!['CALLING'].includes(p.state)).slice(0,14).map(p=>p.id); o.set({meetingRoom:r}); o.roomCall(r,ids,true); o.log(`You entered the ${r} room — the team joined`,'people') }
        else if(o.meetingRoom&&r!==o.meetingRoom)o.set({meetingRoom:null}) } }
  })
  if(mode!=='walk')return null
  return <group ref={g}>
    <group ref={lL} position={[-0.09,0.9,0]}><mesh position={[0,-0.4,0]} castShadow><capsuleGeometry args={[0.08,0.65,4,8]}/><meshStandardMaterial color="#0d1220" roughness={0.6}/></mesh><mesh position={[0,-0.83,0.05]}><boxGeometry args={[0.11,0.07,0.23]}/><meshStandardMaterial color="#0a0a0c" roughness={0.3} metalness={0.4}/></mesh></group>
    <group ref={rL} position={[0.09,0.9,0]}><mesh position={[0,-0.4,0]} castShadow><capsuleGeometry args={[0.08,0.65,4,8]}/><meshStandardMaterial color="#0d1220" roughness={0.6}/></mesh><mesh position={[0,-0.83,0.05]}><boxGeometry args={[0.11,0.07,0.23]}/><meshStandardMaterial color="#0a0a0c" roughness={0.3} metalness={0.4}/></mesh></group>
    <mesh position={[0,1.2,0]} castShadow><capsuleGeometry args={[0.2,0.42,4,12]}/><meshStandardMaterial color="#10182b" roughness={0.55}/></mesh>
    <mesh position={[0,1.32,0.19]}><boxGeometry args={[0.12,0.3,0.01]}/><meshStandardMaterial color="#f2f3f5"/></mesh><mesh position={[0,1.3,0.197]}><boxGeometry args={[0.04,0.24,0.01]}/><meshStandardMaterial color="#c9a24a" roughness={0.3} metalness={0.8}/></mesh>
    {[-0.27,0.27].map(x=><group key={x} position={[x,1.42,0]} rotation={[-0.1,0,0]}><mesh position={[0,-0.28,0]} castShadow><capsuleGeometry args={[0.058,0.45,4,8]}/><meshStandardMaterial color="#10182b" roughness={0.55}/></mesh><mesh position={[0,-0.58,0]}><sphereGeometry args={[0.05,8,6]}/><meshStandardMaterial color="#c99772"/></mesh></group>)}
    <mesh position={[0.27,0.84,0]}><torusGeometry args={[0.05,0.012,6,12]}/><meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.25}/></mesh>
    <mesh position={[0,1.5,0]}><cylinderGeometry args={[0.04,0.045,0.08]}/><meshStandardMaterial color="#c99772"/></mesh>
    <mesh position={[0,1.6,0]} castShadow><sphereGeometry args={[0.12,18,14]}/><meshStandardMaterial color="#c99772" roughness={0.6}/></mesh>
    <mesh position={[0,1.67,-0.01]}><sphereGeometry args={[0.127,16,10,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#14100d"/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.03,0]}><ringGeometry args={[0.3,0.36,28]}/><meshBasicMaterial color="#c9a24a" transparent opacity={0.9}/></mesh>
    <Html position={[0,2.15,0]} center zIndexRange={[4,0]} style={{pointerEvents:'none'}}><div className="tag"><i style={{background:'#c9a24a'}}/><span>Admin · Owner</span></div></Html>
  </group>
}
