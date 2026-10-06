/**
 * Sonido de Ember. Todo es procedural (Web Audio): sin archivos, sin licencias de terceros,
 * sin conexión necesaria. Incluye sonidos de interfaz sutiles y ambientes para Focus.
 */

export type AmbientKind = 'none' | 'rain' | 'cafe' | 'forest' | 'ocean' | 'brown' | 'white' | 'space' | 'lofi';
export const AMBIENT_KINDS: AmbientKind[] = ['none', 'rain', 'ocean', 'forest', 'cafe', 'brown', 'white', 'space', 'lofi'];

let ctx: AudioContext | null = null;
let uiEnabled = true;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setUiSoundsEnabled(on: boolean) {
  uiEnabled = on;
}

const noiseCache = new Map<string, AudioBuffer>();

function noiseBuffer(kind: 'white' | 'pink' | 'brown', seconds = 4): AudioBuffer {
  const key = `${kind}:${seconds}`;
  const cached = noiseCache.get(key);
  if (cached) return cached;
  const c = audio();
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let last = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'white') data[i] = white * 0.5;
      else if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    // Suaviza el punto de bucle para evitar clics.
    const fade = Math.min(2000, len / 10);
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      data[i] *= g;
      data[len - 1 - i] *= g;
    }
  }
  noiseCache.set(key, buf);
  return buf;
}

// ── Sonidos de interfaz ────────────────────────────────────────────────────────────────

function tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

export function playUiSound(kind: 'complete' | 'habit' | 'focusDone' | 'start' | 'break') {
  if (!uiEnabled) return;
  try {
    const c = audio();
    const now = c.currentTime + 0.01;
    switch (kind) {
      case 'complete':
        tone(784, now, 0.18, 0.05);
        tone(1175, now + 0.06, 0.28, 0.04);
        break;
      case 'habit':
        tone(659 + Math.random() * 120, now, 0.22, 0.045, 'triangle');
        break;
      case 'start':
        tone(440, now, 0.25, 0.03);
        tone(660, now + 0.08, 0.35, 0.03);
        break;
      case 'break':
        tone(587, now, 0.6, 0.04);
        tone(440, now + 0.18, 0.8, 0.035);
        break;
      case 'focusDone':
        tone(523, now, 1.4, 0.05);
        tone(659, now + 0.15, 1.4, 0.045);
        tone(784, now + 0.3, 1.8, 0.045);
        tone(1047, now + 0.45, 2.2, 0.03);
        break;
    }
  } catch {
    /* audio no disponible: se ignora */
  }
}

// ── Ambientes ──────────────────────────────────────────────────────────────────────────

interface Running {
  master: GainNode;
  nodes: AudioNode[];
  timers: ReturnType<typeof setTimeout>[];
  stopped: boolean;
}

let running: Running | null = null;
let currentKind: AmbientKind = 'none';

function loopNoise(kind: 'white' | 'pink' | 'brown', dest: AudioNode, r: Running): AudioBufferSourceNode {
  const c = audio();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(kind, 6);
  src.loop = true;
  src.loopStart = Math.random() * 2;
  src.connect(dest);
  src.start();
  r.nodes.push(src);
  return src;
}

function lfo(freq: number, depth: number, target: AudioParam, r: Running, type: OscillatorType = 'sine') {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = depth;
  o.connect(g).connect(target);
  o.start();
  r.nodes.push(o, g);
}

function filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = audio().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function every(r: Running, min: number, max: number, fn: () => void) {
  const schedule = () => {
    if (r.stopped) return;
    r.timers.push(
      setTimeout(() => {
        if (r.stopped) return;
        fn();
        schedule();
      }, min + Math.random() * (max - min)),
    );
  };
  schedule();
}

function blip(r: Running, freq: number, dur: number, gain: number, dest: AudioNode, sweepTo?: number, type: OscillatorType = 'sine') {
  const c = audio();
  const t0 = c.currentTime + 0.02;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  void r;
}

function noiseBurst(dest: AudioNode, dur: number, gain: number, freq: number) {
  const c = audio();
  const t0 = c.currentTime + 0.01;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer('white', 1);
  const f = filter('bandpass', freq, 3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

function build(kind: AmbientKind, r: Running) {
  const c = audio();
  const out = r.master;
  switch (kind) {
    case 'white': {
      const f = filter('lowpass', 9000);
      f.connect(out);
      loopNoise('white', f, r);
      break;
    }
    case 'brown': {
      const f = filter('lowpass', 900);
      f.connect(out);
      loopNoise('brown', f, r);
      break;
    }
    case 'rain': {
      const hp = filter('highpass', 500);
      const body = filter('lowpass', 7000);
      const g = c.createGain();
      g.gain.value = 0.8;
      hp.connect(body).connect(g).connect(out);
      loopNoise('pink', hp, r);
      lfo(0.13, 0.12, g.gain, r);
      const low = filter('lowpass', 300);
      const lg = c.createGain();
      lg.gain.value = 0.5;
      low.connect(lg).connect(out);
      loopNoise('brown', low, r);
      every(r, 40, 220, () => noiseBurst(out, 0.03 + Math.random() * 0.04, 0.05 + Math.random() * 0.08, 2500 + Math.random() * 4000));
      break;
    }
    case 'ocean': {
      const f = filter('lowpass', 700, 0.5);
      const g = c.createGain();
      g.gain.value = 0.55;
      f.connect(g).connect(out);
      loopNoise('brown', f, r);
      lfo(0.09, 450, f.frequency, r);
      lfo(0.09, 0.4, g.gain, r);
      const foam = filter('bandpass', 2500, 0.4);
      const fg = c.createGain();
      fg.gain.value = 0.07;
      foam.connect(fg).connect(out);
      loopNoise('pink', foam, r);
      lfo(0.09, 0.06, fg.gain, r);
      break;
    }
    case 'forest': {
      const wind = filter('lowpass', 420, 0.6);
      const wg = c.createGain();
      wg.gain.value = 0.45;
      wind.connect(wg).connect(out);
      loopNoise('brown', wind, r);
      lfo(0.05, 160, wind.frequency, r);
      lfo(0.07, 0.2, wg.gain, r);
      const leaves = filter('highpass', 3000);
      const lg = c.createGain();
      lg.gain.value = 0.03;
      leaves.connect(lg).connect(out);
      loopNoise('pink', leaves, r);
      every(r, 1800, 6500, () => {
        const base = 2200 + Math.random() * 2500;
        const n = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          r.timers.push(setTimeout(() => !r.stopped && blip(r, base * (1 + Math.random() * 0.15), 0.09 + Math.random() * 0.08, 0.02, out, base * 1.4), i * (90 + Math.random() * 80)));
        }
      });
      break;
    }
    case 'cafe': {
      const murmur = filter('bandpass', 600, 0.6);
      const mg = c.createGain();
      mg.gain.value = 0.55;
      murmur.connect(mg).connect(out);
      loopNoise('pink', murmur, r);
      lfo(0.31, 0.12, mg.gain, r);
      lfo(0.17, 180, murmur.frequency, r);
      const voices = filter('bandpass', 1200, 1.5);
      const vg = c.createGain();
      vg.gain.value = 0.08;
      voices.connect(vg).connect(out);
      loopNoise('pink', voices, r);
      lfo(0.6, 0.05, vg.gain, r, 'triangle');
      const rumble = filter('lowpass', 160);
      const rg = c.createGain();
      rg.gain.value = 0.25;
      rumble.connect(rg).connect(out);
      loopNoise('brown', rumble, r);
      every(r, 2500, 9000, () => {
        const f = 2400 + Math.random() * 1800;
        blip(r, f, 0.35, 0.012, out);
        blip(r, f * 1.51, 0.25, 0.006, out);
      });
      break;
    }
    case 'space': {
      const lp = filter('lowpass', 900, 0.4);
      const delay = c.createDelay(2);
      delay.delayTime.value = 0.9;
      const fb = c.createGain();
      fb.gain.value = 0.45;
      lp.connect(out);
      lp.connect(delay).connect(fb).connect(delay);
      fb.connect(out);
      r.nodes.push(delay, fb);
      for (const [freq, type, gain] of [
        [55, 'sine', 0.22],
        [82.4, 'triangle', 0.08],
        [110.3, 'sine', 0.1],
        [164.8, 'sine', 0.04],
        [220.6, 'triangle', 0.02],
      ] as [number, OscillatorType, number][]) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = gain;
        o.connect(g).connect(lp);
        o.start();
        r.nodes.push(o, g);
        lfo(0.02 + Math.random() * 0.05, freq * 0.004, o.frequency, r);
        lfo(0.03 + Math.random() * 0.04, gain * 0.5, g.gain, r);
      }
      lfo(0.015, 350, lp.frequency, r);
      const air = filter('bandpass', 3000, 0.8);
      const ag = c.createGain();
      ag.gain.value = 0.015;
      air.connect(ag).connect(out);
      loopNoise('pink', air, r);
      break;
    }
    case 'lofi': {
      // Progresión Fmaj7 – Em7 – Dm7 – Cmaj7 a 72 BPM con piano suave y crujido de vinilo.
      const chords = [
        [53, 57, 60, 64],
        [52, 55, 59, 62],
        [50, 53, 57, 60],
        [48, 52, 55, 59],
      ];
      const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
      const warm = filter('lowpass', 1400, 0.5);
      const wg = c.createGain();
      wg.gain.value = 0.7;
      warm.connect(wg).connect(out);
      const beat = 60 / 72;
      let step = 0;
      const playBar = () => {
        if (r.stopped) return;
        const chord = chords[step % chords.length];
        const t0 = c.currentTime + 0.05;
        chord.forEach((n, i) => {
          for (const at of [0, beat * 2.5]) {
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = i === 0 ? 'triangle' : 'sine';
            o.frequency.value = midi(n + (i === 0 ? -12 : 0));
            const start = t0 + at + i * 0.012;
            g.gain.setValueAtTime(0.0001, start);
            g.gain.exponentialRampToValueAtTime(i === 0 ? 0.07 : 0.035, start + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, start + beat * 2.4);
            o.connect(g).connect(warm);
            o.start(start);
            o.stop(start + beat * 2.6);
          }
        });
        for (let b = 0; b < 4; b++) {
          const kt = t0 + b * beat;
          if (b % 2 === 0) {
            const k = c.createOscillator();
            const kg = c.createGain();
            k.frequency.setValueAtTime(110, kt);
            k.frequency.exponentialRampToValueAtTime(45, kt + 0.12);
            kg.gain.setValueAtTime(0.0001, kt);
            kg.gain.exponentialRampToValueAtTime(0.16, kt + 0.005);
            kg.gain.exponentialRampToValueAtTime(0.0001, kt + 0.25);
            k.connect(kg).connect(out);
            k.start(kt);
            k.stop(kt + 0.3);
          }
          r.timers.push(setTimeout(() => !r.stopped && noiseBurst(out, 0.04, 0.025, 7000), (b * beat + beat / 2) * 1000));
        }
        step++;
        r.timers.push(setTimeout(playBar, beat * 4 * 1000));
      };
      playBar();
      const crackle = filter('highpass', 1500);
      const cg = c.createGain();
      cg.gain.value = 0.012;
      crackle.connect(cg).connect(out);
      loopNoise('pink', crackle, r);
      every(r, 60, 400, () => noiseBurst(out, 0.006, 0.03 + Math.random() * 0.05, 3000 + Math.random() * 3000));
      break;
    }
    case 'none':
      break;
  }
}

export function playAmbient(kind: AmbientKind, volume: number) {
  if (kind === currentKind && running) {
    setAmbientVolume(volume);
    return;
  }
  stopAmbient();
  currentKind = kind;
  if (kind === 'none') return;
  try {
    const c = audio();
    const master = c.createGain();
    master.gain.setValueAtTime(0.0001, c.currentTime);
    master.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.6), c.currentTime + 1.6);
    master.connect(c.destination);
    running = { master, nodes: [], timers: [], stopped: false };
    build(kind, running);
  } catch {
    running = null;
  }
}

export function setAmbientVolume(volume: number) {
  if (!running || !ctx) return;
  running.master.gain.setTargetAtTime(Math.max(0.0001, volume * 0.6), ctx.currentTime, 0.15);
}

export function stopAmbient() {
  currentKind = 'none';
  const r = running;
  running = null;
  if (!r || !ctx) return;
  r.stopped = true;
  r.timers.forEach(clearTimeout);
  const c = ctx;
  r.master.gain.setTargetAtTime(0.0001, c.currentTime, 0.35);
  setTimeout(() => {
    for (const n of r.nodes) {
      try {
        if (n instanceof AudioScheduledSourceNode) n.stop();
        n.disconnect();
      } catch {
        /* ya detenido */
      }
    }
    r.master.disconnect();
  }, 1500);
}

export function currentAmbient(): AmbientKind {
  return currentKind;
}
