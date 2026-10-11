// Prueba rápida del servidor de OBS sin abrir Electron:  npm run test:server
const path = require('path');
const http = require('http');
const assert = require('assert');
const { createAvatarServer } = require('../server');

const root = path.join(__dirname, '..');
const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
  }).on('error', reject);
});

(async () => {
  let clients = 0;
  const srv = createAvatarServer({
    rendererDir: path.join(root, 'renderer'),
    assetsDir: path.join(root, 'assets'),
    imagesDir: path.join(root, 'assets'),
    onClientsChange: (n) => (clients = n),
    apiKey: 'k1',
    getExpressions: () => [{ id: 'a', name: 'Feliz' }, { id: 'b', name: 'Llorando risa' }, { id: 'c', name: 'Señor Ñu' }],
    getAccessories: () => [{ id: 'h', name: 'Sombrero vaquero' }, { id: 'g', name: 'Gafas 3D/rojas' }],
    onCommand: (c) => commands.push(c),
  });
  const commands = [];
  const port = await srv.listen(47474);

  // Control remoto (Streamer.bot)
  assert.strictEqual((await get(port, '/api/expresiones')).status, 403, 'sin clave no se puede');
  assert.strictEqual((await get(port, '/api/expresiones?clave=mal')).status, 403, 'clave incorrecta');
  const lista = JSON.parse((await get(port, '/api/expresiones?clave=k1')).body);
  assert.strictEqual(lista.expresiones.length, 3);
  assert.strictEqual((await get(port, '/api/expresion/2?clave=k1')).status, 200);
  assert.strictEqual((await get(port, '/api/expresion/llorando_risa?clave=k1')).status, 200);
  assert.strictEqual((await get(port, `/api/expresion/${encodeURIComponent('señor_ñu')}?clave=k1`)).status, 200);
  assert.strictEqual((await get(port, '/api/expresion/nada?clave=k1')).status, 404);
  assert.strictEqual((await get(port, '/api/siguiente?clave=k1')).status, 200);
  assert.strictEqual((await get(port, '/api/microfono/silenciar?clave=k1')).status, 200);
  assert.strictEqual((await get(port, '/api/microfono/bailar?clave=k1')).status, 404);
  assert.strictEqual((await get(port, '/api/accesorio/sombrero_vaquero?clave=k1')).status, 200);
  assert.strictEqual((await get(port, '/api/accesorio/1/poner?clave=k1')).status, 200);
  assert.strictEqual((await get(port, '/api/accesorio/sombrero_vaquero/quitar?clave=k1')).status, 200);
  assert.strictEqual((await get(port, '/api/accesorio/gafas?clave=k1')).status, 404);
  assert.strictEqual((await get(port, '/api/accesorio/1/bailar?clave=k1')).status, 404);
  assert.strictEqual(JSON.parse((await get(port, '/api/expresiones?clave=k1')).body).accesorios[0].nombre, 'Sombrero vaquero');
  // Nombre con "/" (la dirección lo codifica como %2F)
  assert.strictEqual((await get(port, `/api/accesorio/${encodeURIComponent('Gafas_3D/rojas')}/poner?clave=k1`)).status, 200);
  assert.strictEqual((await get(port, `/api/accesorio/${encodeURIComponent('Gafas_3D/rojas')}?clave=k1`)).status, 200);
  commands.splice(-2).forEach((c, i) => assert.deepStrictEqual(c, i ? { type: 'accessory', id: 'g' } : { type: 'accessorySet', id: 'g', value: true }));
  assert.deepStrictEqual(commands, [
    { type: 'expression', id: 'b' }, { type: 'expression', id: 'b' }, { type: 'expression', id: 'c' },
    { type: 'cycle', dir: 1 }, { type: 'muteSet', value: true },
    { type: 'accessory', id: 'h' }, { type: 'accessorySet', id: 'h', value: true }, { type: 'accessorySet', id: 'h', value: false },
  ]);

  // Otras webs no pueden usar el servidor
  assert.strictEqual((await get(port, '/obs', { Origin: 'https://malvado.com' })).status, 403, 'origen ajeno');
  assert.strictEqual((await get(port, '/obs', { Host: `malvado.com:${port}` })).status, 403, 'DNS rebinding');
  assert.strictEqual((await get(port, '/obs', { Origin: `http://127.0.0.1:${port}` })).status, 200, 'su propia página sí');
  assert.strictEqual((await get(port, '/obs', { Host: `localhost:${port}` })).status, 200, 'localhost también');

  const obs = await get(port, '/obs');
  assert.strictEqual(obs.status, 200);
  assert.ok(obs.body.includes('/app/obs.js'));

  const js = await get(port, '/app/avatar.js');
  assert.strictEqual(js.status, 200);
  assert.ok(js.type.startsWith('text/javascript'));

  const svg = await get(port, '/assets/raven/raven_open_closed.svg');
  assert.strictEqual(svg.status, 200);
  assert.strictEqual(svg.type, 'image/svg+xml');

  const evil = await get(port, '/assets/..%2F..%2Fpackage.json');
  assert.strictEqual(evil.status, 404, 'no debe salir de la carpeta');

  // Eventos en vivo
  const received = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        const m = buf.match(/data: (.+)\n\n/);
        if (m) { res.destroy(); resolve(JSON.parse(m[1])); }
      });
      setTimeout(() => srv.broadcast({ src: 'asset:raven/raven_open_open.svg', talking: true }), 100);
    }).on('error', reject);
  });
  assert.strictEqual(received.talking, true);
  assert.strictEqual(clients >= 0, true);

  console.log(`Servidor OK en el puerto ${port}: páginas, imágenes, seguridad de rutas y eventos en vivo.`);
  process.exit(0);
})().catch((err) => { console.error('FALLÓ:', err.message); process.exit(1); });
