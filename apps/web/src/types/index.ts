export type Presence = 'online' | 'away' | 'offline'
export interface ProjectRow { id: string; name: string; type: string | null; progress: number; status: string }
export interface TaskRow { id: string; title: string; project: string | null; due: string | null }
export interface MemberRow { id: string; name: string; title: string | null; presence: Presence; avatar: string | null }
export interface ActivityRow { id: string; action: string; title?: string | null; at: string }
export interface SeriesPoint { label: string; value: number }
export interface HomeData {
  userName: string
  assistantName: string
  kpis: { projects: number; tasksDone: number; members: number; unread: number }
  progress: SeriesPoint[]
  projects: ProjectRow[]
  tasks: TaskRow[]
  team: MemberRow[]
  activity: ActivityRow[]
  /** Sections that could not be loaded (database not fully migrated, RLS, ...). The rest of Home still renders. */
  warnings?: string[]
}
