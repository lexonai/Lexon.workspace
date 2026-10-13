const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const DEMO = import.meta.env.VITE_DEMO_MODE === 'true'

export const envError: string | null =
  DEMO || (url && key)
    ? null
    : 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them (see docs/MANUAL_SETUP.md), or set VITE_DEMO_MODE=true to preview the UI.'

export const env = { url: url ?? '', key: key ?? '' }
