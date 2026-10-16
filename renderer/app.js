/* Corvid PNGtuber — Ventana principal: barra rápida, OBS / Streamer.bot, modos e inicio */
'use strict';

function renderQuickbar() {
  const bar = $('#quickbar');
  bar.innerHTML = '';
  cfg.expressions.forEach((ex) => {
    const b = document.createElement('button');
    b.className = `chip${ex.id === cfg.activeId ? ' active' : ''}`;
    b.innerHTML = `${ex.hotkey ? '<kbd></kbd>' : ''}<span></span>`;
    if (ex.hotkey) b.querySelector('kbd').textContent = keyLabel(ex.hotkey);
    b.querySelector('span').textContent = ex.name;
    b.addEventListener('click', () => setActive(ex.id));
    bar.appendChild(b);
  });
  // Accesorios: se encienden y apagan con un clic
  cfg.accessories.filter((a) => a.src).forEach((a) => {
    const b = document.createElement('button');
    b.className = `chip acc${a.on ? ' active' : ''}`;
    b.title = a.on ? 'Quitar' : 'Poner';
    b.innerHTML = `${a.hotkey ? '<kbd></kbd>' : ''}<span></span>`;
    if (a.hotkey) b.querySelector('kbd').textContent = keyLabel(a.hotkey);
    b.querySelector('span').textContent = `${a.on ? '✓ ' : ''}${a.name}`;
    b.addEventListener('click', () => setAccessory(a, !a.on));
    bar.appendChild(b);
  });
  $('#exprBadge').textContent = activeExpr().name;
  renderRemote();
}

// ---------- OBS, atajos y modos ----------


// Direcciones para Streamer.bot: una por expresión y las órdenes generales.
function renderRemote() {
  const sel = $('#selRemote');
  if (!sel) return;
  const prev = sel.value;
  const base = info.port ? `http://127.0.0.1:${info.port}/api` : null;
  const opts = [
    ...cfg.expressions.flatMap((e) => {
      const n = encodeURIComponent(e.name.replace(/\s+/g, '_'));
      return [[`Cambiar a “${e.name}”`, `/expresion/${n}`], [`“${e.name}” durante 10 s (luego vuelve)`, `/expresion/${n}?segundos=10`]];
    }),
    ...cfg.accessories.flatMap((a) => {
      const n = encodeURIComponent(a.name.replace(/\s+/g, '_'));
      return [[`Poner / quitar “${a.name}”`, `/accesorio/${n}/alternar`], [`Poner “${a.name}”`, `/accesorio/${n}/poner`], [`Quitar “${a.name}”`, `/accesorio/${n}/quitar`]];
    }),
    ['Gesto: ladear la cabeza', '/accion/ladeo'],
    ['Gesto: saltitos', '/accion/saltito'],
    ['Gesto: sacudirse', '/accion/sacudida'],
    ['Gesto: estirarse', '/accion/estirarse'],
    ['Gesto: salto', '/accion/salto'],
    ['Siguiente expresión', '/siguiente'],
    ['Expresión anterior', '/anterior'],
    ['Silenciar / activar micrófono', '/microfono/alternar'],
    ['Silenciar micrófono', '/microfono/silenciar'],
    ['Activar micrófono', '/microfono/activar'],
  ];
  sel.innerHTML = '';
  for (const [label, p] of opts) sel.add(new Option(label, p));
  if (opts.some(([, p]) => p === prev)) sel.value = prev;
  const sep = sel.value.includes('?') ? '&' : '?';
  const url = base && info.apiKey ? `${base}${sel.value}${sep}clave=${info.apiKey}` : 'No disponible (el servidor no arrancó)';
  $('#remoteUrl').textContent = url;
  $('#btnCopyRemote').disabled = !base;
}


function setMuted(v) {
  muted = v;
  $('#btnMute').textContent = muted ? 'Activar micrófono' : 'Silenciar';
  $('#btnMute').classList.toggle('active', muted);
  updatePills();
}

let captureHintTimer = null;
function setCapture(on) {
  document.body.classList.toggle('capture', on);
  $('#stage').style.background = on ? S.captureBg : '';
  if (on) {
    const hint = $('#captureHint');
    hint.classList.add('show');
    clearTimeout(captureHintTimer);
    captureHintTimer = setTimeout(() => hint.classList.remove('show'), 2500);
  }
}

let obsClients = 0;
function updatePills() {
  const mic = $('#pillMic');
  mic.className = `pill ${audio.error ? 'bad' : muted ? 'warn' : audio.analyser ? 'ok' : ''}`;
  mic.querySelector('span').textContent = audio.error ? 'Sin micrófono' : muted ? 'Silenciado' : 'Micrófono';
  const obs = $('#pillObs');
  obs.className = `pill ${!info.port ? 'bad' : obsClients > 0 ? 'ok' : ''}`;
  obs.querySelector('span').textContent = !info.port ? 'OBS no disponible' : obsClients > 0 ? `OBS conectado${obsClients > 1 ? ` (${obsClients})` : ''}` : 'OBS esperando';
}


// ---------- Inicio ----------

function wireStaticUi() {
  // Soltar un archivo fuera de una casilla no hace nada (las casillas gestionan su propio "drop").
  for (const t of ['dragover', 'drop']) document.addEventListener(t, (e) => e.preventDefault());

  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('active', p.dataset.page === tab.dataset.tab));
  }));

  $('#btnMute').addEventListener('click', () => setMuted(!muted));
  $('#btnCapture').addEventListener('click', () => setCapture(true));
  $('#btnAddExpr').addEventListener('click', addExpr);
  $('#btnAddAcc').addEventListener('click', addAccessory);
  wireAdjustOnStage();
  $('#btnResetRaven').addEventListener('click', () => {
    if (!confirm('¿Reemplazar tus expresiones por el cuervo de ejemplo? Tus imágenes siguen en la carpeta de imágenes.')) return;
    cfg.expressions = ravenExpressions();
    cfg.activeId = 'normal';
    renderExpressions();
    renderQuickbar();
    scheduleSave();
    applyHotkeys();
  });
  $('#btnCalibrate').addEventListener('click', calibrate);
  $('#btnOpenImages').addEventListener('click', () => api.openImagesFolder());

  $('#filePicker').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file && pickTarget && pickTarget.acc) importAccessoryImage(file, pickTarget.acc);
    else if (file && pickTarget) importImage(file, pickTarget.ex, pickTarget.key, pickTarget.set);
    pickTarget = null;
  });

  $('#selDevice').addEventListener('change', (e) => { S.deviceId = e.target.value; scheduleSave(); startMic(); });
  navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

  const bg = $('#inpBg');
  bg.value = S.captureBg;
  const setBg = (c) => { S.captureBg = c; bg.value = c; scheduleSave(); if (document.body.classList.contains('capture')) $('#stage').style.background = c; };
  bg.addEventListener('input', () => setBg(bg.value));
  document.querySelectorAll('.swatch').forEach((s) => s.addEventListener('click', () => setBg(s.dataset.color)));

  for (const [id, setting] of [['#keyMute', 'muteKey'], ['#keyCapture', 'captureKey']]) {
    const btn = $(id);
    btn.addEventListener('click', () => recordKey(btn, S[setting], (acc) => assignKey({ setting }, acc)));
  }

  $('#selRemote').addEventListener('change', renderRemote);
  $('#btnCopyRemote').addEventListener('click', async () => {
    await api.copy($('#remoteUrl').textContent);
    toast('Dirección copiada. Pégala en Fetch URL de Streamer.bot.');
  });

  $('#btnExport').addEventListener('click', async () => {
    try {
      const r = await api.exportAvatar(JSON.parse(JSON.stringify(cfg)));
      if (r) toast(`Avatar exportado (${r.files} imágenes). Se abre la carpeta.`);
    } catch {
      toast('No pude exportar el avatar', 'error');
    }
  });
  $('#btnImportFolder').addEventListener('click', () => { $('#folderPicker').value = ''; $('#folderPicker').click(); });
  $('#folderPicker').addEventListener('change', (e) => { if (e.target.files.length) importFolder(e.target.files); });

  const url = info.port ? `http://127.0.0.1:${info.port}/obs` : 'No se pudo iniciar el servidor';
  $('#obsUrl').textContent = url;
  $('#btnCopyUrl').disabled = !info.port;
  $('#btnCopyUrl').addEventListener('click', async () => { await api.copy(url); toast('URL copiada. Pégala en OBS.'); });

  // Atajos locales cuando la ventana tiene el foco: 1…9 eligen las nueve primeras expresiones
  document.addEventListener('keydown', (e) => {
    if (recording) return;
    if (e.key === 'Escape' && document.body.classList.contains('capture')) return setCapture(false);
    if (e.key === 'Escape' && editingAccId) return setEditingAcc('');
    if (e.target.closest('input, select, textarea') || e.ctrlKey || e.altKey || e.metaKey) return;
    if (/^[1-9]$/.test(e.key)) {
      const ex = cfg.expressions[Number(e.key) - 1];
      if (ex) setActive(ex.id);
    }
  });

  api.onHotkey((h) => {
    if (h.type === 'expression') {
      if (h.seconds > 0) setTemporary(h.id, h.seconds); else setActive(h.id);
    } else if (h.type === 'action') {
      playAction(h.name);
    } else if (h.type === 'accessory' || h.type === 'accessorySet') {
      const a = cfg.accessories.find((x) => x.id === h.id);
      if (a) setAccessory(a, h.type === 'accessory' ? !a.on : !!h.value);
    } else if (h.type === 'cycle') {
      const list = cfg.expressions;
      const i = list.indexOf(activeExpr());
      setActive(list[(i + h.dir + list.length) % list.length].id);
    } else if (h.type === 'mute' || h.type === 'muteSet') {
      setMuted(h.type === 'mute' ? !muted : !!h.value);
      toast(muted ? 'Micrófono silenciado' : 'Micrófono activo');
    } else if (h.type === 'capture') {
      setCapture(!document.body.classList.contains('capture'));
    }
  });
  api.onObsClients((n) => { obsClients = n; updatePills(); });
}

async function init() {
  info = await api.info();
  obsClients = info.obsClients || 0;
  const saved = await api.loadConfig();
  cfg = {
    version: 2,
    settings: { ...DEFAULT_SETTINGS, ...(saved && saved.settings) },
    expressions: saved && Array.isArray(saved.expressions) && saved.expressions.length ? saved.expressions : null,
    activeId: saved && saved.activeId,
  };
  S = cfg.settings;
  cfg.accessories = saved && Array.isArray(saved.accessories) ? saved.accessories : [];
  if (!cfg.expressions) cfg.expressions = ravenExpressions();
  // Configuración de la versión 1: teclas fijas modificador+1…9 y M/H, y sin "parpadeo hablando".
  if (!saved || (saved.version || 1) < 2) {
    if (S.muteKey == null) S.muteKey = `${modAcc()}+M`;
    if (S.captureKey == null) S.captureKey = `${modAcc()}+H`;
    cfg.expressions.forEach((e, i) => { if (e.hotkey === undefined) e.hotkey = defaultKey(i); });
  }
  cfg.expressions.forEach((e) => { e.frames = { ...emptyFrames(), ...e.frames }; });
  if (!cfg.expressions.some((e) => e.id === cfg.activeId)) cfg.activeId = cfg.expressions[0].id;

  view = new AvatarView($('#avatar'), makeResolver('file', info.imagesUrl));

  wireStaticUi();
  buildMicControls();
  buildAnimControls();
  renderExpressions();
  renderAccessories();
  renderQuickbar();
  await applyHotkeys();
  updatePills();
  scheduleBlink(performance.now());
  lastActivity = performance.now();
  scheduleIdleAction(performance.now());
  // Guardar ya: el servidor (Streamer.bot) lee las expresiones de config.json, que en una instalación
  // nueva no existe hasta el primer cambio; también deja grabada la migración de versiones antiguas.
  api.saveConfig(cfg).catch(() => toast('No se pudo guardar la configuración', 'error'));

  // setInterval (no requestAnimationFrame) para que siga funcionando minimizada.
  setInterval(tick, 16);
  startMic();
}

init();
