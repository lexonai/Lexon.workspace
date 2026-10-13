/** 4 base characters (2 male m1/m2, 2 female f1/f2) + a unique manager. Everyone else is an instance with variation (colours, build, accessories). */
export const ARCH:Record<string,{hair:'short'|'side'|'long'|'bun'|'exec';height:number;width:number;female:boolean;beard?:boolean}>={
  m1:{hair:'short',height:1.0,width:1.0,female:false},
  m2:{hair:'side',height:1.035,width:1.06,female:false,beard:true},
  f1:{hair:'long',height:0.955,width:0.9,female:true},
  f2:{hair:'bun',height:0.975,width:0.92,female:true},
  mgr:{hair:'exec',height:0.985,width:0.93,female:true},
}
export const PANTS=['#22252c','#2d3340','#3a3a42','#4a4036','#1f2a3a','#35383f']
export const TIES=['#7a1f2b','#1f4a7a','#2b6b4a','#6b5a1f','#4a2b6b']
export const archOf=(p:any)=>ARCH[p?.arch]?p.arch:(p?.isManager?'mgr':p?.gender==='female'?'f1':'m1')
