// Servidor local para la fuente de navegador de OBS.
// Sirve la página del avatar y le envía el estado en vivo por Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function safeJoin(base, rel) {
  const full = path.normalize(path.join(base, rel));
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

// Las mismas que ACTIONS en renderer/loop.js
const ACCIONES = ['ladeo', 'saltito', 'sacudida', 'estirarse', 'salto', 'despertar'];

const normName = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').trim().toLowerCase();

// Control remoto (Streamer.bot, Stream Deck…): GET /api/...?clave=XXXX
//   /api/expresion/<número | nombre | id>   /api/siguiente   /api/anterior
//   /api/microfono/silenciar | activar | alternar           /api/expresiones (lista)
//   /api/accesorio/<nombre | número | id>/poner | quitar | alternar
//   /api/expresion/<…>?segundos=5   (temporal: luego vuelve a la de antes)
//   /api/accion/ladeo | saltito | sacudida | estirarse | salto | despertar
// apiKey: clave obligatoria; getExpressions() / getAccessories(): [{ id, name }];
// onCommand(cmd): reenvía la orden a la ventana.
function handleApi(req, res, pathname, { apiKey, getExpressions, getAccessories, onCommand }) {
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const query = new URL(req.url, 'http://localhost').searchParams;
  const clave = query.get('clave');
  if (!apiKey || clave !== apiKey) return json(403, { ok: false, error: 'Falta la clave o no es correcta' });

  // Se parte la dirección sin decodificar y luego cada trozo: así un "/" del nombre (%2F) no la rompe.
  let parts;
  try {
    parts = new URL(req.url, 'http://localhost').pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent); // sin "api"
  } catch {
    return json(400, { ok: false, error: 'Dirección mal formada' });
  }
  const exprs = getExpressions ? getExpressions() : [];
  const lista = () => exprs.map((e, i) => ({ numero: i + 1, nombre: e.name, id: e.id }));

  const accs = getAccessories ? getAccessories() : [];
  const listaAcc = () => accs.map((a, i) => ({ numero: i + 1, nombre: a.name, id: a.id }));

  if (parts[0] === 'expresiones') return json(200, { ok: true, expresiones: lista(), accesorios: listaAcc() });

  if (parts[0] === 'accesorio' && parts[1]) {
    // /api/accesorio/<nombre>[/poner|quitar|alternar]; un "/" en el nombre llega codificado (%2F).
    const ACCIONES = { poner: true, quitar: false, alternar: null };
    const conAccion = parts.length > 2;
    const q = parts[1];
    const n = /^\d+$/.test(q) ? Number(q) : NaN;
    const a = (n >= 1 && accs[n - 1]) || accs.find((x) => x.id === q) || accs.find((x) => normName(x.name) === normName(q));
    if (!a) return json(404, { ok: false, error: `No hay ningún accesorio “${q}”`, accesorios: listaAcc() });
    const accion = conAccion ? ACCIONES[parts[parts.length - 1]] : null;
    if (accion === undefined) return json(404, { ok: false, error: 'Usa /poner, /quitar o /alternar' });
    onCommand(accion === null ? { type: 'accessory', id: a.id } : { type: 'accessorySet', id: a.id, value: accion });
    return json(200, { ok: true, accesorio: a.name });
  }

  if (parts[0] === 'expresion' && parts[1]) {
    const q = parts.slice(1).join('/');
    const n = /^\d+$/.test(q) ? Number(q) : NaN;
    const ex = (n >= 1 && exprs[n - 1]) || exprs.find((e) => e.id === q) || exprs.find((e) => normName(e.name) === normName(q));
    if (!ex) return json(404, { ok: false, error: `No hay ninguna expresión “${q}”`, expresiones: lista() });
    let seconds = 0;
    if (query.has('segundos')) {
      seconds = Number(String(query.get('segundos')).replace(',', '.'));
      if (!(seconds > 0 && seconds <= 3600)) return json(400, { ok: false, error: 'segundos debe ser un número entre 0 y 3600' });
    }
    onCommand(seconds ? { type: 'expression', id: ex.id, seconds } : { type: 'expression', id: ex.id });
    return json(200, seconds ? { ok: true, expresion: ex.name, segundos: seconds } : { ok: true, expresion: ex.name });
  }

  if (parts[0] === 'accion') {
    const nombre = normName(parts[1] || '');
    if (!ACCIONES.includes(nombre)) return json(404, { ok: false, error: `Usa /api/accion/${ACCIONES.join(', ')}` });
    onCommand({ type: 'action', name: nombre });
    return json(200, { ok: true, accion: nombre });
  }

  if (parts[0] === 'siguiente' || parts[0] === 'anterior') {
    onCommand({ type: 'cycle', dir: parts[0] === 'siguiente' ? 1 : -1 });
    return json(200, { ok: true });
  }

  if (parts[0] === 'microfono') {
    const accion = { silenciar: true, activar: false, alternar: null }[parts[1]];
    if (accion === undefined) return json(404, { ok: false, error: 'Usa /api/microfono/silenciar, activar o alternar' });
    onCommand(accion === null ? { type: 'mute' } : { type: 'muteSet', value: accion });
    return json(200, { ok: true });
  }

  return json(404, { ok: false, error: 'Orden desconocida' });
}

function createAvatarServer({ rendererDir, assetsDir, imagesDir, onClientsChange, apiKey, getExpressions, getAccessories, onCommand }) {
  const clients = new Set();
  let lastState = null;
  let port = null;

  const notify = () => onClientsChange && onClientsChange(clients.size);

  function serveFile(res, file) {
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No encontrado');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  }

  // Solo atiende a este equipo: otras webs abiertas en el navegador no pueden leer ni controlar nada.
  function allowed(req) {
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host)) return false; // evita "DNS rebinding"
    const origin = req.headers.origin;
    return !origin || hosts.some((h) => origin === `http://${h}`);
  }

  function handle(req, res) {
    if (!allowed(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Prohibido');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400); res.end(); return;
    }

    if (pathname === '/' || pathname === '/obs') {
      return serveFile(res, path.join(rendererDir, 'obs.html'));
    }

    if (pathname.startsWith('/api/')) return handleApi(req, res, pathname, { apiKey, getExpressions, getAccessories, onCommand });

    if (pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      if (lastState) res.write(`data: ${lastState}\n\n`);
      clients.add(res);
      notify();
      req.on('close', () => { clients.delete(res); notify(); });
      return;
    }

    const routes = [['/app/', rendererDir], ['/assets/', assetsDir], ['/user/', imagesDir]];
    for (const [prefix, base] of routes) {
      if (pathname.startsWith(prefix)) {
        const file = safeJoin(base, pathname.slice(prefix.length));
        if (file) return serveFile(res, file);
        break;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }

  const server = http.createServer(handle);

  // Mantiene viva la conexión aunque no haya cambios.
  const ping = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n');
  }, 20000);
  server.on('close', () => clearInterval(ping));

  function listen(startPort, attempts = 10) {
    return new Promise((resolve, reject) => {
      port = startPort;
      const tryListen = () => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && port < startPort + attempts - 1) {
            port += 1;
            tryListen();
          } else reject(err);
        });
        server.listen(port, '127.0.0.1', () => {
          server.removeAllListeners('error');
          // Un error del servidor ya en marcha no debe cerrar la app (sin oyente, Node lo lanzaría).
          server.on('error', (err) => console.error('Servidor de OBS:', err));
          resolve(port);
        });
      };
      tryListen();
    });
  }

  function broadcast(state) {
    lastState = JSON.stringify(state);
    for (const c of clients) c.write(`data: ${lastState}\n\n`);
  }

  return { listen, broadcast, close: () => server.close(), clientCount: () => clients.size };
}

module.exports = { createAvatarServer };
