/** Status/thinking indicator derived from what the worker is actually doing (not scripted speech). */
export function moodKey(p:any,tasks:any[]):string{
  if(!p||p.presence==='offline')return ''
  const mine=tasks.filter(t=>t.status!=='done'&&t.chain.includes(p.id))
  if(mine.length>=3||mine.some(t=>t.deadline&&new Date(t.deadline).getTime()-Date.now()<3600000))return 'Pressure|#ef4444'
  if(p.presence==='busy')return 'Busy|#ef4444'
  switch(p.state){
    case 'TYPING':case 'WORKING':return (/research|analy|trend|competitor|search/i.test(p.task)?'Searching':'Working')+'|#f5c542'
    case 'READING':return 'Thinking|#7aa7ff'; case 'TALKING':case 'MEETING':return 'Curious|#c084fc'
    case 'BREAK':return 'Relaxing|#3ddc84'; case 'CALLING':return 'On call|#3b82f6'; case 'WALKING':return '|#8b919b'; default:return 'Idle|#8b919b'
  }
}
