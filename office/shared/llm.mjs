// Research helpers only (no AI keys here — keys never leave the server).
const clean=s=>String(s||'').replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&')
export async function webSearch(k,q,f=fetch){
  try{
    if(k.tavily){const r=await f('https://api.tavily.com/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:k.tavily,query:q,max_results:6})});const j=await r.json();return (j.results||[]).map(x=>({title:x.title,url:x.url,snippet:clean(x.content).slice(0,300)}))}
    if(k.brave){const r=await f(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6`,{headers:{'X-Subscription-Token':k.brave,accept:'application/json'}});const j=await r.json();return (j.web?.results||[]).map(x=>({title:x.title,url:x.url,snippet:clean(x.description).slice(0,300)}))}
    const r=await f(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=6&srsearch=${encodeURIComponent(q)}`);const j=await r.json()
    return (j.query?.search||[]).map(x=>({title:x.title,url:`https://en.wikipedia.org/wiki/${encodeURIComponent(x.title.replace(/ /g,'_'))}`,snippet:clean(x.snippet)}))
  }catch{return[]}
}
export async function ytSearch(key,q,f=fetch){
  if(!key)return[]
  try{const r=await f(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&order=viewCount&q=${encodeURIComponent(q)}&key=${key}`);const j=await r.json()
    return (j.items||[]).map(x=>({title:x.snippet.title,url:`https://www.youtube.com/watch?v=${x.id.videoId}`,snippet:`${x.snippet.channelTitle} · YouTube`}))}catch{return[]}
}
