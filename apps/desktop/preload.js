// Sandboxed preload: exposes a minimal, validated API. No Node, no filesystem, no arbitrary IPC.
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('lexonDesktop', {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke('open-external', String(url))
})
