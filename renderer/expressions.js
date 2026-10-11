/* Corvid PNGtuber — Expresiones: tarjetas, casillas e imágenes */
'use strict';

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
