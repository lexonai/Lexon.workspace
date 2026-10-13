'use client'
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CAMS } from '@/config/office.config'
import { useOffice } from '@/store/officeStore'
import { previewCanvases, employeeCam } from './previewRegistry'
import { world } from '@/3d/world'
import { perf, profile } from '@/3d/perf'
const COLS=4,CW=480,CH=270
/**
 * Owns rendering (useFrame priority 1 disables R3F's own render).
 *  • CCTV grid: all 7 cameras are rendered EVERY frame into one atlas on the GPU and copied tile-by-tile with drawImage (no readPixels → no GPU stalls, no frame skipping).
 *  • Focus / Free Walk: one full-size render.  • Other pages: nothing is rendered (simulation keeps running).
 *  • Shadow map is refreshed on a schedule, not once per render call.
 */
export function RenderDirector(){
  const {gl,scene,size}=useThree()
  const cams=useMemo(()=>CAMS.map(c=>{const k=new THREE.PerspectiveCamera(50,16/9,0.1,300);k.position.set(c.pos[0],c.pos[1],c.pos[2]);k.lookAt(c.target[0],c.target[1],c.target[2]);k.updateMatrixWorld();return k}),[])
  const ec=useMemo(()=>new THREE.PerspectiveCamera(36,4/3,0.1,60),[])
  const ctxs=useRef(new Map<HTMLCanvasElement,CanvasRenderingContext2D>()),fr=useRef(0),ring=useRef<number[]>([]),last=useRef(0)
  useEffect(()=>{gl.info.autoReset=false;gl.shadowMap.autoUpdate=false;return()=>{gl.info.autoReset=true;gl.shadowMap.autoUpdate=true}},[gl])
  const ctx2d=(cv:HTMLCanvasElement)=>{let c=ctxs.current.get(cv);if(!c){c=cv.getContext('2d',{alpha:false})!;ctxs.current.set(cv,c)}return c}
  useFrame((st,dt)=>{
    const o=useOffice.getState(),focus=!!o.focusCam,t0=performance.now(),src=gl.domElement,pr=gl.getPixelRatio()
    gl.info.reset(); if(perf.shadowEvery>0&&(fr.current++%perf.shadowEvery===0))gl.shadowMap.needsUpdate=true
    const tiles=!focus&&previewCanvases.size>0, call=o.callState&&employeeCam.canvas
    const cell=(i:number,cw:number,ch:number)=>({x:(i%COLS)*cw,y:Math.floor(i/COLS)*ch})
    if(tiles||call){
      gl.setScissorTest(true); const cw=Math.round(CW*(focus?1:perf.tile)),ch=Math.round(CH*(focus?1:perf.tile)),H=size.height
      if(tiles)CAMS.forEach((c,i)=>{ const cv=previewCanvases.get(c.id); if(!cv)return; const {x,y}=cell(i,cw,ch)
        if(cv.width!==cw||cv.height!==ch){cv.width=cw;cv.height=ch}
        gl.setViewport(x,H-y-ch,cw,ch);gl.setScissor(x,H-y-ch,cw,ch);gl.render(scene,cams[i]); ctx2d(cv).drawImage(src,x*pr,y*pr,cw*pr,ch*pr,0,0,cw,ch) })
      if(call){ const w=world[o.callState!.id]; if(w){ const a=w.ry+0.8; ec.position.set(w.x+Math.sin(a)*1.7,1.62,w.z+Math.cos(a)*1.7); ec.lookAt(w.x,1.5,w.z); ec.updateMatrixWorld()
        const eh=focus?240:ch,ew=Math.round(eh*4/3),{x,y}=focus?{x:0,y:0}:cell(7,cw,ch); gl.setViewport(x,H-y-eh,ew,eh);gl.setScissor(x,H-y-eh,ew,eh);gl.render(scene,ec)
        const cv=employeeCam.canvas!; ctx2d(cv).drawImage(src,x*pr,y*pr,ew*pr,eh*pr,0,0,cv.width,cv.height) } }
      gl.setScissorTest(false)
    }
    if(focus){ gl.setScissorTest(false); gl.setViewport(0,0,size.width,size.height); gl.render(scene,st.camera) }
    // ---- profiler ----
    const submit=performance.now()-t0; profile.calls=gl.info.render.calls;profile.tris=gl.info.render.triangles;profile.geoms=gl.info.memory.geometries;profile.textures=gl.info.memory.textures;profile.submitMs=submit
    const ms=dt*1000; if(ms<500){ ring.current.push(ms); if(ring.current.length>120)ring.current.shift(); if(ms>33)profile.jank++; profile.frames++ }
    if(st.clock.elapsedTime-last.current>0.5){ last.current=st.clock.elapsedTime; const a=[...ring.current].sort((p,q)=>p-q); if(a.length){profile.avgMs=a.reduce((p,q)=>p+q,0)/a.length;profile.fps=1000/profile.avgMs;profile.p95Ms=a[Math.floor(a.length*0.95)];profile.maxMs=a[a.length-1]} }
  },1)
  return null
}
