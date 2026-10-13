import { world } from './world'
import { planPath } from './layout'
/** Walks a person toward (tx,tz) along door/corridor waypoints (so nobody walks through walls). Returns true on arrival. */
export function moveTo(id:string,tx:number,tz:number,dt:number,finalRy?:number,speed=1.9){
  const w=world[id]; if(!w)return true
  if(w.gx!==tx||w.gz!==tz||!w.path){w.gx=tx;w.gz=tz;w.path=planPath(w.x,w.z,tx,tz)}
  const wp=w.path[0],dx=wp.x-w.x,dz=wp.z-w.z,d=Math.hypot(dx,dz),last=w.path.length===1
  if(d<0.08){ if(last){w.moving=false;w.x=wp.x;w.z=wp.z;if(finalRy!==undefined)w.ry=finalRy;w.path=undefined;w.gx=undefined;return true} w.path.shift();return false }
  const sp=Math.min(d,speed*dt);w.x+=dx/d*sp;w.z+=dz/d*sp;w.moving=true
  let diff=Math.atan2(dx,dz)-w.ry;diff=Math.atan2(Math.sin(diff),Math.cos(diff));w.ry+=diff*Math.min(1,dt*8);return false
}
