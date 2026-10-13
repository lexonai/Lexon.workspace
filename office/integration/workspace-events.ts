/** Messages Office → host (window.parent.postMessage). All carry {source:'lexon-office', v:1}. */
export type OfficeEvent=
 |{type:'office.ready';version:string}
 |{type:'office.snapshot';id?:string;data:import('./workspace-types').OfficeSnapshot}
 |{type:'office.task.created';taskId:string;title:string}
 |{type:'office.task.status';taskId:string;status:string}
 |{type:'office.task.handoff';taskId:string;handoff:string}
 |{type:'office.task.completed';taskId:string;status:'done'}
 |{type:'office.person.presence';personId:string;presence:string}
 |{type:'office.room.entered';room:string}          // you walked into a room in Free Walk
 |{type:'office.meeting.started';room:string}
 |{type:'office.call.started';personId:string}|{type:'office.call.ended';personId:string}
 |{type:'office.ai.status';keys:number;tts:boolean;stt:boolean}
 |{type:'office.unread';count:number}
 |{type:'office.notification';text:string}
/** Messages host → Office (iframe.contentWindow.postMessage). Must include {target:'lexon-office'}. */
export type OfficeCommand=
 |{type:'office.task.request';title:string;priority?:'low'|'normal'|'high'|'urgent'}
 |{type:'office.chat.send';text:string}
 |{type:'office.navigate';section:'office'|'people'|'chat'|'tasks'|'activity'|'schedule'|'settings'}
 |{type:'office.camera.focus';cameraId:'cam1'|'cam2'|'cam3'|'cam4'|'cam5'|'cam6'|'cam7'}
 |{type:'office.person.focus';personId:string}
 |{type:'office.mode.set';mode:'live'|'tour'|'walk'|'free'}
 |{type:'office.room.call';room:'dev'|'youtube'|'content'|'conference'|'meeting'|'break'|'main';ids?:string[]}
 |{type:'office.call.start';personId:string}
 |{type:'office.snapshot.request';id?:string}
