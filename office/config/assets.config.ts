// Tune imported GLB assets without touching code. Drop files in /public/models (see public/models/README.md).
export const HUMAN_GLB={
  url:(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/models/humans/human.glb', scale:1, offset:[0,0,0] as [number,number,number], rotationY:0, seatedYOffset:-0.45,
  clips:{ Idle:['Idle','idle','mixamo.com'], Walk:['Walk','walk','Walking'], Sit:['Sit','Sitting','sit'], Typing:['Typing','Type','typing'], Talk:['Talk','Talking','Agree'] } as Record<string,string[]>,
  seatedBonePose:true, // if no Sit/Typing clip exists, bend hips/knees on Mixamo-style rigs
}
export const DESK_GLB=(process.env.NEXT_PUBLIC_BASE_PATH||'')+'/models/furniture/desk.glb'
