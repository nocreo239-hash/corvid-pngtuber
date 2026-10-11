/* Corvid PNGtuber — Importar carpeta (y avatar.json de "Exportar avatar") */
'use strict';

// ---------- Importar carpeta ----------
// Una subcarpeta por expresión con quieto.png, hablando.png, parpadeo.png, parpadeo_hablando.png y grito.png
// (también vale una sola carpeta con esos archivos, o los nombres en inglés: idle, talk, blink, talk_blink, shout).

const FILE_SLOT = {
  quieto: 'idle', idle: 'idle',
  hablando: 'talk', talk: 'talk',
  parpadeo: 'blink', blink: 'blink',
  parpadeo_hablando: 'talkBlink', talk_blink: 'talkBlink', talkblink: 'talkBlink',
  grito: 'shout', shout: 'shout',
};
const normName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_-]+/g, ' ').trim().toLowerCase();
const prettyName = (s) => { const n = s.replace(/[_-]+/g, ' ').trim(); return n.charAt(0).toUpperCase() + n.slice(1); };

async function importFolder(fileList) {
  const groups = new Map(); // carpeta -> { slot: File }
  const accFiles = []; // archivos de la subcarpeta "accesorios": uno por accesorio
  let manifest = null; // avatar.json de "Exportar avatar": nombres exactos, teclas y ajustes
  for (const file of fileList) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    if (parts.length <= 2 && file.name.toLowerCase() === 'avatar.json') {
      try {
        const j = JSON.parse(await file.text());
        if (j && j.formato === 'corvid-avatar') manifest = j;
      } catch { /* json roto: se importan solo las imágenes */ }
      continue;
    }
    if (parts.length >= 2 && normName(parts[parts.length - 2]) === 'accesorios' && /\.(png|gif|webp|svg)$/i.test(file.name)) {
      accFiles.push(file);
      continue;
    }
    const m = parts[parts.length - 1].toLowerCase().match(/^(.+)\.(png|gif|webp|jpe?g|svg)$/);
    const slot = m && FILE_SLOT[m[1]];
    if (!slot) continue;
    const dir = parts.length >= 2 ? parts[parts.length - 2] : 'Importada';
    if (!groups.has(dir)) groups.set(dir, {});
    groups.get(dir)[slot] = file;
  }
  if (!groups.size && !accFiles.length) return toast('No encontré quieto.png, hablando.png… en esa carpeta', 'error');

  const mExpr = new Map(((manifest && manifest.expresiones) || []).map((e) => [e.carpeta, e]));
  const mAcc = new Map(((manifest && manifest.accesorios) || []).map((a) => [a.archivo, a]));
  // Con avatar.json, en su orden; si no, "normal" primero y el resto por orden alfabético.
  const order = (d) => (mExpr.has(d) ? [...mExpr.keys()].indexOf(d) : 1e6);
  const dirs = [...groups.keys()].sort((a, b) => order(a) - order(b)
    || (normName(a) === 'normal' ? -1 : normName(b) === 'normal' ? 1 : a.localeCompare(b)));
  let nuevas = 0;
  let actualizadas = 0;
  const imported = []; // [expresión, entrada del json]
  try {
    for (const [i, dir] of dirs.entries()) {
      const name = mExpr.has(dir) ? mExpr.get(dir).nombre : prettyName(dir);
      toast(`Importando ${i + 1}/${dirs.length}: ${name}…`);
      // Si ya hay una expresión con ese nombre, se actualizan sus imágenes en vez de duplicarla.
      let ex = cfg.expressions.find((e) => normName(e.name) === normName(name));
      if (ex) {
        ex.frames = emptyFrames();
        actualizadas += 1;
      } else {
        ex = newExpr(name);
        if (manifest) ex.hotkey = null; // la pondrá el avatar.json (si no, las de por defecto chocarían)
        cfg.expressions.push(ex);
        nuevas += 1;
      }
      for (const [slot, file] of Object.entries(groups.get(dir))) {
        ex.frames[slot] = await api.saveImage(file.name, new Uint8Array(await file.arrayBuffer()));
      }
      imported.push([ex, mExpr.get(dir)]);
    }
    for (const file of accFiles) {
      const info = mAcc.get(file.name);
      const name = info ? info.nombre : prettyName(file.name.replace(/\.[^.]+$/, ''));
      let a = cfg.accessories.find((x) => normName(x.name) === normName(name));
      if (a) actualizadas += 1;
      else {
        a = { id: uid(), name, src: null, hotkey: null, on: false, behind: false };
        cfg.accessories.push(a);
        nuevas += 1;
      }
      a.src = await api.saveImage(file.name, new Uint8Array(await file.arrayBuffer()));
      if (info) {
        Object.assign(a, {
          on: !!info.puesto, behind: !!info.detras, when: info.cuando || 'siempre',
          inertia: info.inercia ?? 50, adjust: info.ajuste || null,
          exprs: (info.expresiones || []).map((n) => (cfg.expressions.find((e) => normName(e.name) === normName(n)) || {}).id).filter(Boolean),
        });
        imported.push([a, info]);
      }
    }
  } catch {
    toast('No pude guardar alguna imagen', 'error');
  }

  const avisos = []; // se muestran al final (un toast intermedio quedaría tapado por el de "Listo")
  if (manifest) {
    // Teclas: solo si están libres (no se le quita la tecla a nada que ya tengas).
    for (const [item, info] of imported) {
      if (!info || !info.tecla || item.hotkey === info.tecla) continue;
      const taken = usedKeys().includes(info.tecla);
      if (!taken) item.hotkey = info.tecla;
    }
    // Las expresiones que no aparecen en el json reciben una tecla por defecto libre; las del json, la suya (o ninguna).
    for (const [item, info] of imported) if (!info && cfg.expressions.includes(item) && !item.hotkey) item.hotkey = nextFreeKey();
    const act = manifest.activa && cfg.expressions.find((e) => normName(e.name) === normName(manifest.activa));
    if (act) cfg.activeId = act.id;
    if (manifest.ajustes && confirm('¿Aplicar también los ajustes guardados en el avatar (micrófono, animación, tamaño y posición, teclas de silenciar y modo captura)?')) {
      const keep = S.deviceId;
      Object.assign(S, manifest.ajustes, { deviceId: keep });
      // Las teclas de silenciar / modo captura del avatar no pueden quitarle la suya a una expresión o accesorio.
      const itemKeys = new Set([...cfg.expressions, ...cfg.accessories].map((x) => x.hotkey).filter(Boolean));
      for (const k of ['muteKey', 'captureKey']) {
        if (S[k] && itemKeys.has(S[k])) { avisos.push(`${keyLabel(S[k])} ya la usaba otra cosa: elige otra tecla para ${k === 'muteKey' ? 'silenciar' : 'el modo captura'} en la pestaña OBS`); S[k] = null; }
      }
      if (S.muteKey && S.muteKey === S.captureKey) S.captureKey = null;
      buildMicControls();
      buildAnimControls();
    }
  }
  renderExpressions();
  renderAccessories();
  renderQuickbar();
  scheduleSave();
  applyHotkeys();
  const resumen = `Listo: ${nuevas} nuevas, ${actualizadas} actualizadas`;
  if (avisos.length) toast(`${resumen}. Ojo: ${avisos.join('. ')}`, 'error');
  else toast(resumen);
}
