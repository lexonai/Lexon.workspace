import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { supabase } from './lib/supabase'
import './index.css'

async function boot() {
  // Invitation / magic links return tokens in the URL hash. Let Supabase consume them before the hash router starts.
  if (location.hash.includes('access_token=') || location.hash.includes('error_description=')) {
    await supabase.auth.getSession()
    if (!location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname + location.search + '#/')
  }
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
  if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {})
}
boot()
