// code-beat desktop shell.
// The game itself loads from GitHub Pages, so every game update reaches players on the next launch.
// The installed shell updates itself from GitHub Releases (electron-updater).
// Without internet it falls back to the copy of the game bundled at build time.
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const GAME_URL = 'https://2550563-jung.github.io/code-beat/';
const OFFLINE = path.join(__dirname, 'offline', 'index.html');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 400,
    minHeight: 560,
    backgroundColor: '#130f1d',
    title: 'code-beat',
    icon: path.join(__dirname, 'offline', 'icons', 'icon-256.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  Menu.setApplicationMenu(null);

  let fellBack = false;
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && !fellBack && url.startsWith(GAME_URL)) {
      fellBack = true;
      win.loadFile(OFFLINE);
    }
  });
  win.loadURL(GAME_URL, { extraHeaders: 'pragma: no-cache\n' });

  // Links to other sites open in the normal browser, not inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(GAME_URL) && !url.startsWith('file:')) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // F11 toggles fullscreen, F5 reloads the latest game version.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F5') { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
  });
}

function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['지금 다시 시작', '나중에'],
      defaultId: 0,
      title: 'code-beat 업데이트',
      message: `새 버전 ${info.version}을(를) 받았어요.`,
      detail: '다시 시작하면 바로 적용돼요. 나중을 고르면 게임을 끌 때 적용돼요.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 1000 * 60 * 60 * 3);
}

const single = app.requestSingleInstanceLock();
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { createWindow(); setupUpdates(); });
  app.on('window-all-closed', () => app.quit());
}
