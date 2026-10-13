// Shared by the web app AND the backend server (plain ESM, no deps).
export const ROOM_DEFS=[
 {id:'dev',name:'Development Room',x:-17.6,z:-6.5,w:11.6,d:8},{id:'youtube',name:'YouTube Room',x:-5.8,z:-6.5,w:11.6,d:8},
 {id:'content',name:'Content Room',x:5.8,z:-6.5,w:11.6,d:8},{id:'conference',name:'Conference Room',x:17.6,z:-6.5,w:11.6,d:8},
 {id:'meeting',name:'Meeting Room',x:-17.6,z:4.5,w:11.6,d:8},{id:'main',name:'Main Floor',x:0,z:4.5,w:23.6,d:8},{id:'break',name:'Break Area',x:17.6,z:4.5,w:11.6,d:8}]
const desk=(id,room,x,z)=>({id,room,type:'desk',x,z,sx:x,sz:z+0.9,ry:Math.PI,sit:true})
const seat=(id,room,x,z,ry,sit=true)=>({id,room,type:'seat',x,z,sx:x,sz:z,ry,sit})
const grid=(room,pre,xs,zs)=>zs.flatMap((z,r)=>xs.map((x,c)=>desk(`${pre}-${r*xs.length+c+1}`,room,x,z)))
const row=(room,pre,xs,z,ry)=>xs.map((x,i)=>seat(`${pre}-${i+1}`,room,x,z,ry))
export const SLOTS=[
 ...grid('dev','dev',[-21.2,-18.4,-15.6,-12.8],[-8.4,-5.0]),...grid('youtube','youtube',[-10.0,-7.4,-4.8,-2.2],[-8.4,-5.0]),
 ...grid('content','content',[1.8,4.4,7.0,9.6],[-8.4,-5.0]),...grid('main','main',[-7.5,-2.5,2.5,7.5],[2.7,6.0]),
 seat('conf-w','conference',14.2,-6.5,Math.PI/2),seat('conf-e','conference',21.0,-6.5,-Math.PI/2),...row('conference','conf-n',[15.2,16.4,17.6,18.8,20.0],-8.1,0),...row('conference','conf-s',[15.2,16.4,17.6,18.8,20.0],-4.9,Math.PI),
 seat('meet-w','meeting',-20.6,4.5,Math.PI/2),seat('meet-e','meeting',-14.6,4.5,-Math.PI/2),...row('meeting','meet-n',[-19.4,-18.2,-17.0,-15.8],3.2,0),...row('meeting','meet-s',[-19.4,-18.2,-17.0,-15.8],5.8,Math.PI),
 seat('break-1','break',15.9,4.4,Math.PI/2),seat('break-2','break',18.1,4.4,-Math.PI/2),seat('break-3','break',20.3,7.3,Math.PI),seat('break-4','break',21.7,7.3,Math.PI),
]
export const SLOT_BY_ID=Object.fromEntries(SLOTS.map(s=>[s.id,s]))
export const COFFEE_SPOT={x:14.0,z:2.0,ry:-Math.PI/2}
const SH=['#6b3b3b','#4b5a4a','#55524a','#2f3d4f','#46505c','#3b3b40','#6a5a4a','#5a4a63','#3d5a5a','#7a6a3a','#444c5e','#5b3f4a'],SK=['#c99772','#b98560','#d2a47b','#a97650','#c4916a','#caa077'],HR=['#1b1512','#15110e','#241810','#0f0d0b','#3a2a1a']
const MN=['Aarav','Vivaan','Aditya','Reyansh','Kabir','Ishaan','Rahul','Nikhil','Siddharth','Manav','Pranav','Harsh','Yash','Dev'],FN=['Ananya','Diya','Priya','Neha','Kavya','Riya','Pooja','Aisha','Tanvi','Ishita','Sneha','Nisha','Aditi','Simran']
const SN=['Gupta','Singh','Patel','Reddy','Joshi','Kapoor','Mishra','Bose','Iyer','Chopra','Malhotra','Rao','Desai','Sinha','Bhatt','Saxena','Menon','Pillai','Khanna','Tiwari','Agarwal','Das','Roy','Nair','Shah','Jain','Verma','Yadav']
const h=s=>[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7)
const APP=[[/motion|video|shorts/i,'Lexon Motion'],[/design|photo|thumbnail|intern/i,'Image Editor'],[/develop|engineer|qa|ml/i,'VS Code'],[/script|writer|editor|content|seo|social/i,'Docs · Script'],[/youtube|strateg|analytic|community/i,'YouTube Studio']]
const SK_BY=[[/develop|engineer/i,['Programming','Code review','Debugging']],[/video|shorts|motion/i,['Video editing','Motion graphics']],[/script|writer/i,['Scriptwriting','Storytelling']],[/seo|social|marketing|brand/i,['SEO','Social media','Branding']],[/analyst|analytic|finance|data/i,['Data analysis','Reporting']],[/youtube|strateg|community/i,['YouTube strategy','Community']],[/design|thumbnail|photo/i,['Thumbnail design','Photography']],[/hr|operations|admin|project|support|client|product/i,['Coordination','Communication']]]
const TASKS={dev:['Sprint tickets','Reviewing pull requests','Fixing a bug','Deploy pipeline'],youtube:['Editing a video','Channel analytics','Competitor review','Shorts planning'],content:['Drafting an article','Keyword research','Editing copy','Social calendar'],main:['Weekly report','Vendor follow-ups','Team coordination','Budget sheet'],meeting:['Client sync notes','Brand review','Roadmap discussion'],break:['On a short break']}
const mk=(slotId,id,name,role,dept,gender,x={})=>{ const s=SLOT_BY_ID[slotId],H=h(id),pool=TASKS[s.room]||TASKS.main
  return {id,name,role,dept,gender,room:s.room,slot:slotId,desk:s.type==='desk'?[s.x,s.z]:null,seat:[s.sx,s.sz,s.ry],sit:s.sit,
   app:s.type==='desk'?(APP.find(a=>a[0].test(role))||[0,'Chrome'])[1]:'',shirt:SH[H%SH.length],skin:SK[(H>>3)%SK.length],hair:HR[(H>>5)%HR.length],hairStyle:(H>>7)%3,build:0.94+((H>>9)%9)/100,glasses:(H>>11)%4===0,beard:gender==='male'&&(H>>13)%4===0,
   presence:H%11===0?'busy':H%13===0?'away':'online',state:s.type==='desk'?['TYPING','WORKING','READING'][H%3]:s.room==='break'?'BREAK':'READING',task:s.room==='break'?'On a short break':pool[H%pool.length],progress:(H%7)*12,
   reportsTo:'anita',skills:(SK_BY.find(a=>a[0].test(role))||[0,['Teamwork']])[1],instructions:'',knowledge:[],tools:[],voice:{pitch:gender==='female'?1.1+((H%5)/50):0.8+((H%6)/40),rate:0.95+((H%5)/50)},...x} }
// 28 office members = 1 Admin/Owner (hidden avatar, visible only in Free Walk) + 1 Manager + 26 workers.
// Workers are built from 4 base characters (2 male m1/m2, 2 female f1/f2), each reused ~6-7× with variations (clothes, hair colour, skin, height, accessories).
const gen=[ // [slot, role, dept, gender]
 ['dev-2','Frontend Developer','Development','f'],['dev-3','Backend Developer','Development','m'],['dev-4','Full-stack Developer','Development','f'],['dev-5','DevOps Engineer','Development','m'],['dev-6','QA Engineer','Development','f'],
 ['youtube-4','Video Editor','YouTube','m'],['youtube-5','Video Editor','YouTube','f'],['youtube-6','Shorts Producer','YouTube','f'],
 ['content-4','Content Writer','Content','f'],['content-5','SEO Specialist','Content','m'],
 ['main-1','Operations Coordinator','Operations','f'],['main-2','HR Executive','Operations','m'],['main-3','Finance Analyst','Operations','f'],['main-4','Support Executive','Operations','m'],['main-5','Project Coordinator','Operations','f'],
 ['meet-s-1','Product Manager','Product','m'],['meet-s-2','Brand Strategist','Product','f'],['break-1','Design Intern','Design','f'],['break-2','Marketing Executive','Marketing','m']]
let mi=0,fi=0,si=0
const ARCHS={m:['m1','m2'],f:['f1','f2']},archN={m:0,f:0},varN={m1:0,m2:0,f1:0,f2:0}
const arch=g=>{const k=g==='female'?'f':'m',a=ARCHS[k][archN[k]++%2];return {arch:a,variant:varN[a]++}}
const generated=gen.map(([slot,role,dept,g])=>{const female=g==='f';const first=female?FN[fi++%FN.length]:MN[mi++%MN.length];const name=`${first} ${SN[si++%SN.length]}`;return mk(slot,(first+SN[(si-1)%SN.length]).toLowerCase(),name,role,dept,female?'female':'male')})
const named=[mk('dev-1','karan','Karan Mehta','Developer','Development','male'),mk('youtube-1','arjun','Arjun Nair','YouTube Strategist','YouTube','male',{skills:['Title research','CTR','Analytics','SEO'],knowledge:['Title formulas','Competitor analysis'],tools:['YouTube API','Web search']}),
 mk('youtube-2','imran','Imran Ali','Researcher / Analyst','YouTube','male',{skills:['Web research','Trend analysis','Fact-check']}),
 mk('youtube-3','rohit','Rohit Verma','Photographer / Thumbnail Designer','Design','male',{skills:['Thumbnail design','CTR','Photography','Photoshop'],knowledge:['High-CTR thumbnails: big face, 3 words max, high contrast'],tools:['Image AI']}),
 mk('content-1','sana','Sana Khan','Scripter','Content','female',{skills:['Scriptwriting','Hooks','Storytelling'],knowledge:['Hook in first 5 seconds','Retention structure']}),
 mk('content-2','meera','Meera Das','Content Editor','Content','female'),mk('content-3','vijay','Vijay Kumar','Motion Grapher','Content','male',{skills:['Motion graphics','Cursor animation','Lexon Motion'],progress:72,task:'Cursor animation'})]
const manager=mk('conf-w','anita','Anita Sharma','AI Manager','Management','female',{isManager:true,arch:'mgr',variant:0,reportsTo:undefined,shirt:'#2457b8',skin:'#c99772',hair:'#1b1512',hairStyle:1,glasses:false,state:'READING',task:'Monitoring the team',presence:'online',skills:['Planning','Routing','Review'],instructions:'You are the manager.',progress:0})
export const SEED_EMPLOYEES=[manager,...[...named,...generated].map(e=>({...e,...arch(e.gender)}))]
export const BASE_SCHEDULE=[{id:'b1',time:'09:30',title:'Work starts',kind:'Work'},{id:'b2',time:'10:30',title:'Daily stand-up (Meeting Room)',kind:'Meeting'},{id:'b3',time:'13:00',title:'Lunch / rest',kind:'Break'},{id:'b4',time:'16:00',title:'Review & hand-offs',kind:'Work'},{id:'b5',time:'18:30',title:'Work ends',kind:'Work'}]
export const DEFAULT_SETTINGS={directMessaging:false,voiceEnabled:true,assistantMode:false,browserNotify:false,autoRoute:true,requireReview:true,autoStart:true,internetAccess:true,globalInstructions:'Speak like a real colleague. Be concise, warm and accurate.',showNames:false,reduceMotion:false,shadows:true,employeeCanCreateTasks:false}
export const PROVIDERS={gemini:{label:'Google Gemini',base:'https://generativelanguage.googleapis.com/v1beta/openai',kind:'openai',fast:'gemini-2.0-flash',deep:'gemini-2.5-pro',tts:'gemini-2.5-flash-preview-tts',stt:'gemini-2.0-flash'},anthropic:{label:'Anthropic Claude',base:'https://api.anthropic.com/v1',kind:'anthropic',fast:'claude-haiku-4-5-20251001',deep:'claude-sonnet-5-5'},openai:{label:'OpenAI',base:'https://api.openai.com/v1',kind:'openai',fast:'gpt-4o-mini',deep:'gpt-4o',tts:'gpt-4o-mini-tts',stt:'whisper-1'},compatible:{label:'OpenAI-compatible (Groq, OpenRouter, local…)',base:'',kind:'openai',fast:'',deep:''},tavily:{label:'Tavily (web search)',search:true},brave:{label:'Brave Search',search:true},youtube:{label:'YouTube Data API',search:true}}
