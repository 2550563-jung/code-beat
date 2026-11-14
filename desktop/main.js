// code-beat desktop shell.
// The game itself loads from GitHub Pages, so every game update reaches players on the next launch.
// The installed shell updates itself from GitHub Releases (electron-updater).
// Without internet it falls back to the copy of the game bundled at build time.
const { app, BrowserWindow, shell, Menu, dialog, ipcMain, Notification, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const GAME_URL = 'https://2550563-jung.github.io/code-beat/';
const OFFLINE = path.join(__dirname, 'offline', 'index.html');

let win;
let tray = null;
let quitting = false;
const startHidden = process.argv.includes('--hidden');

/* ---------- game notifications ----------
   Web push doesn't work inside Electron, so while notifications are on the app keeps running in the
   system tray (also after the window is closed and after Windows starts) and asks the code-beat
   server for new notifications every 2 minutes. */
const PUSH_FILE = () => path.join(app.getPath('userData'), 'push.json');
let push = { on: false };
let pushTimer = null;
function loadPush() { try { push = JSON.parse(fs.readFileSync(PUSH_FILE(), 'utf8')); } catch (e) { push = { on: false }; } }
function savePush() { try { fs.writeFileSync(PUSH_FILE(), JSON.stringify(push)); } catch (e) {} }
async function pollPush() {
  if (!push.on || !push.device || !/^https:\/\//.test(push.url || '')) return 0;
  try {
    const r = await fetch(push.url + '/rest/v1/rpc/bb_app_push_poll', {
      method: 'POST', headers: { apikey: push.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_device: push.device }),
    });
    if (!r.ok) return 0;
    const j = await r.json();
    for (const it of j.items || []) {
      const n = new Notification({ title: it.title || 'code-beat', body: it.body || '', icon: path.join(__dirname, 'offline', 'icons', 'icon-256.png') });
      n.on('click', () => { showWindow(); if (it.cat === 'social' && win) win.webContents.send('open-inbox'); });
      n.show();
    }
    return (j.items || []).length;
  } catch (e) { return 0; }
}
function startPush() {
  if (pushTimer) clearInterval(pushTimer);
  pushTimer = push.on ? setInterval(pollPush, 2 * 60 * 1000) : null;
  if (push.on) { makeTray(); setTimeout(pollPush, 3000); }
  else if (tray) { tray.destroy(); tray = null; }
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!push.on, args: ['--hidden'] });
}
function makeTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(__dirname, 'offline', 'icons', 'icon-256.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('code-beat · 알림 받는 중');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'code-beat 열기', click: () => showWindow() },
    { label: '알림 끄고 종료', click: () => { push.on = false; savePush(); startPush(); quitting = true; app.quit(); } },
    { label: '종료', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showWindow());
}
function showWindow() {
  if (!win) createWindow();
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}
ipcMain.handle('push-enable', (_e, a) => {
  if (!a || !/^[a-z0-9-]{16,64}$/.test(a.device || '') || !/^https:\/\/[a-z0-9.-]+$/.test(a.url || '')) return 'bad';
  push = { on: true, device: a.device, url: a.url, key: String(a.key || '') }; savePush(); startPush();
  return Notification.isSupported() ? 'granted' : 'denied';
});
ipcMain.handle('push-disable', () => { push.on = false; savePush(); startPush(); return 'off'; });
ipcMain.handle('push-poll', () => pollPush());
ipcMain.handle('push-status', () => (push.on ? 'on' : 'off'));

function createWindow() {
  win = new BrowserWindow({
    show: !startHidden || !!win,
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

  // with notifications on, closing the window keeps the app in the tray
  let toldTray = false;
  win.on('close', (e) => {
    if (quitting || !push.on) return;
    e.preventDefault();
    win.hide();
    if (!toldTray && Notification.isSupported()) {
      toldTray = true;
      new Notification({ title: 'code-beat는 알림을 위해 계속 켜져 있어요', body: '작업 표시줄 오른쪽 트레이 아이콘에서 열거나 종료할 수 있어요.' }).show();
    }
  });

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
  app.setAppUserModelId('io.github.jung2550563.codebeat');
  app.on('second-instance', () => showWindow());
  app.whenReady().then(() => { loadPush(); createWindow(); setupUpdates(); startPush(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (!push.on) app.quit(); });
}
