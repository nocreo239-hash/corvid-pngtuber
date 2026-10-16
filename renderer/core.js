/* Corvid PNGtuber — Base compartida: puente con Electron, ajustes por defecto, estado y utilidades */
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
  gestures: true,     // alternar entre los gestos de la expresión mientras se habla
  gestureEvery: 2.4,  // segundos (aprox.) que dura cada gesto mientras sigues hablando
  gestureHold: 1.2,   // segundos callado antes de volver al reposo
  idleActions: true,  // de vez en cuando, callado: ladea la cabeza, da saltitos, se sacude…
  idleEvery: 14,      // segundos (aprox.) entre gestos de reposo
  sleep: true,        // dormirse tras un rato sin hablar
  sleepAfter: 5,      // minutos
  sleepExpr: '',      // expresión para dormir ('' = la actual con los ojos cerrados)
  sleepZzz: true,
  sleepZzzSide: 'derecha',
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
const hasFrames = (set) => !!set && Object.values(set).some(Boolean);

// Gestos al hablar: series extra de casillas (alas, brazos… en otra posición). Siempre MAX_GESTOS series.
const MAX_GESTOS = 3;
function gestosOf(ex) {
  if (!Array.isArray(ex.gestos)) ex.gestos = [];
  for (let i = 0; i < MAX_GESTOS; i++) ex.gestos[i] = { ...emptyFrames(), ...(ex.gestos[i] || {}) };
  ex.gestos.length = MAX_GESTOS;
  return ex.gestos;
}

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
let lastActivity = 0;  // última vez que hablaste o cambiaste de expresión (para dormirse)
let sleeping = false;
let tempExpr = null;   // expresión temporal: { from, id, timer }

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
  toastTimer = setTimeout(() => (el.className = 'toast'), Math.max(2600, msg.length * 55)); // da tiempo a leerlo
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    api.saveConfig(cfg).catch(() => toast('No se pudo guardar la configuración', 'error'));
  }, 350);
}
// Al cerrar la app con un guardado pendiente, guardar ya (de forma síncrona: después no hay tiempo).
window.addEventListener('beforeunload', () => {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  api.saveConfigSync(cfg);
});

function activeExpr() {
  return cfg.expressions.find((e) => e.id === cfg.activeId) || cfg.expressions[0];
}

function setActive(id) {
  if (!cfg.expressions.some((e) => e.id === id)) return;
  if (tempExpr) { clearTimeout(tempExpr.timer); tempExpr = null; } // un cambio a mano manda sobre la temporal
  lastActivity = performance.now(); // cambiar de expresión también lo despierta
  cfg.activeId = id;
  scheduleSave();
  renderQuickbar();
  highlightActiveCard();
}

// Expresión durante unos segundos y luego vuelve a la de antes (canjes de puntos, Streamer.bot…).
// Si llegan varias seguidas, se vuelve a la que había antes de la primera.
function setTemporary(id, seconds) {
  if (!cfg.expressions.some((e) => e.id === id)) return;
  const from = tempExpr ? tempExpr.from : cfg.activeId;
  setActive(id);
  tempExpr = {
    from,
    id,
    timer: setTimeout(() => {
      const t = tempExpr;
      tempExpr = null;
      if (t && cfg.activeId === t.id) setActive(t.from);
    }, seconds * 1000),
  };
}
