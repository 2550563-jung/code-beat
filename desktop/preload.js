// Kept small on purpose: the game runs as a normal web page. The only extra is game notifications,
// which the PC app fetches itself because web push doesn't work inside the app.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('codeBeatDesktop', {
  platform: process.platform,
  push: {
    enable: (device, url, key) => ipcRenderer.invoke('push-enable', { device, url, key }),
    disable: () => ipcRenderer.invoke('push-disable'),
    pollNow: () => ipcRenderer.invoke('push-poll'),
    status: () => ipcRenderer.invoke('push-status'),
  },
  onOpenInbox: (fn) => ipcRenderer.on('open-inbox', () => fn()),
});
