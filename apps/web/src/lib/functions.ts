import { supabase } from './supabase'

// Calls a Supabase Edge Function and turns failures into messages that say what to fix.
export async function callFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const ctx = (error as any).context
    if (ctx?.json) { // the function answered with an error status
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error) } catch (e) { if (e instanceof Error && e.message && !/JSON|Unexpected/.test(e.message)) throw e }
      if (ctx.status === 404) throw new Error(`Edge Function "${name}" is not deployed. Deploy it (supabase functions deploy ${name}) and try again.`)
      if (ctx.status === 401) throw new Error('Your session expired. Sign in again.')
    }
    if ((error as any).name === 'FunctionsFetchError' || /Failed to send a request/i.test(error.message)) {
      throw new Error(`Could not reach the Edge Function "${name}". Check that it is deployed and that ALLOWED_ORIGINS includes this site's URL.`)
    }
    throw new Error(error.message)
  }
  return data as T
}
