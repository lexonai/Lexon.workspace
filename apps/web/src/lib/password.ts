// Password rule shared by Workspace and Team. The password itself is only ever sent to Supabase Auth over TLS
// (it is hashed there with bcrypt). It is never stored in a table, in SQL, or in the browser.
// Also set Supabase Auth > Sign In / Providers > Email > "Minimum password length" = 8 so the server enforces it too.
export const MIN_PASSWORD = 8
export const MAX_PASSWORD = 72 // bcrypt limit

export function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (p.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`
  return null
}
