'use client'
/** Short phone ring: dual tone chopped at 25 Hz → "trrr trrr trrr" (3 bursts, ~2.8 s). Resolves `done` when finished; stop() cancels. */
export function playRing(){
  const AC=(window as any).AudioContext||(window as any).webkitAudioContext,ctx:AudioContext=new AC(); const master=ctx.createGain(); master.gain.value=0.2; master.connect(ctx.destination)
  const o1=ctx.createOscillator(),o2=ctx.createOscillator(),g=ctx.createGain(); o1.frequency.value=440;o2.frequency.value=480;g.gain.value=0;o1.connect(g);o2.connect(g);g.connect(master);o1.start();o2.start()
  const burst=0.55,gap=0.4,n=3,t0=ctx.currentTime+0.05
  for(let b=0;b<n;b++){const s=t0+b*(burst+gap);for(let k=0;k<Math.floor(burst*25);k++){const t=s+k/25;g.gain.setValueAtTime(1,t);g.gain.setValueAtTime(0,t+0.022)}}
  let stopped=false; const stop=()=>{if(stopped)return;stopped=true;try{o1.stop();o2.stop();ctx.close()}catch{}}
  const done=new Promise<boolean>(res=>setTimeout(()=>{const ok=!stopped;stop();res(ok)},(n*(burst+gap)-gap)*1000+120))
  return {done,stop}
}
