'use client'
import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOffice } from '@/store/officeStore'
import { world, seat } from '@/3d/world'
const W=320,H=200
function drawScreen(c:CanvasRenderingContext2D,app:string,on:boolean,t:number,loading:number,notify:string){
  const r=(x:number,y:number,w:number,h:number,col:string)=>{c.fillStyle=col;c.fillRect(x,y,w,h)}
  r(0,0,W,H,on?'#15171b':'#040405'); if(!on){return}
  r(0,0,W,16,'#23262c'); c.fillStyle='#e5e7eb'; c.font='10px sans-serif'; c.fillText(app,8,11); r(W-40,5,6,6,'#ef4444');r(W-28,5,6,6,'#f5c542');r(W-16,5,6,6,'#3ddc84')
  const i=Math.floor(t*3)
  if(loading>0){ r(80,90,160,6,'#2a2d34'); r(80,90,160*(1-loading),6,'#3b82f6'); c.fillStyle='#9aa0a8'; c.fillText('Opening '+app+'…',100,80); return }
  if(app==='VS Code'){ r(0,16,34,H-16,'#1b1d22'); r(34,16,70,H-16,'#1e2026'); r(104,16,90,14,'#272a31'); r(104,30,W-104,H-30,'#17191d')
    for(let k=0;k<11;k++){ r(112,38+k*13,16+((k*37+i)%70),5,['#7aa2f7','#9ece6a','#e0af68','#c0caf5'][k%4]); r(112+22+((k*29)%40),38+k*13,30+((k*11)%60),5,'#565f89') }
    r(104,H-34,W-104,34,'#101215'); c.fillStyle='#3ddc84'; c.fillText('$ npm run dev',112,H-18) }
  else if(app==='YouTube Studio'){ r(0,16,50,H-16,'#1c1e23'); r(58,26,60,38,'#23262c'); r(124,26,60,38,'#23262c'); r(190,26,60,38,'#23262c'); c.fillStyle='#e5e7eb'; c.font='13px sans-serif'; c.fillText('12.4K',66,50); c.fillText('842',132,50); c.fillText('6.1%',198,50); c.font='10px sans-serif'
    c.strokeStyle='#ef4444'; c.beginPath(); for(let k=0;k<20;k++){const y=150-Math.sin(k*0.5+t)*20-k*2; k?c.lineTo(60+k*12,y):c.moveTo(60,y)} c.stroke(); r(60,170,190,1,'#3a3e46') }
  else if(app==='Image Editor'||app==='Lexon Motion'){ const mo=app==='Lexon Motion'; r(0,16,30,H-16,'#1c1e23'); r(W-70,16,70,H-16,'#1c1e23'); r(40,24,W-120,100,'#0f1012'); r(70,40,mo?150:120,70,mo?'#2c4a7a':'#6b7280'); r(100,52,70,46,mo?'#3b82f6':'#9ca3af')
    for(let k=0;k<4;k++)r(W-62,28+k*16,54,10,'#2a2d34')
    if(mo){ for(let k=0;k<3;k++){ r(40,134+k*16,W-120,12,'#1f2228'); r(46+k*30,136+k*16,70+k*20,8,['#3b82f6','#8b5cf6','#10b981'][k]) } r(46+((t*25)%190),130,2,52,'#f5c542') } else { r(40,134,W-120,50,'#1f2228'); for(let k=0;k<5;k++)r(48+k*44,142,34,34,['#c97b4a','#7a8cc9','#7ac98c','#c9c07a','#b07ac9'][k]) } }
  else if(app==='Docs · Script'){ r(60,24,W-120,H-34,'#e5e7eb'); for(let k=0;k<12;k++){ r(72,36+k*13,60+((k*53+i*3)%110),4,'#374151') } }
  else { r(0,16,W,22,'#1f2228'); r(8,20,W-60,14,'#2b2f36'); c.fillStyle='#9aa0a8'; c.fillText('lexon.workspace/tasks',14,31)
    for(let k=0;k<4;k++){ r(16,50+k*34,W-32,28,'#1c1e23'); r(24,58+k*34,70+((k*47)%80),5,'#d1d5db'); r(24,68+k*34,40+((k*31)%60),4,'#6b7280'); r(W-60,58+k*34,32,8,k%2?'#f5c542':'#3ddc84') } }
  if(Math.floor(t*2)%2===0){ r(24+((t*13)%240),44+((t*7)%110),3,9,'#fff') }
  if(notify){ r(W-130,H-44,122,34,'#0b0c0e'); c.fillStyle='#e5e7eb'; c.fillText(notify,W-122,H-24) }
}
const COLS=6,ROWS=6,CW=256,CH=160
const A:{c:HTMLCanvasElement|null;x:CanvasRenderingContext2D|null;tex:THREE.CanvasTexture|null;mat:THREE.MeshBasicMaterial|null;cells:Map<string,number>;geo:Map<number,THREE.PlaneGeometry>;cur:Map<string,{app:string;since:number}>}={c:null,x:null,tex:null,mat:null,cells:new Map(),geo:new Map(),cur:new Map()}
function atlas(){ if(!A.c){const c=document.createElement('canvas');c.width=COLS*CW;c.height=ROWS*CH;A.c=c;A.x=c.getContext('2d')!;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.generateMipmaps=false;t.minFilter=THREE.LinearFilter;A.tex=t;A.mat=new THREE.MeshBasicMaterial({map:t})} return A }
const cellOf=(id:string)=>{let i=A.cells.get(id);if(i===undefined){i=A.cells.size%(COLS*ROWS);A.cells.set(id,i)}return i}
function cellGeo(i:number){ let g=A.geo.get(i); if(!g){g=new THREE.PlaneGeometry(0.52,0.325);const uv=g.attributes.uv as THREE.BufferAttribute,u0=(i%COLS)/COLS,v0=1-(Math.floor(i/COLS)+1)/ROWS;for(let k=0;k<uv.count;k++)uv.setXY(k,u0+uv.getX(k)/COLS,v0+uv.getY(k)/ROWS);A.geo.set(i,g)} return g }
/** One shared atlas texture for every monitor (one upload instead of 28). */
export function Screen({id}:{id:string}){ const a=atlas(),i=useMemo(()=>cellOf(id),[id]); return <mesh position={[0,0.3,0.026]} geometry={cellGeo(i)} material={a.mat!}/> }
export function ScreenUpdater(){
  const last=useRef(0)
  useFrame(({clock})=>{
    if(clock.elapsedTime-last.current<0.4)return; last.current=clock.elapsedTime; const a=atlas(),o=useOffice.getState(),t=clock.elapsedTime
    for(const [id,i] of a.cells){ const p=o.people[id],w=world[id]; if(!p||!w)continue; const s=seat(id),atDesk=Math.hypot(w.x-s.x,w.z-s.z)<0.2
      const app=p.state==='READING'?'Chrome':p.app; let cur=a.cur.get(id); if(!cur||cur.app!==app){cur={app,since:t};a.cur.set(id,cur)}
      const loading=Math.max(0,1-(t-cur.since)/1.2),notify=(p.state==='TALKING'||p.state==='CALLING')?'● New message':''
      const x=a.x!;x.save();x.beginPath();x.rect((i%COLS)*CW,Math.floor(i/COLS)*CH,CW,CH);x.clip();x.translate((i%COLS)*CW,Math.floor(i/COLS)*CH);x.scale(CW/320,CH/200);drawScreen(x,app,atDesk&&!!p.app,t,loading,notify);x.restore() }
    a.tex!.needsUpdate=true })
  return null
}
