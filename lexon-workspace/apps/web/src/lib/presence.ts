import type { Presence } from '../types'
// A user counts as online/away only if their heartbeat is recent; otherwise offline.
export function effectivePresence(p: Presence | null, lastSeen: string | null): Presence {
  if (!lastSeen || !p) return 'offline'
  return Date.now() - new Date(lastSeen).getTime() < 150000 ? p : 'offline'
}
