'use client'
import { useEffect, useState } from 'react'
const cache=new Map<string,boolean>()
/** Returns the url only if the GLB exists in /public (so procedural fallbacks work with no assets). */
export function useModelUrl(url:string){
  const [ok,setOk]=useState<boolean>(cache.get(url)??false)
  useEffect(()=>{ if(cache.has(url)){setOk(cache.get(url)!);return}
    fetch(url,{method:'HEAD'}).then(r=>{const good=r.ok&&!(r.headers.get('content-type')||'').includes('text/html');cache.set(url,good);setOk(good)}).catch(()=>cache.set(url,false)) },[url])
  return ok?url:null
}
