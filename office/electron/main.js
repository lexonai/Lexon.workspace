// LEXON OFFICE desktop: runs the full server (SQLite DB, AI vault, task worker, mobile admin) inside the app and auto-connects the UI to it.
const { app, BrowserWindow, protocol, net: enet, session, shell, ipcMain } = require('electron')
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net'), crypto = require('crypto'); const { pathToFileURL } = require('url')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const ROOT = path.join(__dirname, '..', 'out')
let desktop = null
const freePort = pref => new Promise(res => { const s = net.createServer(); s.once('error', () => { const t = net.createServer(); t.listen(0, () => { const p = t.address().port; t.close(() => res(p)) }) }); s.listen(pref, () => s.close(() => res(pref))) })
async function startServer() {
  const data = path.join(app.getPath('userData'), 'data'); fs.mkdirSync(data, { recursive: true })
  const pwf = path.join(data, 'desktop-password')
  const pw = fs.existsSync(pwf) ? fs.readFileSync(pwf, 'utf8') : (() => { const p = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(pwf, p, { mode: 0o600 }); return p })()
  const port = await freePort(8787)
  Object.assign(process.env, { OFFICE_DATA: data, OFFICE_SSO_SECRET: pw, PORT: String(port), OFFICE_WEB_DIR: ROOT })
  const nb = path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node')
  if (app.isPackaged && process.platform === 'win32' && fs.existsSync(nb)) process.env.OFFICE_SQLITE_BINDING = nb
  await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href)
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) break } catch {} await new Promise(r => setTimeout(r, 100)) }
  const r = await fetch(url + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: pw }) })
  const { token } = await r.json()
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address || 'localhost'
  return { url, token, password: pw, lanUrl: `http://${lan}:${port}` }
}
function createWindow() {
  const win = new BrowserWindow({ width: 1600, height: 960, minWidth: 900, minHeight: 600, backgroundColor: '#0a0b0d', title: 'LEXON OFFICE', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, 'preload.js') } })
  win.loadURL(desktop ? desktop.url + '/office/' : 'app://office/office/')
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' } })
}
if (!app.requestSingleInstanceLock()) app.quit()
else app.whenReady().then(async () => {
  protocol.handle('app', async (req) => { let p = decodeURIComponent(new URL(req.url).pathname); if (p.endsWith('/')) p += 'index.html'; else if (!path.extname(p)) p += '/index.html'
    const file = path.normalize(path.join(ROOT, p)); if (!file.startsWith(ROOT)) return new Response('', { status: 403 })
    try { return await enet.fetch(pathToFileURL(file).toString()) } catch { return new Response('', { status: 404 }) } })
  const allow = p => ['media', 'audioCapture', 'fullscreen', 'clipboard-sanitized-write'].includes(p)
  session.defaultSession.setPermissionRequestHandler((_w, perm, cb) => cb(allow(perm))); session.defaultSession.setPermissionCheckHandler((_w, perm) => allow(perm))
  try { desktop = await startServer() } catch (e) { console.error('Embedded server failed — running in local mode:', e) }
  ipcMain.on('desktop-config', e => { e.returnValue = desktop })
  createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
