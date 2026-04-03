/**
 * Gacha sound effects using Web Audio API
 * No external dependencies — all synthesized
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", gainVal = 0.3, fadeOut = true) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(gainVal, c.currentTime);
  if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

/** Button click */
export function soundClick() {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = "square";
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.05);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.08);
}

/** Energy charging up — rising sweep */
export function soundCharge(duration = 1.0) {
  const c = getCtx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  const dist = c.createWaveShaper();

  // Distortion for gritty charge feel
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
  }
  dist.curve = curve;

  osc.connect(dist);
  dist.connect(gain);
  gain.connect(c.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(60, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, c.currentTime + duration);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.linearRampToValueAtTime(0.25, c.currentTime + duration * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + duration);
}

/** Flash explosion */
export function soundExplosion() {
  const c = getCtx();

  // White noise burst
  const bufferSize = c.sampleRate * 0.3;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = c.createBufferSource();
  source.buffer = buffer;

  const gain = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2000, c.currentTime);
  filter.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.3);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0.8, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
  source.start(c.currentTime);
  source.stop(c.currentTime + 0.3);

  // Low boom
  playTone(60, 0.4, "sine", 0.5, true);
  playTone(40, 0.6, "sine", 0.4, true);
}

/** Card reveal shimmer */
export function soundReveal(rare = false) {
  const c = getCtx();
  const notes = rare
    ? [523, 659, 784, 1047, 1319] // C5 E5 G5 C6 E6
    : [440, 523, 659, 784];        // A4 C5 E5 G5

  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, "sine", 0.2, true), i * 60);
  });

  // Sparkle high freq
  setTimeout(() => {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => playTone(2000 + Math.random() * 2000, 0.1, "sine", 0.08, true), i * 30);
    }
  }, 100);
}

/** Epic fanfare for rare/epic pulls */
export function soundEpicFanfare() {
  const c = getCtx();
  const melody = [
    { freq: 523, time: 0, dur: 0.15 },
    { freq: 659, time: 0.15, dur: 0.15 },
    { freq: 784, time: 0.3, dur: 0.15 },
    { freq: 1047, time: 0.45, dur: 0.4 },
    { freq: 1319, time: 0.85, dur: 0.5 },
  ];
  melody.forEach(({ freq, time, dur }) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, c.currentTime + time);
    gain.gain.setValueAtTime(0, c.currentTime + time);
    gain.gain.linearRampToValueAtTime(0.3, c.currentTime + time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + time + dur);
    osc.start(c.currentTime + time);
    osc.stop(c.currentTime + time + dur + 0.1);
  });
}
