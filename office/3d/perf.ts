/** tile = CCTV tile render scale, shadowEvery = refresh the shadow map every N frames (0 = shadows off), near = detail distance for characters */
export const LEVELS=[{near:26,tile:1,shadowEvery:2,dpr:1.5,shadows:true},{near:18,tile:0.75,shadowEvery:3,dpr:1.1,shadows:true},{near:11,tile:0.55,shadowEvery:6,dpr:0.9,shadows:true},{near:7,tile:0.4,shadowEvery:0,dpr:0.7,shadows:false}]
export const perf={level:0,...LEVELS[0]}
export const applyLevel=(l:number)=>Object.assign(perf,LEVELS[Math.max(0,Math.min(3,l))],{level:l})
/** live numbers shown by the profiler HUD (Ctrl+Shift+P or Settings → Graphics) */
export const profile={fps:0,avgMs:0,p95Ms:0,maxMs:0,jank:0,calls:0,tris:0,geoms:0,textures:0,submitMs:0,frames:0}
