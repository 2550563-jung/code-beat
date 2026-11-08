// Kept minimal on purpose: the game runs as a normal web page and needs no Node access.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('codeBeatDesktop', { platform: process.platform });
