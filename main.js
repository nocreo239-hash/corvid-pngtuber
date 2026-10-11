const { app, BrowserWindow, ipcMain, globalShortcut, session, clipboard, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { createAvatarServer } = require('./server');
const { writeAvatar } = require('./avatar-export');

// El micrófono debe funcionar sin tener que hacer clic primero.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const ROOT = __dirname;
const RENDERER_DIR = path.join(ROOT, 'renderer');
const ASSETS_DIR = path.join(ROOT, 'assets');
// No usar 7474: es el puerto por defecto del servidor HTTP de Streamer.bot. Lumia usa 39231/39232.
const DEFAULT_PORT = 47474;

let USER_DIR, IMAGES_DIR, CONFIG_PATH, API_KEY;
let win = null;
let avatarServer = null;
let serverPort = null;

const ALLOWED_EXT = new Set(['.png', '.gif', '.webp', '.jpg', '.jpeg', '.svg']);

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// bindings: [{ acc: 'Ctrl+Shift+1', payload: { type: 'expression', id } }, ...]
// Devuelve los atajos que no se pudieron registrar (ocupados por otro programa o inválidos).
let currentBindings = [];
function registerHotkeys(bindings) {
  globalShortcut.unregisterAll();
  currentBindings = Array.isArray(bindings) ? bindings : [];
  const failed = [];
  for (const { acc, payload } of currentBindings) {
    if (!acc) continue;
    try {
      if (!globalShortcut.register(acc, () => send('hotkey', payload))) failed.push(acc);
    } catch {
      failed.push(acc);
    }
  }
  return failed;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 660,
    backgroundColor: '#0d0b12',
    title: 'Corvid PNGtuber',
    icon: path.join(ASSETS_DIR, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Sigue escuchando el micrófono aunque la ventana esté minimizada.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(RENDERER_DIR, 'index.html'));
  // La ventana nunca sale de la app (p. ej. si se suelta una imagen fuera de una casilla, Electron navegaría a ella).
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// Clave para el control remoto (Streamer.bot). Se crea una vez y se guarda junto a la configuración.
function loadApiKey() {
  const file = path.join(USER_DIR, 'api-key.txt');
  try {
    const key = fs.readFileSync(file, 'utf-8').trim();
    if (key) return key;
  } catch { /* primera vez */ }
  const key = require('crypto').randomBytes(9).toString('base64url');
  fs.writeFileSync(file, key, 'utf-8');
  return key;
}

// Borra las imágenes subidas que ya no usa ninguna expresión (quitadas, sustituidas o de expresiones borradas).
// Solo si la configuración se lee bien, y nunca las de las últimas 24 h por si aún no se había guardado.
function cleanUnusedImages() {
  const cfg = readConfig();
  if (!cfg || !Array.isArray(cfg.expressions)) return;
  const used = new Set();
  const refs = [
    ...cfg.expressions.flatMap((ex) => Object.values(ex.frames || {})),
    ...(Array.isArray(cfg.accessories) ? cfg.accessories.map((a) => a.src) : []),
  ];
  for (const ref of refs) {
    if (typeof ref === 'string' && ref.startsWith('user:')) used.add(ref.slice(5));
  }
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const name of fs.readdirSync(IMAGES_DIR)) {
    if (used.has(name)) continue;
    const file = path.join(IMAGES_DIR, name);
    try {
      const st = fs.statSync(file);
      if (st.isFile() && st.mtimeMs < dayAgo) fs.unlinkSync(file);
    } catch { /* en uso o ya borrada */ }
  }
}

// ---------- Exportar el avatar ----------

async function exportAvatar(cfg) {
  const pick = await dialog.showOpenDialog(win, {
    title: 'Elige dónde guardar el avatar',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (pick.canceled || !pick.filePaths[0]) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  let dest = path.join(pick.filePaths[0], `Corvid avatar ${stamp}`);
  for (let i = 2; fs.existsSync(dest); i++) dest = path.join(pick.filePaths[0], `Corvid avatar ${stamp} (${i})`);
  fs.mkdirSync(dest, { recursive: true });
  const files = writeAvatar(dest, cfg, { imagesDir: IMAGES_DIR, assetsDir: ASSETS_DIR });
  shell.openPath(dest);
  return { dest, files };
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    USER_DIR = app.getPath('userData');
    IMAGES_DIR = path.join(USER_DIR, 'images');
    CONFIG_PATH = path.join(USER_DIR, 'config.json');
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    cleanUnusedImages();
    const apiKey = loadApiKey();

    const allowed = new Set(['media', 'clipboard-sanitized-write']);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

    avatarServer = createAvatarServer({
      rendererDir: RENDERER_DIR,
      assetsDir: ASSETS_DIR,
      imagesDir: IMAGES_DIR,
      onClientsChange: (n) => send('obs:clients', n),
      apiKey,
      getExpressions: () => (readConfig() || {}).expressions || [],
      getAccessories: () => (readConfig() || {}).accessories || [],
      onCommand: (cmd) => send('hotkey', cmd), // mismas órdenes que los atajos
    });
    API_KEY = apiKey;
    try {
      serverPort = await avatarServer.listen(DEFAULT_PORT);
    } catch (err) {
      console.error('No se pudo iniciar el servidor para OBS:', err);
      serverPort = null;
    }

    registerIpc();
    createWindow();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    port: serverPort,
    imagesUrl: pathToFileURL(IMAGES_DIR).href + '/',
    obsClients: avatarServer ? avatarServer.clientCount() : 0,
    apiKey: API_KEY,
  }));

  ipcMain.handle('config:load', () => readConfig());

  ipcMain.handle('config:save', (_e, cfg) => {
    const tmp = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
    fs.renameSync(tmp, CONFIG_PATH);
    return true;
  });

  ipcMain.handle('image:save', (_e, { name, data }) => {
    const ext = path.extname(String(name || '')).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new Error('Formato no soportado');
    const file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.writeFileSync(path.join(IMAGES_DIR, file), Buffer.from(data));
    return `user:${file}`;
  });

  ipcMain.on('state:push', (_e, state) => {
    if (avatarServer) avatarServer.broadcast(state);
  });

  ipcMain.handle('hotkeys:set', (_e, bindings) => registerHotkeys(bindings));
  // Mientras se graba una tecla nueva, los atajos globales se pausan para que lleguen a la ventana.
  ipcMain.handle('hotkeys:suspend', () => { globalShortcut.unregisterAll(); return true; });
  ipcMain.handle('hotkeys:resume', () => registerHotkeys(currentBindings));
  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text)); return true; });
  ipcMain.handle('images:open', () => shell.openPath(IMAGES_DIR));
  ipcMain.handle('avatar:export', (_e, cfg) => exportAvatar(cfg));
}
