/* Corvid PNGtuber — Accesorios: tarjetas, condiciones y editor de posición y tamaño */
'use strict';

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
    const l = view.accs.get(a.id);
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
