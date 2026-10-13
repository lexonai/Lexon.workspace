const { contextBridge, ipcRenderer } = require('electron')
const cfg = ipcRenderer.sendSync('desktop-config')
if (cfg) contextBridge.exposeInMainWorld('lexonDesktop', cfg)
