// Se ejecuta DENTRO de la ventana de la app (ver main.js). Usa las variables y funciones globales de renderer/*.js.
/* global cfg, S, view, talking, shouting, blinking */

async function runTests(group, assetsDir) {
  const results = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const eq = (a, b, msg) => {
    const ja = JSON.stringify(a);
    const jb = JSON.stringify(b);
    if (ja !== jb) throw new Error(`${msg || 'distinto'}: ${ja} ≠ ${jb}`);
  };
  const ok = (v, msg) => { if (!v) throw new Error(msg || 'esperaba verdadero'); };
  const test = async (name, fn) => {
    try {
      await fn();
      results.push({ name: `${group}: ${name}`, ok: true });
    } catch (err) {
      results.push({ name: `${group}: ${name}`, ok: false, error: String(err && err.stack || err).split('\n').slice(0, 3).join(' | ') });
    }
  };
  // Archivo como los que da el selector de carpetas (con webkitRelativePath)
  const raven = (n) => `${assetsDir}/raven/raven_${n}.svg`;
  const file = (diskPath, rel) => {
    const f = new File([window.__readFile(diskPath)], rel.split('/').pop(), { type: 'image/svg+xml' });
    Object.defineProperty(f, 'webkitRelativePath', { value: rel });
    return f;
  };
  const jsonFile = (obj, rel) => {
    const f = new File([JSON.stringify(obj)], 'avatar.json', { type: 'application/json' });
    Object.defineProperty(f, 'webkitRelativePath', { value: rel });
    return f;
  };
  const key = (code, mods = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, ...mods }));

  if (group === 'migracion-v1') {
    await test('mantiene el modificador elegido para las teclas', () => {
      eq(cfg.expressions.map((e) => e.hotkey), ['Alt+Shift+1', 'Alt+Shift+2']);
      eq([S.muteKey, S.captureKey], ['Alt+Shift+M', 'Alt+Shift+H']);
    });
    await test('añade la casilla "parpadeo hablando" y conserva la activa', () => {
      ok('talkBlink' in cfg.expressions[0].frames, 'falta talkBlink');
      eq(activeExpr().name, 'Dos');
    });
    await test('guarda la configuración migrada (versión 2) al arrancar', () => {
      ok(window.__log.saved, 'no guardó al arrancar');
      eq(window.__log.saved.version, 2);
    });
    return results;
  }

  // ---------------- Instalación nueva ----------------

  await test('arranca con el cuervo de ejemplo y lo guarda (para la API de Streamer.bot)', () => {
    eq(cfg.expressions.map((e) => e.name), ['Normal', 'Feliz', 'Enojado', 'Sorprendido']);
    ok(window.__log.saved && window.__log.saved.expressions.length === 4, 'no guardó al arrancar');
    const accs = window.__log.bindings.map((b) => b.acc);
    ['Ctrl+Shift+1', 'Ctrl+Shift+4', 'Ctrl+Shift+M', 'Ctrl+Shift+H'].forEach((k) => ok(accs.includes(k), `falta el atajo ${k}`));
  });

  await test('teclas: combinaciones, nombres y teclas que "se comen" la escritura', () => {
    const ev = (code, m = {}) => accFromEvent({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...m });
    eq(ev('KeyQ', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Q');
    eq(ev('Numpad5', { altKey: true }), 'Alt+num5');
    eq(ev('F13'), 'F13');
    eq(ev('ShiftLeft', { shiftKey: true }), null);
    eq(keyLabel('Alt+num5'), 'Alt+Num 5');
    eq(keyLabel(null), 'Sin tecla');
    ok(isBareTypingKey('A') && !isBareTypingKey('F13') && !isBareTypingKey('Ctrl+A'));
  });

  await test('grabar tecla: asigna, Esc cancela, Supr quita, y una tecla solo hace una cosa', async () => {
    const btn = () => document.querySelectorAll('.expr-card [data-act="key"]')[1];
    btn().click(); await wait(20);
    key('F13'); await wait(20);
    eq(cfg.expressions[1].hotkey, 'F13');
    btn().click(); await wait(20);
    key('Escape'); await wait(20);
    eq(cfg.expressions[1].hotkey, 'F13', 'Esc no debía cambiarla');
    document.querySelectorAll('.expr-card [data-act="key"]')[0].click(); await wait(20);
    key('F13'); await wait(20);
    eq([cfg.expressions[0].hotkey, cfg.expressions[1].hotkey], ['F13', null], 'F13 debía pasar a la primera');
    document.querySelectorAll('.expr-card [data-act="key"]')[0].click(); await wait(20);
    key('Delete'); await wait(20);
    eq(cfg.expressions[0].hotkey, null);
    ok(window.__log.suspended >= 4, 'no pausó los atajos globales al grabar');
  });

  await test('fotogramas: parpadeo también al hablar, grito, y respaldo si falta una casilla', () => {
    const ex = cfg.expressions[0]; // Normal: tiene las 5 casillas
    const f = (t, b, s) => { talking = t; blinking = b; shouting = s; return pickFrame(ex); };
    eq(f(true, true, false), ex.frames.talkBlink);
    eq(f(true, false, false), ex.frames.talk);
    eq(f(false, true, false), ex.frames.blink);
    eq(f(true, false, true), ex.frames.shout);
    talking = blinking = shouting = false;
    const feliz = cfg.expressions[1]; // sin parpadeo: no parpadea
    blinking = true; eq(pickFrame(feliz), feliz.frames.idle); blinking = false;
  });

  await test('gestos al hablar: elige uno, lo mantiene en las pausas, cambia y vuelve al reposo', () => {
    const ex = cfg.expressions[0];
    const g = gestosOf(ex);
    g[0].idle = 'asset:g1-quieto'; g[0].talk = 'asset:g1-habla';
    g[2].idle = 'asset:g3-quieto'; g[2].talk = 'asset:g3-habla'; // el gesto 2 queda vacío: no se usa
    S.gestures = true; S.gestureEvery = 2; S.gestureHold = 1;
    gesture = 0; talking = false; blinking = false; shouting = false;
    updateGesture(0, ex); eq(gesture, 0, 'callado debía estar en reposo');
    talking = true; updateGesture(1000, ex);
    ok([1, 3].includes(gesture), `al hablar debía elegir el gesto 1 o 3 (eligió ${gesture})`);
    const primero = gesture;
    eq(pickFrame(ex), `asset:g${primero}-habla`);
    talking = false; updateGesture(1500, ex);
    eq(gesture, primero, 'en una pausa corta debía mantener el gesto');
    eq(pickFrame(ex), `asset:g${primero}-quieto`, 'en la pausa: mismo gesto con la boca cerrada');
    talking = true; updateGesture(1000 + 2000 * 1.31, ex);
    ok(gesture && gesture !== primero, 'tras ~2 s hablando debía cambiar al otro gesto');
    talking = false; updateGesture(9000, ex); updateGesture(9000 + 1100, ex);
    eq(gesture, 0, 'tras callar más de 1 s debía volver al reposo');
    eq(pickFrame(ex), ex.frames.idle);
    S.gestures = false; talking = true; updateGesture(20000, ex); eq(gesture, 0, 'desactivado: siempre reposo');
    S.gestures = true; talking = false; gesture = 0;
    g[0].idle = g[0].talk = g[2].idle = g[2].talk = null;
  });

  await test('accesorios: poner/quitar con atajo, "solo al gritar" y "solo en estas expresiones"', async () => {
    addAccessory();
    const a = cfg.accessories[0];
    await importAccessoryImage(file(raven('wide_wide'), 'x/gafas.svg'), a);
    ok(a.on && a.src, 'no se puso');
    window.__cb.hotkey({ type: 'accessory', id: a.id }); eq(a.on, false);
    window.__cb.hotkey({ type: 'accessorySet', id: a.id, value: true }); eq(a.on, true);
    a.when = 'gritando';
    talking = true; shouting = false; eq(accessoryWhen(a), false);
    shouting = true; eq(accessoryWhen(a), true);
    talking = shouting = false; a.when = 'siempre';
    a.exprs = [cfg.expressions[2].id];
    eq(accessoryInExpr(a, cfg.expressions[0]), false);
    eq(accessoryInExpr(a, cfg.expressions[2]), true);
    a.exprs = [];
  });

  await test('accesorios: dos con la misma imagen no se pisan en la vista', async () => {
    addAccessory();
    const b = cfg.accessories[1];
    b.src = cfg.accessories[0].src;
    b.on = true;
    tick();
    await wait(50);
    eq(view.accs.size, 2);
  });

  await test('Streamer.bot: direcciones de expresiones y accesorios (con "/" en el nombre)', () => {
    cfg.accessories[1].name = 'Gafas 3D/rojas';
    renderRemote();
    const values = [...document.querySelectorAll('#selRemote option')].map((o) => o.value);
    ok(values.includes('/expresion/Normal'), 'falta la expresión');
    ok(values.includes('/accesorio/Gafas_3D%2Frojas/alternar'), 'el "/" no va codificado');
    ok(document.querySelector('#remoteUrl').textContent.includes('clave=CLAVE'), 'falta la clave');
  });

  await test('importar carpeta: expresiones, accesorios y avatar.json (nombres, teclas, ajustes)', async () => {
    const manifest = {
      formato: 'corvid-avatar', version: 1, activa: 'Mareado: ¿sí?',
      ajustes: { scale: 77, muteKey: 'F2', captureKey: 'F9' },
      expresiones: [
        { nombre: 'Mareado: ¿sí?', carpeta: 'Mareado ¿sí', tecla: 'F2' },
        { nombre: 'Normal', carpeta: 'Normal', tecla: 'F1' },
      ],
      accesorios: [{ nombre: 'Gorra', archivo: 'Gorra.svg', tecla: 'F11', puesto: true, detras: true, cuando: 'hablando',
        inercia: 20, ajuste: { x: 5, y: -2, scale: 90, rot: 10, flip: false }, expresiones: ['Normal'] }],
    };
    const files = [
      jsonFile(manifest, 'Av/avatar.json'),
      file(raven('open_closed'), 'Av/Normal/quieto.svg'),
      file(raven('open_open'), 'Av/Normal/hablando.svg'),
      file(raven('happy_open'), 'Av/Normal/gesto2/hablando.svg'),
      file(raven('happy_closed'), 'Av/Normal/gesto2/quieto.svg'),
      file(raven('happy_closed'), 'Av/Normal/gesto9/quieto.svg'), // fuera de rango: se ignora
      file(raven('wide_closed'), 'Av/Mareado ¿sí/quieto.svg'),
      file(raven('wide_wide'), 'Av/accesorios/Gorra.svg'),
      file(raven('wide_wide'), 'Av/notas.txt'),
    ];
    window.confirm = () => true;
    await importFolder(files);
    const mareado = cfg.expressions.find((e) => e.name === 'Mareado: ¿sí?');
    ok(mareado, 'no conservó el nombre original');
    eq(mareado.hotkey, 'F2');
    const normal = cfg.expressions.find((e) => e.name === 'Normal');
    eq(normal.hotkey, 'F1');
    ok(normal.gestos[1].talk && normal.gestos[1].idle, 'no importó el gesto 2');
    ok(!hasFrames(normal.gestos[0]) && !hasFrames(normal.gestos[2]), 'gestos que no venían deben quedar vacíos');
    ok(!cfg.expressions.some((e) => /gesto/i.test(e.name)), 'una carpeta gestoN no es una expresión');
    eq(activeExpr().name, 'Mareado: ¿sí?');
    const g = cfg.accessories.find((a) => a.name === 'Gorra');
    eq([g.hotkey, g.on, g.behind, g.when, g.inertia, g.adjust.rot], ['F11', true, true, 'hablando', 20, 10]);
    eq(g.exprs, [cfg.expressions.find((e) => e.name === 'Normal').id]);
    eq(S.scale, 77);
    eq(S.muteKey, null, 'F2 era de una expresión: silenciar debía quedarse sin tecla');
    eq(S.captureKey, 'F9');
    ok(/Ojo: F2/.test(document.querySelector('#toast').textContent), 'no avisó del choque de teclas');
  });

  await test('física: el salto aterriza, se aplasta y vuelve; el accesorio no se sale', () => {
    const l = [...view.accs.values()][0];
    l.want = true;
    view.body = { y: 0, vy: 0, s: 0, vs: 0, x: 0, rot: 0 };
    view.last = 1000;
    for (let i = 0; i < 5; i++) view.step(view.last + 1000 / 60);
    view.triggerHop();
    let minY = 0;
    let landedAt = null;
    for (let i = 1; i <= 120; i++) {
      view.step(view.last + 1000 / 60);
      minY = Math.min(minY, view.body.y);
      if (landedAt === null && i > 3 && view.body.y === 0) landedAt = i;
      const H = view.hop.clientHeight;
      ok(Math.abs(l.phys.y) <= 0.06 * H + 0.01 && Math.abs(l.phys.x) <= 0.06 * H + 0.01, 'el accesorio se salió del límite');
    }
    ok(minY < -5, `no saltó (y mínima ${minY})`);
    ok(landedAt && landedAt * 16.7 < 450, `tardó en aterrizar (${landedAt} pasos)`);
    ok(Math.abs(view.body.s) < 0.01, `no recuperó la forma (s=${view.body.s})`);
  });

  await test('soltar un archivo fuera de una casilla no hace nada', () => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'algo.png', { type: 'image/png' }));
    const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
    document.querySelector('.meter-card').dispatchEvent(ev);
    ok(ev.defaultPrevented, 'el drop no se canceló (Electron navegaría a la imagen)');
  });

  await test('al cerrar con un guardado pendiente, se guarda en el momento', () => {
    cfg.expressions[0].name = 'Cambio de último segundo';
    scheduleSave();
    window.dispatchEvent(new Event('beforeunload'));
    ok(window.__log.syncSaved, 'no guardó al cerrar');
    eq(window.__log.syncSaved.expressions[0].name, 'Cambio de último segundo');
  });

  return results;
}
