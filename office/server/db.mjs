// Storage layer: SQLite (better-sqlite3 → node:sqlite) with automatic JSON-file fallback. Same interface for all.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'
const COLS=[ // collection → [table, group column source, timestamp source, rows(state)]
 ['people','people',p=>p.dept,p=>0,s=>Object.values(s.people||{})],
 ['tasks','tasks',t=>t.status,t=>t.createdAt,s=>s.tasks||[]],
 ['messages','messages',m=>m.conv,m=>m.t,s=>Object.entries(s.messages||{}).flatMap(([c,l])=>l.map(m=>({...m,conv:c})))],
 ['activity','activity',a=>a.kind,a=>a.t,s=>s.activity||[]],
 ['notifications','notifications',n=>n.read?'r':'u',n=>n.t,s=>s.notifications||[]],
 ['events','events',e=>e.date,e=>0,s=>s.schedule?.custom||[]],
 ['nodes','nodes',n=>n.kind,n=>0,s=>s.extraNodes||[]],
]
export const hashPw=(pw)=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(pw,salt,32).toString('hex')}
export const checkPw=(pw,h)=>{const [s,x]=String(h).split(':');try{return crypto.timingSafeEqual(Buffer.from(x,'hex'),crypto.scryptSync(pw,s,32))}catch{return false}}
export async function openStore(dir){
  fs.mkdirSync(dir,{recursive:true}); let db=null,kind=''
  try{ const m=await import('better-sqlite3'); db=new m.default(path.join(dir,'office.db'),process.env.OFFICE_SQLITE_BINDING?{nativeBinding:process.env.OFFICE_SQLITE_BINDING}:{}); kind='sqlite (better-sqlite3)' }
  catch{ try{ const {DatabaseSync}=await import('node:sqlite'); db=new DatabaseSync(path.join(dir,'office.db')); kind='sqlite (node:sqlite)' }catch{} }
  if(!db)return jsonStore(dir)
  db.exec('CREATE TABLE IF NOT EXISTS ai_keys(id TEXT PRIMARY KEY,provider TEXT,label TEXT,secret_enc TEXT,last4 TEXT,base_url TEXT,models TEXT,enabled INTEGER DEFAULT 1,weight INTEGER DEFAULT 1,cooldown_until INTEGER DEFAULT 0,uses INTEGER DEFAULT 0,errors INTEGER DEFAULT 0,last_error TEXT,created_at INTEGER); CREATE INDEX IF NOT EXISTS ai_keys_provider ON ai_keys(provider);')
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT); CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE,pass_hash TEXT,role TEXT,created_at INTEGER);')
  for(const [n] of COLS)db.exec(`CREATE TABLE IF NOT EXISTS ${n}(id TEXT PRIMARY KEY,grp TEXT,ts INTEGER,json TEXT); CREATE INDEX IF NOT EXISTS ${n}_grp ON ${n}(grp); CREATE INDEX IF NOT EXISTS ${n}_ts ON ${n}(ts);`)
  const last=Object.fromEntries(COLS.map(([n])=>[n,new Map()])); const kvLast=new Map()
  const kvGet=k=>{const r=db.prepare('SELECT v FROM kv WHERE k=?').all(k)[0];return r?JSON.parse(r.v):undefined}
  const kvSet=(k,v)=>{const j=JSON.stringify(v);if(kvLast.get(k)===j)return;db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k,j);kvLast.set(k,j)}
  return { kind,
    isEmpty:()=>db.prepare('SELECT COUNT(*) c FROM people').all()[0].c===0,
    load(){ const s={}; const rows=(n,order='')=>db.prepare(`SELECT id,json FROM ${n} ${order}`).all().map(r=>{last[n].set(r.id,r.json);return JSON.parse(r.json)})
      s.people=Object.fromEntries(rows('people').map(p=>[p.id,p])); s.tasks=rows('tasks','ORDER BY ts'); const ms=rows('messages','ORDER BY ts,rowid'); s.messages={}; ms.forEach(m=>{(s.messages[m.conv]=s.messages[m.conv]||[]).push(m)})
      s.activity=rows('activity','ORDER BY ts DESC'); s.notifications=rows('notifications','ORDER BY ts DESC'); s.models=rows('models'); s.extraNodes=rows('nodes'); s.models=[]
      const custom=rows('events'); s.settings=kvGet('settings')||{}; s.schedule={base:kvGet('base')||[],custom}; s.unread=kvGet('unread')||{}
      for(const k of ['settings','base','unread'])kvLast.set(k,JSON.stringify(kvGet(k))); return s },
    save(s,rev){ db.exec('BEGIN'); try{
      for(const [n,,g,t,rowsOf] of COLS){ const cur=new Map(rowsOf(s).map(r=>[r.id,r])); const prev=last[n]
        const up=db.prepare(`INSERT INTO ${n}(id,grp,ts,json) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET grp=excluded.grp,ts=excluded.ts,json=excluded.json`)
        for(const [id,r] of cur){const j=JSON.stringify(r);if(prev.get(id)!==j){up.run(id,String(g(r)??''),Number(t(r))||0,j);prev.set(id,j)}}
        const del=db.prepare(`DELETE FROM ${n} WHERE id=?`); for(const id of [...prev.keys()])if(!cur.has(id)){del.run(id);prev.delete(id)} }
      kvSet('settings',s.settings);kvSet('base',s.schedule?.base||[]);kvSet('unread',s.unread||{});kvSet('rev',rev); db.exec('COMMIT') }catch(e){db.exec('ROLLBACK');throw e} },
    getRev:()=>kvGet('rev')||1,
    aiKeys:{ list:()=>db.prepare('SELECT * FROM ai_keys ORDER BY created_at').all(),
      add:r=>{db.prepare('INSERT INTO ai_keys(id,provider,label,secret_enc,last4,base_url,models,enabled,weight,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(r.id,r.provider,r.label,r.secret_enc,r.last4,r.base_url||'',r.models||'{}',1,r.weight||1,Date.now())},
      update:(id,p)=>{const ks=Object.keys(p);if(!ks.length)return;db.prepare(`UPDATE ai_keys SET ${ks.map(k=>k+'=?').join(',')} WHERE id=?`).run(...ks.map(k=>p[k]),id)}, del:id=>db.prepare('DELETE FROM ai_keys WHERE id=?').run(id) },
    users:{ get:u=>db.prepare('SELECT * FROM users WHERE username=?').all(u)[0], list:()=>db.prepare('SELECT id,username,role,created_at FROM users').all(),
      add:(username,pw,role)=>{db.prepare('INSERT INTO users(id,username,pass_hash,role,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),username,hashPw(pw),role,Date.now())}, del:u=>db.prepare('DELETE FROM users WHERE username=? AND role!=\'owner\'').run(u), count:()=>db.prepare('SELECT COUNT(*) c FROM users').all()[0].c } }
}
function jsonStore(dir){
  const F=path.join(dir,'state.json'),U=path.join(dir,'users.json'); let users=fs.existsSync(U)?JSON.parse(fs.readFileSync(U,'utf8')):[]; const wu=()=>fs.writeFileSync(U,JSON.stringify(users)); const AK=path.join(dir,'ai_keys.json'); let aik=fs.existsSync(AK)?JSON.parse(fs.readFileSync(AK,'utf8')):[]; const wa=()=>fs.writeFileSync(AK,JSON.stringify(aik))
  return { kind:'json file (install better-sqlite3 for SQLite)', isEmpty:()=>!fs.existsSync(F), load:()=>JSON.parse(fs.readFileSync(F,'utf8')).state, save:(s,rev)=>fs.writeFileSync(F,JSON.stringify({rev,state:s})), getRev:()=>fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')).rev:1,
    aiKeys:{list:()=>aik,add:r=>{aik.push({enabled:1,weight:1,cooldown_until:0,uses:0,errors:0,created_at:Date.now(),models:'{}',base_url:'',...r});wa()},update:(id,p)=>{const k=aik.find(x=>x.id===id);if(k){Object.assign(k,p);wa()}},del:id=>{aik=aik.filter(x=>x.id!==id);wa()}},
    users:{get:u=>users.find(x=>x.username===u),list:()=>users.map(({pass_hash,...r})=>r),add:(username,pw,role)=>{users.push({id:crypto.randomUUID(),username,pass_hash:hashPw(pw),role,created_at:Date.now()});wu()},del:u=>{users=users.filter(x=>x.username!==u||x.role==='owner');wu()},count:()=>users.length}}
}
