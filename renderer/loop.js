/* Corvid PNGtuber — Bucle principal: qué fotograma y qué accesorios se ven en cada momento */
'use strict';

// ---------- Bucle principal ----------

function scheduleBlink(now) {
  const min = Math.min(S.blinkMin, S.blinkMax);
  const max = Math.max(S.blinkMin, S.blinkMax);
  nextBlink = now + (min + Math.random() * (max - min)) * 1000;
}

// ---------- Gestos al hablar ----------
// Al empezar a hablar se elige un gesto (alas/brazos en otra posición) y se mantiene unos segundos
// mientras la boca sigue abriéndose y cerrándose con la voz; luego cambia a otro. Tras un rato callado
// (gestureHold) vuelve al reposo. Así los brazos no saltan al reposo en cada pausa entre sílabas.
let gesture = 0;        // 0 = reposo (ex.frames); 1..MAX_GESTOS = ex.gestos[gesture - 1]
let nextGesture = 0;    // cuándo cambiar al siguiente gesto
let lastTalkAt = -1e9;

function updateGesture(now, ex) {
  const avail = gestosOf(ex).map((g, i) => (hasFrames(g) ? i + 1 : 0)).filter(Boolean);
  if (!S.gestures || !avail.length) { gesture = 0; return; }
  if (talking) lastTalkAt = now;
  if (gesture && !avail.includes(gesture)) gesture = 0; // cambió la expresión
  const otro = () => {
    const opts = avail.length > 1 ? avail.filter((g) => g !== gesture) : avail;
    return opts[Math.floor(Math.random() * opts.length)];
  };
  const duracion = () => S.gestureEvery * 1000 * (0.7 + Math.random() * 0.6); // algo irregular, más natural
  if (talking && !gesture) {
    gesture = otro();
    nextGesture = now + duracion();
  } else if (gesture && talking && now >= nextGesture) {
    gesture = otro();
    nextGesture = now + duracion();
  } else if (gesture && now - lastTalkAt > S.gestureHold * 1000) {
    gesture = 0;
  }
}

// ---------- Vida en reposo y modo dormido ----------
// Callado, de vez en cuando hace un gesto con el cuerpo (no necesita imágenes): ladea la cabeza, da
// saltitos, se sacude o se estira. Tras S.sleepAfter minutos sin hablar se duerme; al hablar se despierta.
// Las acciones viajan en el estado con un número que solo sube: así la vista de OBS las ve una sola vez.
const IDLE_ACTIONS = ['ladeo', 'saltito', 'sacudida', 'estirarse'];
const ACTIONS = [...IDLE_ACTIONS, 'salto', 'despertar'];
let action = null;      // { name, n }
let actionSeq = 0;
let nextIdleAction = 0;

function playAction(name) {
  if (!ACTIONS.includes(name)) return false;
  action = { name, n: ++actionSeq };
  return true;
}

function scheduleIdleAction(now) {
  nextIdleAction = now + S.idleEvery * 1000 * (0.6 + Math.random() * 0.8);
}

function updateIdle(now) {
  if (talking) lastActivity = now;
  const wasSleeping = sleeping;
  sleeping = !!S.sleep && !talking && now - lastActivity > S.sleepAfter * 60000;
  if (wasSleeping && !sleeping) playAction('despertar');

  // Gestos de reposo: solo callado, despierto y no justo después de hablar
  if (talking || sleeping || !S.idleActions) {
    if (now > nextIdleAction - 4000) nextIdleAction = now + 4000;
  } else if (now >= nextIdleAction) {
    const prev = action && action.name;
    const opts = IDLE_ACTIONS.filter((a) => a !== prev);
    playAction(opts[Math.floor(Math.random() * opts.length)]);
    scheduleIdleAction(now);
  }
}

// Dormido: la expresión elegida para dormir o, si no hay, la actual con los ojos cerrados.
function sleepExpr() {
  return (S.sleepExpr && cfg.expressions.find((e) => e.id === S.sleepExpr)) || null;
}

function pickFrame(ex) {
  if (sleeping) {
    const f = ex.frames;
    return (ex.id !== S.sleepExpr && f.blink) || f.idle || f.talk || null;
  }
  const f = gesture ? ex.gestos[gesture - 1] : ex.frames;
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
  ['dormido', 'Solo dormido'],
];
function accessoryWhen(a) {
  switch (a.when) {
    case 'hablando': return talking;
    case 'gritando': return shouting;
    case 'callado': return !talking;
    case 'dormido': return sleeping;
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
  const sets = cfg.expressions.flatMap((e) => [e.frames, ...(e.gestos || [])]);
  const key = JSON.stringify(sets);
  if (preloadCache.key !== key) {
    preloadCache = { key, refs: [...new Set(sets.flatMap((f) => Object.values(f || {})).filter(Boolean))] };
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

  updateIdle(now);
  const ex = (sleeping && sleepExpr()) || activeExpr();
  if (sleeping) gesture = 0; else updateGesture(now, ex);
  const state = {
    src: pickFrame(ex),
    exprId: ex.id,
    gesture,
    talking,
    shouting,
    sleeping,
    zzz: sleeping && S.sleepZzz ? S.sleepZzzSide : '',
    action,
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
  const label = muted ? 'Silenciado' : shouting ? '¡Gritando!' : talking ? 'Hablando' : sleeping ? 'Dormido' : 'Callado';
  const el = $('#stateLabel');
  if (el.textContent !== label) el.textContent = label;
  el.dataset.state = muted ? 'muted' : shouting ? 'shout' : talking ? 'talk' : 'idle';
}
