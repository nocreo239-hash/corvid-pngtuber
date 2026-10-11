// Prueba de "Exportar avatar" sin abrir Electron:  npm run test:export
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeAvatar, refToPath, uniqueName } = require('../avatar-export');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corvid-export-'));
try {
  const imagesDir = path.join(tmp, 'images');
  const dest = path.join(tmp, 'salida');
  fs.mkdirSync(imagesDir);
  fs.mkdirSync(dest);
  fs.writeFileSync(path.join(imagesDir, '1-a.png'), 'png-a');
  fs.writeFileSync(path.join(imagesDir, '2-sombrero.png'), 'png-s');
  const dirs = { imagesDir, assetsDir: path.join(root, 'assets') };

  // Nombres válidos en Windows y sin repetir
  const used = new Set(['accesorios']);
  assert.strictEqual(uniqueName('Feliz: ¿sí?', used), 'Feliz ¿sí');
  assert.strictEqual(uniqueName('feliz ¿sí', used), 'feliz ¿sí (2)');
  assert.strictEqual(uniqueName('Accesorios', used), 'Accesorios (2)', 'la carpeta "accesorios" está reservada');

  // Nunca fuera de su carpeta
  assert.strictEqual(refToPath('user:../../secreto.txt', dirs), null);
  assert.strictEqual(refToPath('otra:cosa', dirs), null);

  const cfg = {
    activeId: 'b',
    settings: { deviceId: 'mi-micro', scale: 120 },
    expressions: [
      { id: 'a', name: 'Normal', hotkey: 'F1', frames: { idle: 'user:1-a.png', talk: 'asset:raven/raven_open_open.svg', blink: 'user:no-existe.png' },
        gestos: [{ idle: 'user:1-a.png', talk: null }, { idle: null }, { talk: 'user:2-sombrero.png' }] },
      { id: 'b', name: 'Feliz: ¿sí?', hotkey: null, frames: { idle: 'user:1-a.png' } },
    ],
    accessories: [
      { id: 'h', name: 'Sombrero', src: 'user:2-sombrero.png', hotkey: 'F11', on: true, behind: false, when: 'gritando',
        inertia: 30, adjust: { x: 1, y: 2, scale: 90, rot: 5, flip: true }, exprs: ['b'] },
      { id: 'z', name: 'Sin imagen', src: null },
    ],
  };
  const n = writeAvatar(dest, cfg, dirs);
  assert.strictEqual(n, 6, 'debía copiar 6 imágenes (4 + 2 de gestos; la que no existe se salta)');
  assert.ok(fs.existsSync(path.join(dest, 'Normal', 'gesto1', 'quieto.png')), 'falta el gesto 1');
  assert.ok(!fs.existsSync(path.join(dest, 'Normal', 'gesto2')), 'un gesto vacío no debe crear carpeta');
  assert.ok(fs.existsSync(path.join(dest, 'Normal', 'gesto3', 'hablando.png')), 'falta el gesto 3');

  const j = JSON.parse(fs.readFileSync(path.join(dest, 'avatar.json'), 'utf-8'));
  assert.strictEqual(j.formato, 'corvid-avatar');
  assert.strictEqual(j.activa, 'Feliz: ¿sí?');
  assert.ok(!('deviceId' in j.ajustes), 'el micrófono no se exporta');
  assert.strictEqual(j.ajustes.scale, 120);
  assert.deepStrictEqual(j.expresiones.map((e) => [e.nombre, e.carpeta, e.tecla]), [['Normal', 'Normal', 'F1'], ['Feliz: ¿sí?', 'Feliz ¿sí', null]]);
  assert.deepStrictEqual(fs.readdirSync(path.join(dest, 'Normal')).sort(), ['gesto1', 'gesto3', 'hablando.svg', 'quieto.png']);
  assert.strictEqual(fs.readFileSync(path.join(dest, 'Normal', 'quieto.png'), 'utf-8'), 'png-a');
  assert.strictEqual(j.accesorios.length, 1, 'el accesorio sin imagen no se exporta');
  const s = j.accesorios[0];
  assert.deepStrictEqual([s.archivo, s.tecla, s.puesto, s.cuando, s.inercia, s.expresiones], ['Sombrero.png', 'F11', true, 'gritando', 30, ['Feliz: ¿sí?']]);
  assert.deepStrictEqual(s.ajuste, { x: 1, y: 2, scale: 90, rot: 5, flip: true });
  assert.ok(fs.existsSync(path.join(dest, 'accesorios', 'Sombrero.png')));

  console.log(`Exportar OK: ${n} imágenes, nombres seguros, avatar.json completo.`);
} catch (err) {
  console.error('FALLÓ:', err.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
