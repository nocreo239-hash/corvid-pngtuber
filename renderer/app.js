/* Corvid PNGtuber — lógica de la ventana principal */
'use strict';

const api = window.corvid;
const $ = (sel) => document.querySelector(sel);

// ---------- Configuración por defecto ----------

const DEFAULT_SETTINGS = {
  deviceId: '',
  noiseSuppression: true,
  gainDb: 0,
  talkThreshold: 0.42,
  shoutThreshold: 0.8,
  shoutEnabled: true,
  holdMs: 180,
  shoutHoldMs: 250,
  voiceFilter: true,
  scale: 100,
  offsetX: 0,
  offsetY: 0,
  flip: false,
  bounce: true,
  bounceHeight: 6,
  bounceMs: 260,
  squash: 8,
  sway: true,
  swayAmount: 1,
  swaySpeed: 4,
  breathing: true,
  shake: true,
  shakeAmount: 4,
  blinkEnabled: true,
  blinkMin: 2.5,
  blinkMax: 6,
  blinkMs: 140,
  captureBg: '#00ff00',
  modifier: 'ctrl-shift', // solo para las teclas por defecto (Ctrl+Shift+1…9)
  muteKey: null,
  captureKey: null,
};

const SLOTS = [
  { key: 'idle', label: 'Quieto' },
  { key: 'talk', label: 'Hablando' },
  { key: 'blink', label: 'Parpadeo' },
  { key: 'talkBlink', label: 'Parpadeo hablando' },
  { key: 'shout', label: 'Grito' },
];
const emptyFrames = () => Object.fromEntries(SLOTS.map((s) => [s.key, null]));

const raven = (eyes, beak) => `asset:raven/raven_${eyes}_${beak}.svg`;

function ravenExpressions() {
  const ex = (id, name, frames, i) => ({ id, name, hotkey: defaultKey(i), frames: { ...emptyFrames(), ...frames } });
  return [
    ex('normal', 'Normal', { idle: raven('open', 'closed'), talk: raven('open', 'open'), blink: raven('closed', 'closed'), talkBlink: raven('closed', 'open'), shout: raven('squint', 'wide') }, 0),
    ex('feliz', 'Feliz', { idle: raven('happy', 'closed'), talk: raven('happy', 'open'), shout: raven('happy', 'wide') }, 1),
    ex('enojado', 'Enojado', { idle: raven('angry', 'closed'), talk: raven('angry', 'open'), blink: raven('closed', 'closed'), talkBlink: raven('closed', 'open'), shout: raven('angry', 'wide') }, 2),
    ex('sorprendido', 'Sorprendido', { idle: raven('wide', 'closed'), talk: raven('wide', 'open'), blink: raven('closed', 'closed'), talkBlink: raven('closed', 'open'), shout: raven('wide', 'wide') }, 3),
  ];
}

// ---------- Teclas ----------
// Se guardan como aceleradores de Electron: "Ctrl+Shift+1", "F13", "num5", "Alt+Q"...

const MOD_ACC = { 'ctrl-shift': 'Ctrl+Shift', 'ctrl-alt': 'Ctrl+Alt', 'alt-shift': 'Alt+Shift' };
const modAcc = () => MOD_ACC[S && S.modifier] || 'Ctrl+Shift';
const defaultKey = (i) => (i < 9 ? `${modAcc()}+${i + 1}` : null);

const CODE_KEYS = {
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ScrollLock: 'Scrolllock',
  Space: 'Space', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backquote: '`',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

function accFromEvent(e) {
  const c = e.code;
  let key = null;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^Numpad\d$/.test(c)) key = `num${c.slice(6)}`;
  else if (/^F([1-9]|1\d|2[0-4])$/.test(c)) key = c;
  else key = CODE_KEYS[c] || null;
  if (!key) return null; // solo un modificador o una tecla no soportada: sigue esperando
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  return [...mods, key].join('+');
}

function keyLabel(acc) {
  if (!acc) return 'Sin tecla';
  return acc.split('+').map((p) => {
    if (/^num\d$/.test(p)) return `Num ${p.slice(3)}`;
    return { numadd: 'Num +', numsub: 'Num -', nummult: 'Num *', numdiv: 'Num /', numdec: 'Num .', Super: 'Win' }[p] || p;
  }).join('+');
}

// Atajo de una sola tecla normal (letra, número, espacio): se "come" esa tecla en todo Windows.
const isBareTypingKey = (acc) => !!acc && !acc.includes('+') && /^([A-Z0-9]|Space|[-=[\]`;',./\\])$/.test(acc);

function usedKeys() {
  return [...cfg.expressions.map((e) => e.hotkey), ...cfg.accessories.map((a) => a.hotkey), S.muteKey, S.captureKey].filter(Boolean);
}

function nextFreeKey() {
  const used = new Set(usedKeys());
  for (let i = 0; i < 9; i++) if (!used.has(defaultKey(i))) return defaultKey(i);
  return null;
}

// ---------- Estado ----------

let cfg = null;      // configuración guardada
let S = null;        // atajo a cfg.settings
let info = { port: null, imagesUrl: '' };
let view = null;

let muted = false;
let level = 0;
let talkUntil = 0;
let shoutUntil = 0;
let talking = false;
let shouting = false;
let blinking = false;
let blinkEnd = 0;
let nextBlink = 0;
let calib = null;
let lastKey = '';
let recording = false;
let editingAccId = ''; // accesorio en modo "Ajustar"

const audio = { ctx: null, stream: null, source: null, analyser: null, buf: null, error: null };

// ---------- Utilidades ----------

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 10);

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.saveConfig(cfg).catch(() => toast('No se pudo guardar la configuración', 'error')), 350);
}

function activeExpr() {
  return cfg.expressions.find((e) => e.id === cfg.activeId) || cfg.expressions[0];
}

function setActive(id) {
  if (!cfg.expressions.some((e) => e.id === id)) return;
  cfg.activeId = id;
  scheduleSave();
  renderQuickbar();
  highlightActiveCard();
}

// ---------- Audio ----------

async function startMic() {
  stopMic();
  try {
    const constraints = {
      audio: {
        deviceId: S.deviceId ? { exact: S.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: S.noiseSuppression,
        autoGainControl: false,
      },
    };
    audio.stream = await navigator.mediaDevices.getUserMedia(constraints);
    audio.ctx = audio.ctx || new AudioContext();
    await audio.ctx.resume();
    audio.source = audio.ctx.createMediaStreamSource(audio.stream);
    audio.analyser = audio.ctx.createAnalyser();
    audio.analyser.fftSize = 1024;
    if (S.voiceFilter) {
      // Solo la banda de la voz: los golpes graves (mesa, pasos) y los clics agudos del teclado cuentan menos.
      const hp = new BiquadFilterNode(audio.ctx, { type: 'highpass', frequency: 100, Q: 0.7 });
      const lp = new BiquadFilterNode(audio.ctx, { type: 'lowpass', frequency: 4000, Q: 0.7 });
      audio.source.connect(hp).connect(lp).connect(audio.analyser);
    } else {
      audio.source.connect(audio.analyser);
    }
    audio.buf = new Float32Array(audio.analyser.fftSize);
    audio.error = null;
  } catch (err) {
    audio.error = err;
    if (S.deviceId) {
      // El micrófono guardado ya no existe: vuelve al predeterminado.
      S.deviceId = '';
      scheduleSave();
      return startMic();
    }
    toast('No pude abrir el micrófono. Revisa los permisos de Windows.', 'error');
  }
  updatePills();
  refreshDevices();
}

function stopMic() {
  if (audio.stream) audio.stream.getTracks().forEach((t) => t.stop());
  if (audio.source) audio.source.disconnect();
  audio.stream = audio.source = audio.analyser = null;
}

async function refreshDevices() {
  const sel = $('#selDevice');
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  } catch { /* sin permisos todavía */ }
  sel.innerHTML = '';
  const def = new Option('Predeterminado del sistema', '');
  sel.add(def);
  devices.forEach((d, i) => sel.add(new Option(d.label || `Micrófono ${i + 1}`, d.deviceId)));
  sel.value = devices.some((d) => d.deviceId === S.deviceId) ? S.deviceId : '';
}

function readLevel() {
  if (!audio.analyser) return 0;
  audio.analyser.getFloatTimeDomainData(audio.buf);
  let sum = 0;
  for (let i = 0; i < audio.buf.length; i++) sum += audio.buf[i] * audio.buf[i];
  const rms = Math.sqrt(sum / audio.buf.length);
  const db = 20 * Math.log10(rms + 1e-8) + S.gainDb;
  return clamp((db + 60) / 60, 0, 1); // -60 dB → 0, 0 dB → 1
}

// ---------- Bucle principal ----------

function scheduleBlink(now) {
  const min = Math.min(S.blinkMin, S.blinkMax);
  const max = Math.max(S.blinkMin, S.blinkMax);
  nextBlink = now + (min + Math.random() * (max - min)) * 1000;
}

function pickFrame(ex) {
  const f = ex.frames;
  if (shouting && f.shout) return f.shout;
  if (talking) return (blinking && f.talkBlink) || f.talk || f.idle;
  if (blinking && f.blink) return f.blink;
  return f.idle || f.talk || null;
}

// Cuándo se ve un accesorio puesto: siempre, solo hablando (o gritando), solo gritando, o solo callado.
const ACC_WHEN = [
  ['siempre', 'Siempre'],
  ['hablando', 'Solo al hablar'],
  ['gritando', 'Solo al gritar'],
  ['callado', 'Solo callado'],
];
function accessoryWhen(a) {
  switch (a.when) {
    case 'hablando': return talking;
    case 'gritando': return shouting;
    case 'callado': return !talking;
    default: return true;
  }
}

// Accesorio ligado a expresiones: sin lista (o vacía) sale en todas; con lista, solo en esas.
const accessoryInExpr = (a, ex) => !a.exprs || !a.exprs.length || a.exprs.includes(ex.id);

// Todas las imágenes de todas las expresiones: la vista las tiene listas para cambiar sin cortes.
// (Probado el 2026-10-11: cargar solo las de la expresión activa NO ahorra memoria; crear y destruir
// imágenes en cada cambio sube la de la GPU de ~125 a ~250 MB. Chromium ya no retiene las ocultas.)
let preloadCache = { key: null, refs: [] };
function allFrames() {
  const key = JSON.stringify(cfg.expressions.map((e) => e.frames));
  if (preloadCache.key !== key) {
    preloadCache = { key, refs: [...new Set(cfg.expressions.flatMap((e) => Object.values(e.frames)).filter(Boolean))] };
  }
  return preloadCache.refs;
}

function tick() {
  const now = performance.now();
  const raw = muted ? 0 : readLevel();
  level = raw > level ? raw * 0.65 + level * 0.35 : level * 0.82 + raw * 0.18;
  if (calib) calib.max = Math.max(calib.max, level);

  if (level >= S.talkThreshold) talkUntil = now + S.holdMs;
  if (S.shoutEnabled && level >= S.shoutThreshold) shoutUntil = now + S.shoutHoldMs;
  talking = now < talkUntil;
  shouting = talking && S.shoutEnabled && now < shoutUntil;

  if (S.blinkEnabled) {
    if (!blinking && now >= nextBlink) { blinking = true; blinkEnd = now + S.blinkMs; }
    if (blinking && now >= blinkEnd) { blinking = false; scheduleBlink(now); }
  } else {
    blinking = false;
  }

  const ex = activeExpr();
  const state = {
    src: pickFrame(ex),
    exprId: ex.id,
    talking,
    shouting,
    anim: {
      bounce: S.bounce, bounceHeight: S.bounceHeight, bounceMs: S.bounceMs,
      breathing: S.breathing, shake: S.shake, shakeAmount: S.shakeAmount,
      squash: S.squash, sway: S.sway, swayAmount: S.swayAmount, swaySpeed: S.swaySpeed,
    },
    layout: { scale: S.scale, x: S.offsetX, y: S.offsetY, flip: S.flip },
    accessories: cfg.accessories.map((a) => ({
      src: a.src, on: !!a.on && accessoryWhen(a) && accessoryInExpr(a, ex), behind: !!a.behind, inertia: a.inertia ?? 50, adjust: a.adjust || null,
    })),
    preload: allFrames(),
  };
  const key = JSON.stringify(state) + editingAccId;
  if (key !== lastKey) {
    lastKey = key;
    // En la vista de la app, el accesorio que se ajusta se ve siempre y resaltado (en OBS no).
    view.apply(editingAccId ? {
      ...state,
      accessories: state.accessories.map((x, i) => (cfg.accessories[i].id === editingAccId ? { ...x, on: true, editing: true } : x)),
    } : state);
    api.pushState(state);
  }
  updateMeter();
}

function updateMeter() {
  $('#meterFill').style.width = `${level * 100}%`;
  $('#meterFill').className = `meter-fill${shouting ? ' shout' : talking ? ' talk' : ''}`;
  $('#markTalk').style.left = `${S.talkThreshold * 100}%`;
  $('#markShout').style.left = `${S.shoutThreshold * 100}%`;
  $('#markShout').style.display = S.shoutEnabled ? '' : 'none';
  const label = muted ? 'Silenciado' : shouting ? '¡Gritando!' : talking ? 'Hablando' : 'Callado';
  const el = $('#stateLabel');
  if (el.textContent !== label) el.textContent = label;
  el.dataset.state = muted ? 'muted' : shouting ? 'shout' : talking ? 'talk' : 'idle';
}

// ---------- Controles genéricos ----------

function sliderRow({ key, label, min, max, step, fmt = (v) => v, onChange }) {
  const row = document.createElement('div');
  row.className = 'field slider';
  row.innerHTML = `<div class="slider-head"><label>${label}</label><span class="val"></span></div><input type="range">`;
  const input = row.querySelector('input');
  const val = row.querySelector('.val');
  Object.assign(input, { min, max, step, value: S[key] });
  const show = () => (val.textContent = fmt(Number(input.value)));
  show();
  input.addEventListener('input', () => {
    S[key] = Number(input.value);
    show();
    scheduleSave();
    onChange && onChange(S[key]);
  });
  row.sync = () => { input.value = S[key]; show(); };
  return row;
}

function toggleRow({ key, label, hint, onChange }) {
  const row = document.createElement('label');
  row.className = 'toggle-row';
  row.innerHTML = `<span><span class="t-label">${label}</span>${hint ? `<span class="muted small t-hint">${hint}</span>` : ''}</span><input type="checkbox" class="switch">`;
  const input = row.querySelector('input');
  input.checked = !!S[key];
  input.addEventListener('change', () => {
    S[key] = input.checked;
    scheduleSave();
    onChange && onChange(S[key]);
  });
  return row;
}

function section(title, ...children) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">${title}</div>`;
  children.forEach((c) => card.appendChild(c));
  return card;
}

const pct = (v) => `${Math.round(v * 100)}%`;
const syncers = [];

function buildMicControls() {
  const box = $('#micControls');
  box.innerHTML = '';
  const talk = sliderRow({ key: 'talkThreshold', label: 'Umbral para hablar', min: 0.05, max: 0.95, step: 0.01, fmt: pct,
    onChange: (v) => { if (S.shoutThreshold < v + 0.05) { S.shoutThreshold = Math.min(1, v + 0.05); shout.sync(); } } });
  const shout = sliderRow({ key: 'shoutThreshold', label: 'Umbral para gritar', min: 0.1, max: 1, step: 0.01, fmt: pct,
    onChange: (v) => { if (v < S.talkThreshold + 0.05) { S.talkThreshold = Math.max(0.05, v - 0.05); talk.sync(); } } });
  syncers.push(talk, shout);
  box.append(
    section('Sensibilidad',
      sliderRow({ key: 'gainDb', label: 'Ganancia', min: -20, max: 20, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v} dB` }),
      talk,
      shout,
      sliderRow({ key: 'holdMs', label: 'Mantener la boca abierta', min: 0, max: 600, step: 10, fmt: (v) => `${v} ms` }),
      sliderRow({ key: 'shoutHoldMs', label: 'Mantener el grito', min: 0, max: 1000, step: 10, fmt: (v) => `${v} ms` }),
    ),
    section('Opciones',
      toggleRow({ key: 'voiceFilter', label: 'Filtro de voz', hint: 'Ignora graves y agudos que no son voz (clics, golpes)', onChange: startMic }),
      toggleRow({ key: 'shoutEnabled', label: 'Usar imagen de grito', hint: 'Cuando hablas muy fuerte' }),
      toggleRow({ key: 'noiseSuppression', label: 'Reducción de ruido', hint: 'Filtro del sistema; ayuda con el teclado', onChange: startMic }),
    ),
  );
}

function buildAnimControls() {
  const box = $('#animControls');
  box.innerHTML = '';
  box.append(
    section('Tamaño y posición (también en OBS)',
      sliderRow({ key: 'scale', label: 'Tamaño', min: 30, max: 200, step: 5, fmt: (v) => `${v}%` }),
      sliderRow({ key: 'offsetX', label: 'Horizontal', min: -50, max: 50, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v}%` }),
      sliderRow({ key: 'offsetY', label: 'Vertical', min: -50, max: 50, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${v}%` }),
      toggleRow({ key: 'flip', label: 'Espejo', hint: 'Mira hacia el otro lado' }),
    ),
    section('Rebote al hablar',
      toggleRow({ key: 'bounce', label: 'Saltar al empezar a hablar', hint: 'También al cambiar de expresión' }),
      sliderRow({ key: 'bounceHeight', label: 'Altura', min: 1, max: 15, step: 0.5, fmt: (v) => `${v}%` }),
      sliderRow({ key: 'bounceMs', label: 'Duración', min: 120, max: 600, step: 10, fmt: (v) => `${v} ms` }),
      sliderRow({ key: 'squash', label: 'Aplastarse al caer', min: 0, max: 30, step: 1, fmt: (v) => (v ? `${v}%` : 'No') }),
    ),
    section('Balanceo en reposo',
      toggleRow({ key: 'sway', label: 'Balancearse suavemente', hint: 'Vaivén lateral y un poco de giro, siempre' }),
      sliderRow({ key: 'swayAmount', label: 'Cuánto', min: 0.2, max: 5, step: 0.1, fmt: (v) => `${v}%` }),
      sliderRow({ key: 'swaySpeed', label: 'Lentitud (un vaivén cada…)', min: 1.5, max: 10, step: 0.5, fmt: (v) => `${v} s` }),
    ),
    section('Parpadeo',
      toggleRow({ key: 'blinkEnabled', label: 'Parpadear solo', onChange: () => scheduleBlink(performance.now()) }),
      sliderRow({ key: 'blinkMin', label: 'Intervalo mínimo', min: 1, max: 10, step: 0.5, fmt: (v) => `${v} s` }),
      sliderRow({ key: 'blinkMax', label: 'Intervalo máximo', min: 1, max: 12, step: 0.5, fmt: (v) => `${v} s` }),
      sliderRow({ key: 'blinkMs', label: 'Duración del parpadeo', min: 60, max: 400, step: 10, fmt: (v) => `${v} ms` }),
    ),
    section('Vida extra',
      toggleRow({ key: 'breathing', label: 'Respiración', hint: 'Movimiento suave en reposo' }),
      toggleRow({ key: 'shake', label: 'Temblar al gritar' }),
      sliderRow({ key: 'shakeAmount', label: 'Intensidad del temblor', min: 1, max: 12, step: 1, fmt: (v) => `${v} px` }),
    ),
  );
}

// ---------- Expresiones ----------

function slotFallbackNote(ex, slot) {
  if (ex.frames[slot]) return '';
  if (slot === 'talk') return 'usa Quieto';
  if (slot === 'blink') return 'sin parpadeo';
  if (slot === 'talkBlink') return 'no parpadea al hablar';
  if (slot === 'shout') return 'usa Hablando';
  return 'vacío';
}

function renderExpressions() {
  const list = $('#exprList');
  list.innerHTML = '';
  cfg.expressions.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className = 'expr-card';
    card.dataset.id = ex.id;
    card.innerHTML = `
      <div class="expr-head">
        <span class="expr-dot"></span>
        <input class="expr-name" maxlength="24" value="">
        <button class="key-btn" data-act="key" title="Cambiar la tecla de esta expresión"></button>
        <button class="icon-btn" data-act="dup" title="Duplicar">⧉</button>
        <button class="icon-btn danger" data-act="del" title="Borrar">✕</button>
      </div>
      <div class="slots"></div>`;
    const nameInput = card.querySelector('.expr-name');
    nameInput.value = ex.name;
    nameInput.addEventListener('input', () => { ex.name = nameInput.value || 'Sin nombre'; scheduleSave(); renderQuickbar(); });
    nameInput.addEventListener('focus', () => setActive(ex.id));

    card.addEventListener('click', (e) => {
      if (e.target.closest('button, input, .slot')) return;
      setActive(ex.id);
    });
    const keyBtn = card.querySelector('[data-act="key"]');
    paintKeyButton(keyBtn, ex.hotkey);
    keyBtn.addEventListener('click', () => recordKey(keyBtn, ex.hotkey, (acc) => assignKey({ ex }, acc)));
    card.querySelector('[data-act="dup"]').addEventListener('click', () => duplicateExpr(ex));
    card.querySelector('[data-act="del"]').addEventListener('click', () => deleteExpr(ex));

    const slots = card.querySelector('.slots');
    SLOTS.forEach(({ key, label }) => slots.appendChild(buildSlot(ex, key, label)));
    list.appendChild(card);
  });
  highlightActiveCard();
}

function buildSlot(ex, key, label) {
  const slot = document.createElement('div');
  slot.className = 'slot';
  const ref = ex.frames[key];
  slot.innerHTML = `
    <div class="slot-img ${ref ? 'filled' : ''}">
      ${ref ? `<img alt="" src="${view.resolve(ref)}">` : '<span class="plus">+</span>'}
      ${ref ? '<button class="slot-clear" title="Quitar">✕</button>' : ''}
    </div>
    <div class="slot-label">${label}<span class="muted">${slotFallbackNote(ex, key)}</span></div>`;
  const box = slot.querySelector('.slot-img');

  box.addEventListener('click', (e) => {
    if (e.target.closest('.slot-clear')) return;
    pickFileFor(ex, key);
  });
  const clear = slot.querySelector('.slot-clear');
  if (clear) clear.addEventListener('click', () => { ex.frames[key] = null; scheduleSave(); renderExpressions(); });

  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('drag');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) importImage(file, ex, key);
  });
  return slot;
}

let pickTarget = null;
function pickFileFor(ex, key) {
  pickTarget = { ex, key };
  const picker = $('#filePicker');
  picker.value = '';
  picker.click();
}

async function importImage(file, ex, key) {
  if (!/\.(png|gif|webp|jpe?g|svg)$/i.test(file.name)) return toast('Usa PNG, GIF, WEBP, JPG o SVG', 'error');
  if (file.size > 20 * 1024 * 1024) return toast('La imagen pesa más de 20 MB', 'error');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    ex.frames[key] = await api.saveImage(file.name, bytes);
    setActive(ex.id);
    scheduleSave();
    renderExpressions();
    toast(`Imagen añadida a “${ex.name}”`);
  } catch {
    toast('No pude guardar la imagen', 'error');
  }
}

function newExpr(name, frames = {}) {
  return { id: uid(), name, hotkey: nextFreeKey(), frames: { ...emptyFrames(), ...frames } };
}

function addExpr() {
  const ex = newExpr(`Expresión ${cfg.expressions.length + 1}`);
  cfg.expressions.push(ex);
  setActive(ex.id);
  renderExpressions();
  scheduleSave();
  applyHotkeys();
}

function duplicateExpr(src) {
  const ex = newExpr(`${src.name} (copia)`, src.frames);
  cfg.expressions.splice(cfg.expressions.indexOf(src) + 1, 0, ex);
  setActive(ex.id);
  renderExpressions();
  scheduleSave();
  applyHotkeys();
}

// ---------- Accesorios ----------
// Capas (sombrero, gafas…) que van encima o detrás del personaje en todas las expresiones.
// La imagen debe tener el mismo tamaño que las del personaje, con el accesorio ya colocado en su sitio.

function setAccessory(a, on) {
  a.on = on;
  scheduleSave();
  renderAccessories();
  renderQuickbar();
}

function addAccessory() {
  const a = { id: uid(), name: `Accesorio ${cfg.accessories.length + 1}`, src: null, hotkey: null, on: false, behind: false };
  cfg.accessories.push(a);
  renderAccessories();
  renderQuickbar();
  scheduleSave();
}

function deleteAccessory(a) {
  if (!confirm(`¿Borrar el accesorio “${a.name}”?`)) return;
  cfg.accessories = cfg.accessories.filter((x) => x !== a);
  if (editingAccId === a.id) setEditingAcc('');
  renderAccessories();
  renderQuickbar();
  scheduleSave();
  applyHotkeys();
}

async function importAccessoryImage(file, a) {
  if (!/\.(png|gif|webp|svg)$/i.test(file.name)) return toast('Usa PNG, GIF, WEBP o SVG con fondo transparente', 'error');
  try {
    a.src = await api.saveImage(file.name, new Uint8Array(await file.arrayBuffer()));
    if (/^accesorio \d+$/i.test(a.name)) a.name = prettyName(file.name.replace(/\.[^.]+$/, '').replace(/_\d+$/, ''));
    a.on = true;
    scheduleSave();
    renderAccessories();
    renderQuickbar();
    toast(`“${a.name}” puesto`);
  } catch {
    toast('No pude guardar la imagen', 'error');
  }
}

// ---------- Ajustar accesorios ----------
// x/y en % del tamaño del dibujo, escala en %, giro en grados. Se arrastra sobre la vista previa,
// la rueda cambia el tamaño y Shift+rueda gira; los deslizadores sirven para afinar.

const ADJ_DEFAULT = { x: 0, y: 0, scale: 100, rot: 0, flip: false };
// Siempre el mismo objeto (los deslizadores y el arrastre lo comparten); solo rellena lo que falte.
function adjOf(a) {
  if (!a.adjust) a.adjust = {};
  for (const [k, v] of Object.entries(ADJ_DEFAULT)) if (a.adjust[k] === undefined) a.adjust[k] = v;
  return a.adjust;
}
const adjSyncers = [];

function setEditingAcc(id) {
  editingAccId = id;
  document.querySelector('#stage').classList.toggle('editing-acc', !!id);
  renderAccessories();
}

function buildAdjustPanel(box, a) {
  const A = adjOf(a);
  adjSyncers.length = 0;
  const row = (key, label, min, max, step, fmt) => {
    const r = document.createElement('div');
    r.className = 'field slider';
    r.innerHTML = `<div class="slider-head"><label>${label}</label><span class="val"></span></div><input type="range">`;
    const input = r.querySelector('input');
    const val = r.querySelector('.val');
    Object.assign(input, { min, max, step });
    const sync = () => { input.value = A[key]; val.textContent = fmt(A[key]); };
    sync();
    input.addEventListener('input', () => { A[key] = Number(input.value); val.textContent = fmt(A[key]); scheduleSave(); });
    adjSyncers.push(sync);
    return r;
  };
  const signed = (u) => (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}${u}`;
  box.innerHTML = '<p class="muted small">Arrastra el accesorio en la vista previa para moverlo. Rueda del ratón: tamaño · Shift + rueda: girar.</p>';
  box.append(
    row('x', 'Horizontal', -60, 60, 0.5, signed('%')),
    row('y', 'Vertical', -60, 60, 0.5, signed('%')),
    row('scale', 'Tamaño', 20, 300, 1, (v) => `${Math.round(v)}%`),
    row('rot', 'Giro', -180, 180, 1, signed('°')),
  );
  const tools = document.createElement('div');
  tools.className = 'row gap';
  tools.innerHTML = '<button class="btn small" data-a="flip">Espejo</button><button class="btn small ghost" data-a="reset">Restablecer</button>';
  tools.querySelector('[data-a="flip"]').addEventListener('click', () => { A.flip = !A.flip; scheduleSave(); });
  tools.querySelector('[data-a="reset"]').addEventListener('click', () => {
    Object.assign(A, ADJ_DEFAULT);
    adjSyncers.forEach((s) => s());
    scheduleSave();
  });
  box.append(tools);
}

// Arrastrar y rueda sobre la vista previa mientras se ajusta un accesorio
function wireAdjustOnStage() {
  const stage = $('#stage');
  const pxToPct = (dxScreen, a) => {
    const l = view.accs.get(a.src);
    if (!l) return 0;
    const d = view.drawnSize(l);
    const sc = (S.scale || 100) / 100;
    return (dxScreen / (d.ih * d.s * sc)) * 100;
  };
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    const a = cfg.accessories.find((x) => x.id === editingAccId);
    if (!a || e.button !== 0) return;
    const A = adjOf(a);
    drag = { a, x0: e.clientX, y0: e.clientY, ax: A.x, ay: A.y };
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const A = adjOf(drag.a);
    const dx = pxToPct(e.clientX - drag.x0, drag.a) * (S.flip ? -1 : 1);
    const dy = pxToPct(e.clientY - drag.y0, drag.a);
    A.x = Math.round((drag.ax + dx) * 2) / 2;
    A.y = Math.round((drag.ay + dy) * 2) / 2;
    adjSyncers.forEach((s) => s());
  });
  const end = () => { if (drag) { drag = null; scheduleSave(); } };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    const a = cfg.accessories.find((x) => x.id === editingAccId);
    if (!a) return;
    e.preventDefault();
    const A = adjOf(a);
    const dir = e.deltaY < 0 ? 1 : -1;
    if (e.shiftKey) A.rot = Math.max(-180, Math.min(180, A.rot + dir * 2));
    else A.scale = Math.max(20, Math.min(300, A.scale + dir * 3));
    adjSyncers.forEach((s) => s());
    scheduleSave();
  }, { passive: false });
}

function renderAccessories() {
  const list = $('#accList');
  if (!list) return;
  list.innerHTML = '';
  if (!cfg.accessories.length) {
    list.innerHTML = '<p class="muted small">Aún no hay accesorios.</p>';
  }
  cfg.accessories.forEach((a) => {
    const card = document.createElement('div');
    card.className = `expr-card${a.on ? ' active' : ''}`;
    card.innerHTML = `
      <div class="expr-head">
        <span class="expr-dot"></span>
        <input class="expr-name" maxlength="24">
        <button class="key-btn" data-act="key" title="Tecla para poner / quitar"></button>
        <button class="icon-btn danger" data-act="del" title="Borrar">✕</button>
      </div>
      <div class="acc-body">
        <div class="slot-img ${a.src ? 'filled' : ''}">
          ${a.src ? `<img alt="" src="${view.resolve(a.src)}">` : '<span class="plus">+</span>'}
        </div>
        <div>
          <label class="toggle-row"><span class="t-label">Puesto</span><input type="checkbox" class="switch" data-act="on"></label>
          <label class="toggle-row"><span><span class="t-label">Detrás del personaje</span><span class="muted small t-hint">Para alas, capas, aureolas…</span></span><input type="checkbox" class="switch" data-act="behind"></label>
          <div class="key-row"><span>Se ve</span><select data-act="when"></select></div>
          <div class="field slider"><div class="slider-head"><label>Inercia</label><span class="val"></span></div>
            <input type="range" min="0" max="100" step="5" data-act="inertia"></div>
          <details class="acc-exprs"><summary></summary><div class="acc-expr-list"></div></details>
          <button class="btn small" data-act="adjust">${editingAccId === a.id ? 'Listo' : 'Ajustar posición y tamaño'}</button>
        </div>
      </div>
      <div class="acc-adjust" ${editingAccId === a.id ? '' : 'hidden'}></div>`;
    const name = card.querySelector('.expr-name');
    name.value = a.name;
    name.addEventListener('input', () => { a.name = name.value || 'Sin nombre'; scheduleSave(); renderQuickbar(); });

    const keyBtn = card.querySelector('[data-act="key"]');
    paintKeyButton(keyBtn, a.hotkey);
    keyBtn.addEventListener('click', () => recordKey(keyBtn, a.hotkey, (acc) => assignKey({ acc: a }, acc)));
    card.querySelector('[data-act="del"]').addEventListener('click', () => deleteAccessory(a));

    const on = card.querySelector('[data-act="on"]');
    on.checked = !!a.on;
    on.addEventListener('change', () => setAccessory(a, on.checked));
    const behind = card.querySelector('[data-act="behind"]');
    behind.checked = !!a.behind;
    behind.addEventListener('change', () => { a.behind = behind.checked; scheduleSave(); });

    const when = card.querySelector('[data-act="when"]');
    for (const [v, label] of ACC_WHEN) when.add(new Option(label, v));
    when.value = a.when || 'siempre';
    when.addEventListener('change', () => { a.when = when.value; scheduleSave(); });

    const inertia = card.querySelector('[data-act="inertia"]');
    const inertiaVal = card.querySelector('.slider .val');
    const showInertia = () => (inertiaVal.textContent = Number(inertia.value) ? `${inertia.value}%` : 'Fijo');
    inertia.value = a.inertia ?? 50;
    showInertia();
    inertia.addEventListener('input', () => { a.inertia = Number(inertia.value); showInertia(); scheduleSave(); });

    // Solo en estas expresiones
    const det = card.querySelector('.acc-exprs');
    const sum = det.querySelector('summary');
    const exprList = det.querySelector('.acc-expr-list');
    const paintSummary = () => {
      const sel = cfg.expressions.filter((e) => (a.exprs || []).includes(e.id));
      sum.textContent = sel.length ? `Solo en: ${sel.map((e) => e.name).join(', ')}` : 'Sale en todas las expresiones';
    };
    for (const e of cfg.expressions) {
      const lab = document.createElement('label');
      lab.className = 'acc-expr';
      lab.innerHTML = '<input type="checkbox"><span></span>';
      lab.querySelector('span').textContent = e.name;
      const cb = lab.querySelector('input');
      cb.checked = (a.exprs || []).includes(e.id);
      cb.addEventListener('change', () => {
        const set = new Set((a.exprs || []).filter((id) => cfg.expressions.some((x) => x.id === id)));
        if (cb.checked) set.add(e.id); else set.delete(e.id);
        a.exprs = [...set];
        paintSummary();
        scheduleSave();
      });
      exprList.appendChild(lab);
    }
    paintSummary();

    card.querySelector('[data-act="adjust"]').addEventListener('click', () => setEditingAcc(editingAccId === a.id ? '' : a.id));
    if (editingAccId === a.id) buildAdjustPanel(card.querySelector('.acc-adjust'), a);

    const box = card.querySelector('.slot-img');
    box.addEventListener('click', () => {
      const picker = $('#filePicker');
      picker.value = '';
      pickTarget = { acc: a };
      picker.click();
    });
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
    box.addEventListener('dragleave', () => box.classList.remove('drag'));
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('drag');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) importAccessoryImage(file, a);
    });
    list.appendChild(card);
  });
}

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
      syncers.forEach((s) => s.sync && s.sync());
      buildMicControls();
      buildAnimControls();
    }
  }
  renderExpressions();
  renderAccessories();
  renderQuickbar();
  scheduleSave();
  applyHotkeys();
  toast(`Listo: ${nuevas} nuevas, ${actualizadas} actualizadas`);
}

function deleteExpr(ex) {
  if (cfg.expressions.length <= 1) return toast('Necesitas al menos una expresión');
  if (!confirm(`¿Borrar la expresión “${ex.name}”?`)) return;
  cfg.expressions = cfg.expressions.filter((e) => e !== ex);
  if (cfg.activeId === ex.id) cfg.activeId = cfg.expressions[0].id;
  renderExpressions();
  renderQuickbar();
  scheduleSave();
  applyHotkeys();
}

function highlightActiveCard() {
  document.querySelectorAll('.expr-card').forEach((c) => c.classList.toggle('active', c.dataset.id === cfg.activeId));
  $('#exprBadge').textContent = activeExpr().name;
}

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

function paintKeyButton(btn, acc) {
  btn.textContent = keyLabel(acc);
  btn.classList.toggle('empty', !acc);
  btn.classList.remove('recording');
}

// Direcciones para Streamer.bot: una por expresión y las órdenes generales.
function renderRemote() {
  const sel = $('#selRemote');
  if (!sel) return;
  const prev = sel.value;
  const base = info.port ? `http://127.0.0.1:${info.port}/api` : null;
  const opts = [
    ...cfg.expressions.map((e) => [`Cambiar a “${e.name}”`, `/expresion/${encodeURIComponent(e.name.replace(/\s+/g, '_'))}`]),
    ...cfg.accessories.flatMap((a) => {
      const n = encodeURIComponent(a.name.replace(/\s+/g, '_'));
      return [[`Poner / quitar “${a.name}”`, `/accesorio/${n}/alternar`], [`Poner “${a.name}”`, `/accesorio/${n}/poner`], [`Quitar “${a.name}”`, `/accesorio/${n}/quitar`]];
    }),
    ['Siguiente expresión', '/siguiente'],
    ['Expresión anterior', '/anterior'],
    ['Silenciar / activar micrófono', '/microfono/alternar'],
    ['Silenciar micrófono', '/microfono/silenciar'],
    ['Activar micrófono', '/microfono/activar'],
  ];
  sel.innerHTML = '';
  for (const [label, p] of opts) sel.add(new Option(label, p));
  if (opts.some(([, p]) => p === prev)) sel.value = prev;
  const url = base && info.apiKey ? `${base}${sel.value}?clave=${info.apiKey}` : 'No disponible (el servidor no arrancó)';
  $('#remoteUrl').textContent = url;
  $('#btnCopyRemote').disabled = !base;
}

function renderShortcuts() {
  paintKeyButton($('#keyMute'), S.muteKey);
  paintKeyButton($('#keyCapture'), S.captureKey);
}

async function applyHotkeys() {
  const bindings = [
    ...cfg.expressions.filter((e) => e.hotkey).map((e) => ({ acc: e.hotkey, payload: { type: 'expression', id: e.id } })),
    ...cfg.accessories.filter((a) => a.hotkey).map((a) => ({ acc: a.hotkey, payload: { type: 'accessory', id: a.id } })),
    { acc: S.muteKey, payload: { type: 'mute' } },
    { acc: S.captureKey, payload: { type: 'capture' } },
  ].filter((b) => b.acc);
  const failed = await api.setHotkeys(bindings);
  const warn = $('#hotkeyWarn');
  if (failed && failed.length) {
    warn.hidden = false;
    warn.textContent = `No pude usar: ${failed.map(keyLabel).join(', ')}. Otro programa ya la usa; prueba otra.`;
  } else {
    warn.hidden = true;
  }
  renderShortcuts();
}

// Graba la siguiente combinación que se pulse. onDone(acc) con acc = null si se quita (Supr/Retroceso).
async function recordKey(btn, current, onDone) {
  if (recording) return;
  recording = true;
  btn.classList.add('recording');
  btn.textContent = 'Pulsa una tecla…';
  await api.suspendHotkeys(); // si no, Windows se queda la tecla y no llega a la ventana

  const finish = (result) => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('mousedown', onClickAway, true);
    recording = false;
    if (result !== undefined) onDone(result);
    applyHotkeys(); // vuelve a registrar los atajos (también si se canceló)
    if (result === undefined) return paintKeyButton(btn, current);
    renderExpressions();
    renderAccessories();
    renderQuickbar();
  };
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return finish(undefined);
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey && !e.shiftKey) return finish(null);
    const acc = accFromEvent(e);
    if (acc) finish(acc);
  };
  const onBlur = () => finish(undefined);
  const onClickAway = (e) => { if (e.target !== btn) finish(undefined); };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousedown', onClickAway, true);
}

// target: { ex } para una expresión, o { setting: 'muteKey' | 'captureKey' }
function assignKey(target, acc) {
  if (acc) {
    // Una tecla solo puede hacer una cosa: se la quita a quien la tuviera.
    for (const e of cfg.expressions) if (e.hotkey === acc && e !== target.ex) { e.hotkey = null; toast(`${keyLabel(acc)} ya no cambia a “${e.name}”`); }
    for (const a of cfg.accessories) if (a.hotkey === acc && a !== target.acc) { a.hotkey = null; toast(`${keyLabel(acc)} ya no pone “${a.name}”`); }
    for (const k of ['muteKey', 'captureKey']) if (S[k] === acc && k !== target.setting) S[k] = null;
    if (isBareTypingKey(acc)) toast(`Ojo: mientras la app esté abierta, ${keyLabel(acc)} no escribirá en otros programas`, 'error');
  }
  if (target.ex) target.ex.hotkey = acc;
  else if (target.acc) target.acc.hotkey = acc;
  else S[target.setting] = acc;
  scheduleSave();
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

function calibrate() {
  const btn = $('#btnCalibrate');
  if (calib) return;
  calib = { max: 0 };
  btn.disabled = true;
  let n = 3;
  btn.textContent = `Silencio… ${n}`;
  const t = setInterval(() => {
    n -= 1;
    if (n > 0) { btn.textContent = `Silencio… ${n}`; return; }
    clearInterval(t);
    const noise = calib.max;
    calib = null;
    S.talkThreshold = clamp(Math.round((noise + 0.1) * 100) / 100, 0.12, 0.9);
    S.shoutThreshold = clamp(Math.max(S.shoutThreshold, S.talkThreshold + 0.25), S.talkThreshold + 0.05, 1);
    syncers.forEach((s) => s.sync());
    scheduleSave();
    btn.disabled = false;
    btn.textContent = 'Calibrar';
    toast(`Listo: umbral para hablar en ${pct(S.talkThreshold)}`);
  }, 1000);
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
    else if (file && pickTarget) importImage(file, pickTarget.ex, pickTarget.key);
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
      setActive(h.id);
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
  // Guardar ya: el servidor (Streamer.bot) lee las expresiones de config.json, que en una instalación
  // nueva no existe hasta el primer cambio; también deja grabada la migración de versiones antiguas.
  api.saveConfig(cfg).catch(() => toast('No se pudo guardar la configuración', 'error'));

  // setInterval (no requestAnimationFrame) para que siga funcionando minimizada.
  setInterval(tick, 16);
  startMic();
}

init();
