/** First words when a call connects, by role (as specified). */
export function greetingFor(emp:any){
  const r=`${emp?.role||''}`
  if(emp?.isManager||/manager/i.test(r))return 'Sir, हाँ बोलिए, क्या काम है?'
  if(/develop|engineer|devops|\bqa\b|programmer/i.test(r))return 'Yes sir, क्या बनवा रहे हैं आज?'
  if(/design|graphic|thumbnail|photograph|motion|artist/i.test(r))return 'Sir, क्या design करना है?'
  return 'Yes sir, बोलिए, क्या काम है?'
}
