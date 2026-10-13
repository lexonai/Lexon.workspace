export const SC:Record<string,string>={online:'#3ddc84',away:'#f5c542',busy:'#ef4444',offline:'#6b7280'}
export const ago=(t:number)=>new Date(t).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
export const initials=(n:string)=>n.split(' ').map(x=>x[0]).join('').slice(0,2)
export const PRI_COLOR:Record<string,string>={urgent:'#ef4444',high:'#f5c542',normal:'#8b9099',low:'#4b5563'}
export const STATUS_LABEL:Record<string,string>={queued:'Queued',blocked:'Needs input',working:'Working',review:'In review',done:'Done'}
