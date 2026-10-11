// Vista del avatar, compartida por la ventana de la app y la fuente de OBS.
(function () {
  // Las imágenes se guardan como referencias:
  //   "asset:raven/raven_open_closed.svg"  -> imágenes incluidas con la app
  //   "user:1712345-abc.png"               -> imágenes que subiste tú
  function makeResolver(mode, imagesBase) {
    return function resolve(ref) {
      if (!ref) return '';
      const i = ref.indexOf(':');
      const kind = ref.slice(0, i);
      const rest = ref.slice(i + 1);
      if (kind === 'asset') return (mode === 'http' ? '/assets/' : '../assets/') + rest;
      if (kind === 'user') return (mode === 'http' ? '/user/' : imagesBase) + encodeURIComponent(rest);
      return '';
    };
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Caja del dibujo dentro de la imagen (0-1), para que el accesorio gire desde su base.
  // Si el navegador no deja leer los píxeles (archivos locales), se usa un valor razonable.
  function measureBox(img) {
    try {
      const n = 96;
      const c = document.createElement('canvas');
      c.width = c.height = n;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, n, n);
      const d = ctx.getImageData(0, 0, n, n).data;
      let x0 = n, y0 = n, x1 = -1, y1 = -1;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (d[(y * n + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return null;
      return { cx: (x0 + x1 + 1) / 2 / n, cy: (y0 + y1 + 1) / 2 / n, bottom: (y1 + 1) / n };
    } catch {
      return null;
    }
  }

  class AvatarView {
    constructor(root, resolve) {
      this.root = root;
      this.resolve = resolve;
      root.classList.add('av-root');
      // av-place: tamaño y posición · av-motion: respiración (CSS) · av-hop: salto y balanceo (física)
      // Accesorios detrás (av-back) y delante (av-front) del personaje; se mueven con él.
      root.innerHTML = '<div class="av-place"><div class="av-motion"><div class="av-hop">'
        + '<div class="av-back"></div><div class="av-frames"></div><div class="av-front"></div></div></div></div>';
      this.place = root.querySelector('.av-place');
      this.hop = root.querySelector('.av-hop');
      this.frames = root.querySelector('.av-frames');
      this.back = root.querySelector('.av-back');
      this.front = root.querySelector('.av-front');
      this.accs = new Map(); // ref -> { wrap, el, ready, box, phys, cfg }
      // Una <img> por fotograma, apiladas y ya decodificadas: cambiar de fotograma solo
      // cambia cuál se ve, así nunca hay un instante en blanco (sobre todo en OBS).
      this.layers = new Map(); // ref -> { el, ready }
      this.current = undefined;
      this.shown = null;
      this.wasTalking = false;
      this.exprId = null;

      // Física del cuerpo (unidades: px y segundos)
      this.anim = {};
      this.body = { y: 0, vy: 0, s: 0, vs: 0, x: 0, rot: 0 };
      this.t0 = performance.now();
      this.last = null;
      this.step = this.step.bind(this);
      requestAnimationFrame(this.step);
    }

    layer(ref) {
      let l = this.layers.get(ref);
      if (l) return l;
      const el = document.createElement('img');
      el.className = 'av-img';
      el.alt = '';
      el.draggable = false;
      el.src = this.resolve(ref);
      this.frames.appendChild(el);
      // decode() termina cuando la imagen se puede pintar sin esperas; si falla, se muestra igual.
      const ready = el.decode().catch(() => {});
      l = { el, ready };
      this.layers.set(ref, l);
      return l;
    }

    // refs: las imágenes que conviene tener listas. Las que ya no usa ninguna expresión se liberan,
    // salvo la que se está viendo, que sigue hasta que la nueva esté decodificada.
    preload(refs) {
      const keep = new Set((refs || []).filter(Boolean));
      if (this.current) keep.add(this.current);
      if (this.shownRef) keep.add(this.shownRef);
      for (const ref of keep) this.layer(ref);
      for (const [ref, l] of this.layers) {
        if (!keep.has(ref)) { l.el.removeAttribute('src'); l.el.remove(); this.layers.delete(ref); }
      }
    }

    show(ref) {
      this.current = ref;
      if (!ref) {
        if (this.shown) this.shown.classList.remove('av-on');
        this.shown = null;
        this.shownRef = null;
        return;
      }
      const l = this.layer(ref);
      // Mantiene visible el fotograma anterior hasta que el nuevo está listo.
      l.ready.then(() => {
        if (this.current !== ref || this.shown === l.el) return;
        l.el.classList.add('av-on');
        if (this.shown) this.shown.classList.remove('av-on');
        this.shown = l.el;
        this.shownRef = ref;
      });
    }

    apply(state) {
      const a = state.anim || {};
      this.anim = a;
      this.root.style.setProperty('--shake', `${a.shakeAmount ?? 4}px`);
      this.root.classList.toggle('av-breathe', !!a.breathing);
      this.root.classList.toggle('av-shaking', !!(a.shake && state.shouting));

      // Tamaño, posición y espejo (capa propia para no pisar las animaciones)
      const L = state.layout || {};
      this.place.style.transform =
        `translate(${L.x || 0}%, ${-(L.y || 0)}%) scale(${(L.scale || 100) / 100}) scaleX(${L.flip ? -1 : 1})`;

      this.preload(state.preload);

      if (state.src !== this.current) this.show(state.src || null);
      this.applyAccessories(state.accessories || []);

      const exprChanged = this.exprId !== null && state.exprId !== this.exprId;
      if (a.bounce && ((state.talking && !this.wasTalking) || exprChanged)) this.triggerHop();
      this.wasTalking = !!state.talking;
      this.exprId = state.exprId;
    }

    // list: [{ src, on, behind, inertia }] de todos los accesorios; se cargan todos y se ven solo los puestos.
    applyAccessories(list) {
      const seen = new Set();
      list.forEach((a) => {
        if (!a.src) return;
        // Por accesorio (no por imagen): dos accesorios pueden usar la misma imagen con ajustes distintos.
        const key = a.id || a.src;
        seen.add(key);
        let l = this.accs.get(key);
        if (l && l.src !== a.src) { l.wrap.remove(); this.accs.delete(key); l = null; } // cambió la imagen
        if (!l) {
          // wrap: física · adj: ajuste del usuario (posición, tamaño, giro) · img: tiembla con el CSS
          const wrap = document.createElement('div');
          wrap.className = 'av-acc-wrap';
          const adj = document.createElement('div');
          adj.className = 'av-acc-wrap';
          const el = document.createElement('img');
          el.className = 'av-img av-acc';
          el.alt = '';
          el.draggable = false;
          el.src = this.resolve(a.src);
          adj.appendChild(el);
          wrap.appendChild(adj);
          l = { src: a.src, wrap, adj, el, box: null, phys: { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 } };
          l.ready = el.decode().catch(() => {}).then(() => { l.box = measureBox(el); });
          this.accs.set(key, l);
        }
        l.cfg = a;
        // En el orden de la lista: el último queda encima.
        const parent = a.behind ? this.back : this.front;
        if (l.wrap.parentNode !== parent || parent.lastElementChild !== l.wrap) parent.appendChild(l.wrap);
        l.want = !!a.on;
        l.ready.then(() => l.el.classList.toggle('av-on', l.want));
        l.adj.classList.toggle('av-editing', !!a.editing);
      });
      for (const [ref, l] of this.accs) {
        if (!seen.has(ref)) { l.wrap.remove(); this.accs.delete(ref); }
      }
    }

    // Altura (px) y duración (s) del salto → velocidad inicial y gravedad de un tiro parabólico.
    hopParams() {
      const H = this.hop.clientHeight || 600;
      const h = Math.max(1, ((this.anim.bounceHeight ?? 6) / 100) * H);
      const T = Math.max(0.08, (this.anim.bounceMs ?? 260) / 1000);
      return { v0: (4 * h) / T, g: (8 * h) / (T * T) };
    }

    triggerHop() {
      const b = this.body;
      const { v0, g } = this.hopParams();
      // Solo salta si está en el suelo o bajando cerca de él (si no, los saltos se encadenarían hacia arriba).
      const maxH = (v0 * v0) / (2 * g);
      if (b.y === 0 || (b.vy > 0 && b.y > -0.3 * maxH)) b.vy = -v0;
    }

    step(now) {
      requestAnimationFrame(this.step);
      const dt = this.last === null ? 0 : clamp((now - this.last) / 1000, 0, 0.05);
      this.last = now;
      if (!dt) return;
      const a = this.anim;
      const b = this.body;
      const { v0, g } = this.hopParams();
      const H = this.hop.clientHeight || 600;
      // Velocidades al final del paso anterior: así el impulso del salto (que llega entre pasos) cuenta.
      const prevVx = b.pvx || 0;
      const prevVy = b.pvy || 0;
      const airborne = b.y < 0 || b.vy < 0;

      // Salto con gravedad; al caer se aplasta según la velocidad del golpe.
      if (b.y < 0 || b.vy < 0) {
        b.vy += g * dt;
        b.y += b.vy * dt;
        if (b.y >= 0) {
          const impact = clamp(b.vy / v0, 0, 1.5);
          b.y = 0;
          b.vy = 0;
          b.vs -= ((a.squash ?? 8) / 100) * impact * 14;
          this.landing = impact;
        }
      }
      // Muelle del aplastamiento (algo rebotón)
      const k = 260;
      b.vs += (-k * b.s - 14 * b.vs) * dt;
      b.s += b.vs * dt;

      // Balanceo en reposo: vaivén lateral y un poco de giro, siempre suave
      const t = (now - this.t0) / 1000;
      const P = Math.max(1, a.swaySpeed ?? 4);
      const amp = a.sway === false ? 0 : ((a.swayAmount ?? 1) / 100) * H;
      const x = amp * Math.sin((2 * Math.PI * t) / P);
      const rot = (a.sway === false ? 0 : (a.swayAmount ?? 1) * 0.9) * Math.sin((2 * Math.PI * t) / (P * 1.27));
      b.vx = (x - b.x) / dt;
      b.x = x;
      b.rot = rot;

      // Estirado en el aire, aplastado al caer (conserva el volumen aproximado)
      const air = b.y < 0 ? clamp(-b.vy / v0, -1, 1) * 0.035 : 0;
      const sy = 1 + b.s + air;
      const sx = 1 - (b.s + air) * 0.6;
      this.hop.style.transform =
        `translate(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px) rotate(${b.rot.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;

      // Aceleración del cuerpo en este paso: lo que "empuja" a los accesorios.
      // En el aire se descuenta la gravedad: cuerpo y accesorio caen juntos y no se separan.
      const ax = (b.vx - prevVx) / dt;
      const ay = (b.vy - prevVy) / dt - (airborne ? g : 0);
      b.pvx = b.vx;
      b.pvy = b.vy;
      const landed = this.landing || 0;
      this.landing = 0;
      for (const l of this.accs.values()) this.stepAccessory(l, dt, ax, ay, landed, H);
    }

    // Cada accesorio es una masa con muelle pegada al cuerpo: se retrasa, rebota y se inclina.
    // Tamaño en pantalla (px, sin la escala general) del dibujo de la imagen dentro del recuadro.
    drawnSize(l) {
      const W = l.wrap.clientWidth || 1;
      const H = l.wrap.clientHeight || 1;
      const iw = l.el.naturalWidth || 1;
      const ih = l.el.naturalHeight || 1;
      const s = Math.min(W / iw, H / ih);
      return { W, H, iw, ih, s, left: (W - iw * s) / 2, top: H - ih * s };
    }

    // Ajuste del usuario: x/y en % del dibujo, escala en %, giro en grados; centrado en el propio accesorio.
    applyAdjust(l) {
      const A = (l.cfg && l.cfg.adjust) || {};
      const d = this.drawnSize(l);
      const box = l.box || { cx: 0.5, cy: 0.25, bottom: 0.3 };
      const cx = d.left + box.cx * d.iw * d.s;
      const cy = d.top + box.cy * d.ih * d.s;
      const tx = ((A.x || 0) / 100) * d.ih * d.s;
      const ty = ((A.y || 0) / 100) * d.ih * d.s;
      const sc = (A.scale || 100) / 100;
      const key = `${cx}|${cy}|${tx}|${ty}|${sc}|${A.rot || 0}|${A.flip ? 1 : 0}`;
      if (l.adjKey !== key) {
        l.adjKey = key;
        l.adj.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
        l.adj.style.transform = (tx || ty || sc !== 1 || A.rot || A.flip)
          ? `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${A.rot || 0}deg) scale(${A.flip ? -sc : sc}, ${sc})`
          : '';
      }
      // La base del accesorio ya ajustada: desde ahí gira la física.
      return { ox: cx + tx, oy: cy + ty + (box.bottom - box.cy) * d.ih * d.s * sc, d };
    }

    stepAccessory(l, dt, ax, ay, landed, H) {
      const p = l.phys;
      const base = this.applyAdjust(l);
      const inertia = clamp((l.cfg && l.cfg.inertia) ?? 50, 0, 100) / 100;
      if (!l.want || inertia === 0 || (l.cfg && l.cfg.editing)) {
        if (p.x || p.y || p.r) { p.x = p.y = p.r = p.vx = p.vy = p.vr = 0; l.wrap.style.transform = ''; }
        return;
      }
      const k = 700 - 600 * inertia;           // más inercia = muelle más blando
      const c = 2 * Math.sqrt(k) * 0.32;        // poco amortiguado: rebota un par de veces
      // 0.6: el accesorio va "algo sujeto", no suelto del todo
      p.vx += (-k * p.x - c * p.vx - ax * 0.6) * dt;
      p.vy += (-k * p.y - c * p.vy - ay * 0.6) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const lim = 0.06 * H;                    // que no salga volando
      p.x = clamp(p.x, -lim, lim);
      // Hacia abajo apenas se hunde (taparía la cara); hacia arriba puede saltar más
      if (p.y > lim * 0.25) { p.y = lim * 0.25; if (p.vy > 0) p.vy *= -0.3; }
      p.y = Math.max(p.y, -lim);

      // Giro: sigue al desplazamiento lateral y recibe un toque al aterrizar
      if (landed) p.vr += (Math.random() < 0.5 ? -1 : 1) * landed * 280 * inertia;
      const kr = 220;
      p.vr += (-kr * p.r - 2 * Math.sqrt(kr) * 0.3 * p.vr) * dt;
      p.r += p.vr * dt;
      const r = clamp(p.r + (p.x / H) * 160, -14, 14);

      // Gira desde la base del accesorio (ya con el ajuste del usuario)
      l.wrap.style.transformOrigin = `${base.ox.toFixed(1)}px ${base.oy.toFixed(1)}px`;
      l.wrap.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${r.toFixed(2)}deg)`;
    }
  }

  window.AvatarView = AvatarView;
  window.makeResolver = makeResolver;
})();
