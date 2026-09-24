// =============================================================
// SERVIÇO DE ÁUDIO E NOTIFICAÇÃO ESTILO IFOOD (TURURU CHIME)
// Suporta 100% Mobile (iOS Safari / Android Chrome / PWA / Web)
// =============================================================

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Gera o arquivo WAV do som característico do iFood em memória
function createIfoodWavBlob(): Blob {
  const sampleRate = 44100;
  const totalDuration = 1.35;
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  // RIFF Chunk
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeString(view, 8, "WAVE");

  // Format Chunk (PCM 16-bit Mono 44100Hz)
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // Data Chunk
  writeString(view, 36, "data");
  view.setUint32(40, totalSamples * 2, true);

  // Notas da melodia clássica e alegre de novo pedido do iFood:
  // Toque 1: G5 (784Hz) -> B5 (988Hz) -> D6 (1175Hz) -> G6 (1568Hz)
  // Toque 2: Repetição com eco brilhante
  const notes = [
    { freq: 783.99, start: 0.00, dur: 0.09 },
    { freq: 987.77, start: 0.09, dur: 0.09 },
    { freq: 1174.66, start: 0.18, dur: 0.09 },
    { freq: 1567.98, start: 0.27, dur: 0.32 },

    { freq: 783.99, start: 0.52, dur: 0.09 },
    { freq: 987.77, start: 0.61, dur: 0.09 },
    { freq: 1174.66, start: 0.70, dur: 0.09 },
    { freq: 1567.98, start: 0.79, dur: 0.48 },
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;
    for (const n of notes) {
      if (t >= n.start && t < n.start + n.dur) {
        const elapsed = t - n.start;
        const attack = Math.min(1, elapsed / 0.006);
        const decay = Math.exp(-elapsed * (n.dur > 0.25 ? 5.5 : 12));
        const env = attack * decay;
        // Ressonância estilo marimba/carrilhão
        const wave =
          Math.sin(2 * Math.PI * n.freq * elapsed) * 0.6 +
          Math.sin(2 * Math.PI * (n.freq * 2) * elapsed) * 0.25 +
          Math.sin(2 * Math.PI * (n.freq * 3) * elapsed) * 0.15;
        sampleVal += wave * env;
      }
    }
    sampleVal = Math.max(-1, Math.min(1, sampleVal * 0.95));
    view.setInt16(44 + i * 2, Math.floor(sampleVal * 32767), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// Instância singleton do elemento de áudio
let cachedAudioElement: HTMLAudioElement | null = null;
let cachedBlobUrl: string | null = null;
let isAudioUnlocked = false;

function getAudioElement(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!cachedAudioElement) {
    try {
      if (!cachedBlobUrl) {
        const blob = createIfoodWavBlob();
        cachedBlobUrl = URL.createObjectURL(blob);
      }
      cachedAudioElement = new Audio(cachedBlobUrl);
      cachedAudioElement.preload = "auto";
      cachedAudioElement.volume = 1.0;
    } catch (e) {
      console.warn("Erro ao instanciar áudio:", e);
    }
  }
  return cachedAudioElement;
}

// Desbloqueia o pipeline de áudio no primeiro toque do usuário no celular (necessário para iOS Safari)
export function unlockAudioOnFirstGesture(): void {
  if (typeof window === "undefined" || isAudioUnlocked) return;

  const unlock = () => {
    isAudioUnlocked = true;
    const audio = getAudioElement();
    if (audio) {
      // Toca um instante mudo para liberar o canal no iOS
      audio.volume = 0.01;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1.0;
        })
        .catch(() => {});
    }

    // Também ativa o AudioContext
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === "suspended") {
          void ctx.resume();
        }
      }
    } catch {}

    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("click", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("click", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
}

// Dispara o som clássico do iFood e vibração tátil
export function playIfoodNotificationSound(): Promise<boolean> {
  return new Promise((resolve) => {
    // 1. Vibração háptica típica do iFood (duplo toque vibratório)
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([180, 80, 220]);
      }
    } catch {}

    // 2. Tenta tocar através do elemento HTML5 Audio nativo (mais confiável no mobile)
    const audio = getAudioElement();
    if (audio) {
      audio.volume = 1.0;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            resolve(true);
          })
          .catch((err) => {
            console.warn("HTML5 audio bloqueado, tentando AudioContext fallback:", err);
            // 3. Fallback: Web Audio API Oscillator
            playWebAudioFallback();
            resolve(false);
          });
        return;
      }
    }

    // Se HTMLAudio não disponível, usa Web Audio
    playWebAudioFallback();
    resolve(true);
  });
}

function playWebAudioFallback(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 783.99, time: 0.00, dur: 0.09 },
      { freq: 987.77, time: 0.09, dur: 0.09 },
      { freq: 1174.66, time: 0.18, dur: 0.09 },
      { freq: 1567.98, time: 0.27, dur: 0.32 },
      { freq: 783.99, time: 0.52, dur: 0.09 },
      { freq: 987.77, time: 0.61, dur: 0.09 },
      { freq: 1174.66, time: 0.70, dur: 0.09 },
      { freq: 1567.98, time: 0.79, dur: 0.48 },
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0.001, now + time);
      gain.gain.exponentialRampToValueAtTime(0.8, now + time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + dur);
    });
  } catch (e) {
    console.warn("Erro no Web Audio fallback:", e);
  }
}
