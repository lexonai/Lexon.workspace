'use client'
import { useEffect, useState } from 'react'
import { ARCH_URL } from './loaders'
const cache:Record<string,boolean>={}
/** which character GLBs exist in /public/models/humans (m1,m2,f1,f2,mgr) — HEAD-checked once, cached */
export function useGlbAvail(){
  const [a,setA]=useState<Record<string,boolean>>({...cache})
  useEffect(()=>{ let on=true; Promise.all(['m1','m2','f1','f2','mgr'].map(async k=>{ if(k in cache)return; try{const r=await fetch(ARCH_URL(k),{method:'HEAD'});cache[k]=r.ok&&!(r.headers.get('content-type')||'').includes('text/html')}catch{cache[k]=false} })).then(()=>on&&setA({...cache})); return()=>{on=false} },[])
  return a
}
