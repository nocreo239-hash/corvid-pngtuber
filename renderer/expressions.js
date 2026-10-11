/* Corvid PNGtuber — Expresiones: tarjetas, casillas e imágenes */
'use strict';

// ---------- Expresiones ----------

function slotFallbackNote(set, slot) {
  if (set[slot]) return '';
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
      <div class="slots"></div>
      <details class="gestos">
        <summary></summary>
        <p class="muted small">Mientras hablas, el personaje alterna entre estos gestos (por ejemplo, alas o brazos en otra
          posición) y vuelve al de arriba cuando te callas un rato. Cada gesto tiene sus propias casillas.</p>
      </details>`;
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

    // Gestos al hablar: hasta MAX_GESTOS series más de casillas
    const det = card.querySelector('.gestos');
    const usados = gestosOf(ex).filter(hasFrames).length;
    det.querySelector('summary').textContent = `Gestos al hablar${usados ? ` (${usados})` : ''}`;
    det.open = openGestos.has(ex.id);
    det.addEventListener('toggle', () => (det.open ? openGestos.add(ex.id) : openGestos.delete(ex.id)));
    gestosOf(ex).forEach((set, i) => {
      const row = document.createElement('div');
      row.className = 'gesto-row';
      row.innerHTML = `<div class="gesto-title">Gesto ${i + 1}</div><div class="slots"></div>`;
      SLOTS.forEach(({ key, label }) => row.querySelector('.slots').appendChild(buildSlot(ex, key, label, set)));
      det.appendChild(row);
    });
    list.appendChild(card);
  });
  highlightActiveCard();
}

// set: la serie de imágenes a la que pertenece la casilla (ex.frames o uno de los gestos)
function buildSlot(ex, key, label, set = ex.frames) {
  const slot = document.createElement('div');
  slot.className = 'slot';
  const ref = set[key];
  slot.innerHTML = `
    <div class="slot-img ${ref ? 'filled' : ''}">
      ${ref ? `<img alt="" src="${view.resolve(ref)}">` : '<span class="plus">+</span>'}
      ${ref ? '<button class="slot-clear" title="Quitar">✕</button>' : ''}
    </div>
    <div class="slot-label">${label}<span class="muted">${slotFallbackNote(set, key)}</span></div>`;
  const box = slot.querySelector('.slot-img');

  box.addEventListener('click', (e) => {
    if (e.target.closest('.slot-clear')) return;
    pickFileFor(ex, key, set);
  });
  const clear = slot.querySelector('.slot-clear');
  if (clear) clear.addEventListener('click', () => { set[key] = null; scheduleSave(); renderExpressions(); });

  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('drag'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('drag');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) importImage(file, ex, key, set);
  });
  return slot;
}

let pickTarget = null;
const openGestos = new Set(); // tarjetas con "Gestos al hablar" desplegado (sobrevive al repintado)
function pickFileFor(ex, key, set = ex.frames) {
  pickTarget = { ex, key, set };
  const picker = $('#filePicker');
  picker.value = '';
  picker.click();
}

async function importImage(file, ex, key, set = ex.frames) {
  if (!/\.(png|gif|webp|jpe?g|svg)$/i.test(file.name)) return toast('Usa PNG, GIF, WEBP, JPG o SVG', 'error');
  if (file.size > 20 * 1024 * 1024) return toast('La imagen pesa más de 20 MB', 'error');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    set[key] = await api.saveImage(file.name, bytes);
    setActive(ex.id);
    scheduleSave();
    renderExpressions();
    toast(`Imagen añadida a “${ex.name}”`);
  } catch {
    toast('No pude guardar la imagen', 'error');
  }
}

function newExpr(name, frames = {}, gestos = []) {
  return { id: uid(), name, hotkey: nextFreeKey(), frames: { ...emptyFrames(), ...frames }, gestos: gestos.map((g) => ({ ...emptyFrames(), ...g })) };
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
  const ex = newExpr(`${src.name} (copia)`, src.frames, src.gestos || []);
  cfg.expressions.splice(cfg.expressions.indexOf(src) + 1, 0, ex);
  setActive(ex.id);
  renderExpressions();
  scheduleSave();
  applyHotkeys();
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
