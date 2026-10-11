/* Corvid PNGtuber — Micrófono: abrirlo, medir el nivel y calibrar el ruido de fondo */
'use strict';

// ---------- Audio ----------

async function startMic() {
  stopMic();
  try {
    const constraints = {
      audio: {
        deviceId: S.deviceId ? { exact: S.deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: S.noiseSuppression,
        autoGainControl: false,
      },
    };
    audio.stream = await navigator.mediaDevices.getUserMedia(constraints);
    audio.ctx = audio.ctx || new AudioContext();
    await audio.ctx.resume();
    audio.source = audio.ctx.createMediaStreamSource(audio.stream);
    audio.analyser = audio.ctx.createAnalyser();
    audio.analyser.fftSize = 1024;
    if (S.voiceFilter) {
      // Solo la banda de la voz: los golpes graves (mesa, pasos) y los clics agudos del teclado cuentan menos.
      const hp = new BiquadFilterNode(audio.ctx, { type: 'highpass', frequency: 100, Q: 0.7 });
      const lp = new BiquadFilterNode(audio.ctx, { type: 'lowpass', frequency: 4000, Q: 0.7 });
      audio.source.connect(hp).connect(lp).connect(audio.analyser);
    } else {
      audio.source.connect(audio.analyser);
    }
    audio.buf = new Float32Array(audio.analyser.fftSize);
    audio.error = null;
  } catch (err) {
    audio.error = err;
    if (S.deviceId) {
      // El micrófono guardado ya no existe: vuelve al predeterminado.
      S.deviceId = '';
      scheduleSave();
      return startMic();
    }
    toast('No pude abrir el micrófono. Revisa los permisos de Windows.', 'error');
  }
  updatePills();
  refreshDevices();
}

function stopMic() {
  if (audio.stream) audio.stream.getTracks().forEach((t) => t.stop());
  if (audio.source) audio.source.disconnect();
  audio.stream = audio.source = audio.analyser = null;
}

async function refreshDevices() {
  const sel = $('#selDevice');
  let devices = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  } catch { /* sin permisos todavía */ }
  sel.innerHTML = '';
  const def = new Option('Predeterminado del sistema', '');
  sel.add(def);
  devices.forEach((d, i) => sel.add(new Option(d.label || `Micrófono ${i + 1}`, d.deviceId)));
  sel.value = devices.some((d) => d.deviceId === S.deviceId) ? S.deviceId : '';
}

function readLevel() {
  if (!audio.analyser) return 0;
  audio.analyser.getFloatTimeDomainData(audio.buf);
  let sum = 0;
  for (let i = 0; i < audio.buf.length; i++) sum += audio.buf[i] * audio.buf[i];
  const rms = Math.sqrt(sum / audio.buf.length);
  const db = 20 * Math.log10(rms + 1e-8) + S.gainDb;
  return clamp((db + 60) / 60, 0, 1); // -60 dB → 0, 0 dB → 1
}


function calibrate() {
  const btn = $('#btnCalibrate');
  if (calib) return;
  calib = { max: 0 };
  btn.disabled = true;
  let n = 3;
  btn.textContent = `Silencio… ${n}`;
  const t = setInterval(() => {
    n -= 1;
    if (n > 0) { btn.textContent = `Silencio… ${n}`; return; }
    clearInterval(t);
    const noise = calib.max;
    calib = null;
    S.talkThreshold = clamp(Math.round((noise + 0.1) * 100) / 100, 0.12, 0.9);
    S.shoutThreshold = clamp(Math.max(S.shoutThreshold, S.talkThreshold + 0.25), S.talkThreshold + 0.05, 1);
    syncers.forEach((s) => s.sync());
    scheduleSave();
    btn.disabled = false;
    btn.textContent = 'Calibrar';
    toast(`Listo: umbral para hablar en ${pct(S.talkThreshold)}`);
  }, 1000);
}
