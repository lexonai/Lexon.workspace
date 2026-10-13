import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy baked into the production HTML (GitHub Pages cannot send headers; _headers covers Netlify/Cloudflare).
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com https://*.googleusercontent.com", "media-src 'self' blob: https://*.supabase.co", "frame-src https: http://localhost:* http://127.0.0.1:*",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co", "object-src 'none'", "base-uri 'self'", "form-action 'self'"
].join('; ')
const csp = (): Plugin => ({
  name: 'csp', apply: 'build',
  transformIndexHtml: html => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
})

// base './' so the build works on GitHub Pages sub-paths and inside the Electron shell
export default defineConfig({ plugins: [react(), csp()], base: './' })
