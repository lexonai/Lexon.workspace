'use client'
/** embed=1 → hides header/brand; embed=bare → also hides the Office nav (host app drives navigation). Remembered for the session. */
export function embedMode():''|'1'|'bare'{
  if(typeof window==='undefined')return ''
  const q=new URLSearchParams(location.search).get('embed'); if(q==='0'){sessionStorage.removeItem('office.embed');return ''}
  if(q){sessionStorage.setItem('office.embed',q==='bare'?'bare':'1')}
  const v=sessionStorage.getItem('office.embed'); if(v==='bare')return 'bare'; if(v||window.parent!==window)return '1'; return ''
}

/** Seamless hosting: a host backend can mint a token via POST /api/sso and open Office with ?officeToken=…(&officeApi=…). Stored locally and removed from the URL. */
export function ingestAuth(){
  if(typeof window==='undefined')return; const q=new URLSearchParams(location.search),t=q.get('officeToken'); if(!t)return
  localStorage.setItem('office.token',t); localStorage.setItem('office.api',(q.get('officeApi')||location.origin).replace(/\/$/,''))
  q.delete('officeToken');q.delete('officeApi'); history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash)
}
