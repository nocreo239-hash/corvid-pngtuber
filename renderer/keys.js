/* Corvid PNGtuber — Teclas: aceleradores, grabar una tecla nueva y registrar los atajos globales */
'use strict';

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


function paintKeyButton(btn, acc) {
  btn.textContent = keyLabel(acc);
  btn.classList.toggle('empty', !acc);
  btn.classList.remove('recording');
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
