// Exportar el avatar a una carpeta que "Importar carpeta" vuelve a cargar tal cual:
//   <expresión>/quieto.png, hablando.png…   accesorios/<nombre>.png   avatar.json (teclas y ajustes)
const fs = require('fs');
const path = require('path');

const SLOT_FILE = { idle: 'quieto', talk: 'hablando', blink: 'parpadeo', talkBlink: 'parpadeo_hablando', shout: 'grito' };

// "user:archivo.png" o "asset:raven/x.svg" -> ruta en disco (nunca fuera de su carpeta)
function refToPath(ref, { imagesDir, assetsDir }) {
  if (typeof ref !== 'string') return null;
  const [base, rel] = ref.startsWith('user:') ? [imagesDir, ref.slice(5)] : ref.startsWith('asset:') ? [assetsDir, ref.slice(6)] : [];
  if (!base) return null;
  const full = path.normalize(path.join(base, rel));
  return full.startsWith(base + path.sep) ? full : null;
}

// Nombre válido en Windows y sin repetir (sin distinguir mayúsculas)
function uniqueName(name, used) {
  const clean = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().replace(/[. ]+$/, '') || 'sin nombre';
  let n = clean;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${clean} (${i})`;
  used.add(n.toLowerCase());
  return n;
}

// Escribe el avatar en 'dest' (que debe existir). Devuelve cuántas imágenes copió.
function writeAvatar(dest, cfg, dirs) {
  let files = 0;
  const copy = (ref, dir, name) => {
    const src = refToPath(ref, dirs);
    if (!src || !fs.existsSync(src)) return null;
    fs.mkdirSync(dir, { recursive: true });
    const file = name + path.extname(src).toLowerCase();
    // read + write (no copyFileSync): funciona también con las imágenes de ejemplo dentro del paquete .asar
    fs.writeFileSync(path.join(dir, file), fs.readFileSync(src));
    files += 1;
    return file;
  };

  const usedDirs = new Set(['accesorios']); // reservada para los accesorios
  const expresiones = (cfg.expressions || []).map((ex) => {
    const carpeta = uniqueName(ex.name, usedDirs);
    for (const [slot, file] of Object.entries(SLOT_FILE)) copy(ex.frames && ex.frames[slot], path.join(dest, carpeta), file);
    return { nombre: ex.name, carpeta, tecla: ex.hotkey || null };
  });

  const usedAcc = new Set();
  const byId = new Map((cfg.expressions || []).map((e) => [e.id, e.name]));
  const accesorios = (cfg.accessories || []).filter((a) => a.src).map((a) => ({
    nombre: a.name,
    archivo: copy(a.src, path.join(dest, 'accesorios'), uniqueName(a.name, usedAcc)),
    tecla: a.hotkey || null,
    puesto: !!a.on,
    detras: !!a.behind,
    cuando: a.when || 'siempre',
    inercia: a.inertia ?? 50,
    ajuste: a.adjust || null,
    expresiones: (a.exprs || []).map((id) => byId.get(id)).filter(Boolean),
  })).filter((a) => a.archivo);

  const { deviceId, ...ajustes } = cfg.settings || {}; // el micrófono depende de cada PC
  const activa = (cfg.expressions || []).find((e) => e.id === cfg.activeId);
  const json = {
    formato: 'corvid-avatar',
    version: 1,
    exportado: new Date().toISOString(),
    activa: activa ? activa.name : null,
    ajustes,
    expresiones,
    accesorios,
  };
  fs.writeFileSync(path.join(dest, 'avatar.json'), JSON.stringify(json, null, 2), 'utf-8');
  return files;
}

module.exports = { writeAvatar, refToPath, uniqueName, SLOT_FILE };
