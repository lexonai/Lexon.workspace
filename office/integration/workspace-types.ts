// Contract types only. No LEXON WORKSPACE imports or code.
export type OfficePresence='online'|'away'|'busy'|'offline'
export interface OfficePersonSummary{id:string;name:string;role:string;presence:OfficePresence;state:string;task:string}
export interface OfficeTaskSummary{id:string;title:string;status:'queued'|'blocked'|'working'|'review'|'done';progress:number;assignee?:string}
export interface OfficeSnapshot{people:OfficePersonSummary[];tasks:OfficeTaskSummary[];unread:number;generatedAt:string}
