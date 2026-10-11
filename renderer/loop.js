/* Corvid PNGtuber — Bucle principal: qué fotograma y qué accesorios se ven en cada momento */
'use strict';

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
      id: a.id, src: a.src, on: !!a.on && accessoryWhen(a) && accessoryInExpr(a, ex), behind: !!a.behind, inertia: a.inertia ?? 50, adjust: a.adjust || null,
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
