/* Corvid PNGtuber — Controles genéricos y paneles de Micrófono y Animación */
'use strict';

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

// options: [[valor, texto]…] o una función que las devuelve (se rellena al abrir, por si cambian).
function selectRow({ key, label, options, onChange }) {
  const row = document.createElement('div');
  row.className = 'field';
  row.innerHTML = `<label>${label}</label><select></select>`;
  const sel = row.querySelector('select');
  const fill = () => {
    const list = typeof options === 'function' ? options() : options;
    sel.innerHTML = '';
    for (const [v, text] of list) sel.add(new Option(text, v));
    sel.value = list.some(([v]) => v === S[key]) ? S[key] : list[0][0];
  };
  fill();
  sel.addEventListener('focus', fill);
  sel.addEventListener('pointerdown', fill);
  sel.addEventListener('change', () => {
    S[key] = sel.value;
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
  syncers.length = 0; // los de una construcción anterior apuntan a controles que ya no existen
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
    section('Gestos al hablar',
      toggleRow({ key: 'gestures', label: 'Cambiar de gesto mientras hablas', hint: 'Usa los gestos de cada expresión (alas, brazos…)' }),
      sliderRow({ key: 'gestureEvery', label: 'Cambiar de gesto cada…', min: 1, max: 6, step: 0.2, fmt: (v) => `~${v} s` }),
      sliderRow({ key: 'gestureHold', label: 'Volver al reposo tras callar', min: 0.4, max: 4, step: 0.1, fmt: (v) => `${v} s` }),
    ),
    section('Balanceo en reposo',
      toggleRow({ key: 'sway', label: 'Balancearse suavemente', hint: 'Vaivén lateral y un poco de giro, siempre' }),
      sliderRow({ key: 'swayAmount', label: 'Cuánto', min: 0.2, max: 5, step: 0.1, fmt: (v) => `${v}%` }),
      sliderRow({ key: 'swaySpeed', label: 'Lentitud (un vaivén cada…)', min: 1.5, max: 10, step: 0.5, fmt: (v) => `${v} s` }),
    ),
    section('Vida en reposo',
      toggleRow({ key: 'idleActions', label: 'Gestos cuando estás callado', hint: 'Ladea la cabeza, da saltitos, se sacude o se estira' }),
      sliderRow({ key: 'idleEvery', label: 'Un gesto cada…', min: 4, max: 60, step: 1, fmt: (v) => `~${v} s`,
        onChange: () => scheduleIdleAction(performance.now()) }),
    ),
    section('Modo dormido',
      toggleRow({ key: 'sleep', label: 'Dormirse si no hablas', hint: 'Al volver a hablar se despierta con un estirón' }),
      sliderRow({ key: 'sleepAfter', label: 'Se duerme tras…', min: 0.5, max: 30, step: 0.5, fmt: (v) => `${v} min` }),
      selectRow({ key: 'sleepExpr', label: 'Expresión al dormir',
        options: () => [['', 'La actual, con los ojos cerrados'], ...cfg.expressions.map((e) => [e.id, e.name])] }),
      toggleRow({ key: 'sleepZzz', label: 'Mostrar Zzz' }),
      selectRow({ key: 'sleepZzzSide', label: 'Zzz a la…', options: [['derecha', 'Derecha'], ['izquierda', 'Izquierda']] }),
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
