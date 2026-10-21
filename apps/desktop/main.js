// Lexon desktop shell. Security model: the window can only show the bundled app (custom scheme, path-traversal safe),
// no Node access in the page, sandboxed preload with one validated IPC call, strict navigation and permission rules.
const { app, BrowserWindow, shell, protocol, session, ipcMain, net, Menu } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

const cfg = require('./package.json').lexonDesktop
const SCHEME = cfg.scheme
const ORIGIN = `${SCHEME}://app`
const ROOT = path.join(__dirname, 'dist-web')

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com https://*.googleusercontent.com", "media-src 'self' blob: https://*.supabase.co", "frame-src https: http://localhost:* http://127.0.0.1:*",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co", "object-src 'none'", "base-uri 'self'", "form-action 'self'"
].join('; ')

let win = null

function isAppUrl(u) { try { const x = new URL(u); return x.protocol === `${SCHEME}:` && x.host === 'app' } catch { return false } }

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600, title: cfg.productName, icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#f7f9fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, devTools: !app.isPackaged
    }
  })
  win.setMenuBarVisibility(false)
  // Never navigate away from the bundled app; external https links open in the system browser.
  win.webContents.on('will-navigate', (e, url) => { if (!isAppUrl(url)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url) } })
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.loadURL(`${ORIGIN}/`)
}

// Deep link (OAuth return): lexon://app/?code=... -> load inside the app window.
function handleDeepLink(url) {
  if (!win || !isAppUrl(url)) return
  win.loadURL(url)
  if (win.isMinimized()) win.restore()
  win.focus()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit() } else {
  app.on('second-instance', (_e, argv) => { const link = argv.find(a => a.startsWith(`${SCHEME}://`)); if (link) handleDeepLink(link); else if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
  app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url) }) // macOS

  app.whenReady().then(() => {
    if (process.defaultApp) app.setAsDefaultProtocolClient(SCHEME, process.execPath, [path.resolve(process.argv[1] || '.')])
    else app.setAsDefaultProtocolClient(SCHEME)

    // Serve the bundled web app from lexon://app/ (no file:// access, no path traversal)
    protocol.handle(SCHEME, req => {
      const u = new URL(req.url)
      if (u.host !== 'app') return new Response('Not found', { status: 404 })
      let rel = decodeURIComponent(u.pathname); if (rel === '/' || rel === '') rel = '/index.html'
      const file = path.normalize(path.join(ROOT, rel))
      if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(file).toString())
    })

    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      const h = { ...details.responseHeaders }
      if (details.url.startsWith(`${SCHEME}://`)) h['Content-Security-Policy'] = [CSP]
      cb({ responseHeaders: h })
    })
    // Only the app itself may use camera/microphone (calls) and notifications.
    const allow = (wc, perm) => ['media', 'notifications'].includes(perm) && isAppUrl(wc?.getURL?.() ?? '')
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allow(wc, perm)))
    session.defaultSession.setPermissionCheckHandler((wc, perm) => allow(wc, perm))

    Menu.setApplicationMenu(null)
    createWindow()
    const link = process.argv.find(a => a.startsWith(`${SCHEME}://`)); if (link) handleDeepLink(link)
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
}

// The only IPC the page may call: open an https URL in the system browser (used for Google sign-in).
ipcMain.handle('open-external', async (_e, url) => {
  if (typeof url !== 'string' || url.length > 4000) throw new Error('Invalid URL')
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error('Only https links are allowed')
  await shell.openExternal(u.toString())
})
