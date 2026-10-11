// Sustituye el puente con Electron (preload.js) por uno de pruebas: guarda en una carpeta temporal,
// no registra atajos reales ni abre el micrófono, y deja a la vista lo que la app le pide.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const argv = process.argv.find((a) => a.startsWith('--corvid-test='));
const opts = JSON.parse(Buffer.from(argv.slice('--corvid-test='.length), 'base64').toString('utf-8'));
const tmp = opts.dir;
const imagesDir = path.join(tmp, 'images');
fs.mkdirSync(imagesDir, { recursive: true });
let n = 0;

const log = { saved: null, syncSaved: null, bindings: [], pushed: null, copied: null, suspended: 0 };
window.__log = log;
window.__cb = {};
window.__imagesDir = imagesDir;
// Para que las pruebas construyan archivos (File) a partir de imágenes del disco
window.__readFile = (p) => new Uint8Array(fs.readFileSync(p));

const initial = opts.config;

window.corvid = {
  info: async () => ({ port: 47999, imagesUrl: pathToFileURL(imagesDir).href + '/', obsClients: 0, apiKey: 'CLAVE' }),
  loadConfig: async () => initial,
  saveConfig: async (c) => { log.saved = JSON.parse(JSON.stringify(c)); return true; },
  saveConfigSync: (c) => { log.syncSaved = JSON.parse(JSON.stringify(c)); return true; },
  saveImage: async (name, data) => {
    const file = `${++n}-${path.basename(name)}`;
    fs.writeFileSync(path.join(imagesDir, file), Buffer.from(data));
    return `user:${file}`;
  },
  pushState: (s) => { log.pushed = s; },
  setHotkeys: async (b) => { log.bindings = b; return []; },
  suspendHotkeys: async () => { log.suspended += 1; return true; },
  resumeHotkeys: async () => [],
  copy: async (t) => { log.copied = t; return true; },
  openImagesFolder: async () => {},
  exportAvatar: async () => null,
  onHotkey: (cb) => { window.__cb.hotkey = cb; return () => {}; },
  onObsClients: (cb) => { window.__cb.obs = cb; return () => {}; },
};

// Sin micrófono real en las pruebas
navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('sin micrófono en pruebas'));
