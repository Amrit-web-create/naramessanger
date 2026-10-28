let stopHandle: (() => void) | null = null;

export function stopSound() {
  stopHandle?.();
  stopHandle = null;
}

export async function playSrc(src: string) {
  stopSound();
  const audio = new Audio(src);
  stopHandle = () => {
    audio.pause();
    audio.src = "";
  };
  await audio.play();
}

export function playTone(ms: number) {
  stopSound();
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const seconds = Math.max(0.4, ms / 1000);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(392, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(494, ctx.currentTime + seconds);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + seconds);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
    void ctx.close();
  };
  stopHandle = close;
  osc.onended = close;
}

let ringStop: (() => void) | null = null;

export function startRing() {
  stopRing();
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    const pulse = window.setInterval(() => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.03, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    }, 1200);
    ringStop = () => {
      window.clearInterval(pulse);
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      void ctx.close();
    };
  } catch {
    ringStop = null;
  }
}

export function stopRing() {
  ringStop?.();
  ringStop = null;
}
