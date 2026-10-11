// Pruebas de la ventana de la app:  npm run test:renderer
// Abre renderer/index.html (oculta) con un puente de pruebas, ejecuta tests.js dentro y sale con 0 si todo pasa.
// Cada grupo de pruebas arranca la app desde cero, con la configuración que indique.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TESTS = fs.readFileSync(path.join(__dirname, 'tests.js'), 'utf-8');

async function runGroup(group) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corvid-test-'));
  const arg = Buffer.from(JSON.stringify({ dir: tmp, config: group.config || null })).toString('base64');
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      sandbox: false,
      partition: `corvid-test-${group.name}`, // sesión propia por grupo: nada se arrastra del anterior
      additionalArguments: [`--corvid-test=${arg}`],
    },
  });
  try {
    await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
    // Espera a que init() termine (crea la vista y las tarjetas); si la app no arranca (p. ej. un error de
    // sintaxis), falla a los 15 s en vez de quedarse esperando para siempre.
    await win.webContents.executeJavaScript(`new Promise((ok, ko) => {
      const t0 = Date.now();
      const t = setInterval(() => {
        if (typeof view !== "undefined" && view && document.querySelector(".expr-card")) { clearInterval(t); ok(); }
        else if (Date.now() - t0 > 15000) { clearInterval(t); ko(new Error("la app no arrancó en 15 s (¿error en renderer/*.js?)")); }
      }, 50);
    })`);
    const code = `${TESTS}\nrunTests(${JSON.stringify(group.name)}, ${JSON.stringify(path.join(ROOT, 'assets'))})`;
    return await win.webContents.executeJavaScript(code);
  } finally {
    // Cerrar del todo antes de abrir la siguiente ventana (si no, la nueva puede fallar al cargar)
    await new Promise((r) => { win.once('closed', r); win.destroy(); });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const GROUPS = [
  { name: 'nueva' },                                   // instalación nueva (cuervo de ejemplo)
  {
    name: 'migracion-v1',                              // configuración de la versión 1
    config: {
      version: 1, settings: { modifier: 'alt-shift' }, activeId: 'b',
      expressions: [
        { id: 'a', name: 'Uno', frames: { idle: 'asset:raven/raven_open_closed.svg', talk: null, blink: null, shout: null } },
        { id: 'b', name: 'Dos', frames: { idle: 'asset:raven/raven_happy_closed.svg', talk: null, blink: null, shout: null } },
      ],
    },
  },
];

// Entre un grupo y otro no queda ninguna ventana: sin esto, Electron cerraría la app y abortaría la siguiente carga.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  let failed = 0;
  let total = 0;
  for (const g of GROUPS) {
    let results;
    try {
      results = await runGroup(g);
    } catch (err) {
      results = [{ name: `${g.name}: arranque`, ok: false, error: String(err && err.message || err) }];
    }
    for (const r of results) {
      total += 1;
      if (!r.ok) failed += 1;
      console.log(`${r.ok ? '  ok ' : '  FALLA'}  ${r.name}${r.ok ? '' : `\n         ${r.error}`}`);
    }
  }
  console.log(failed ? `\n${failed} de ${total} pruebas fallaron.` : `\nVentana OK: ${total} pruebas.`);
  app.exit(failed ? 1 : 0);
});
