/**
 * Serviço de Rastreamento GPS em Segundo Plano (Tela Ligada / Desligada)
 * Utiliza Silent Audio Heartbeat + MediaSession + WakeLock + GPS Watchdog
 * para garantir que celulares Android e iOS continuem transmitindo coordenadas
 * ininterruptamente mesmo com a tela bloqueada no bolso do motoboy.
 */

import { updateDriverGpsLocationRTDB, type DriverTelemetryUpdate } from "./realtimeDbService";

export interface TrackingPosition {
  latitude: number;
  longitude: number;
  speed: number | null; // km/h
  heading: number | null;
  accuracy: number | null;
  batteryLevel: number | null;
  timestamp: number;
}

export interface BackgroundTrackingConfig {
  driverId: string;
  driverName?: string;
  activeDeliveryId?: string;
  activeOrderNumber?: string;
  statusText?: string;
  minIntervalMs?: number; // padrão 4000ms
}

let activeConfig: BackgroundTrackingConfig | null = null;
let watchId: number | null = null;
let watchdogTimerId: any = null;
let wakeLockSentinel: any = null;
let silentAudioElement: HTMLAudioElement | null = null;
let silentBlobUrl: string | null = null;
let lastSentTime = 0;
let lastPositionReceivedTime = 0;
let lastPosition: TrackingPosition | null = null;
let isHeartbeatPlaying = false;

const listeners = new Set<(pos: TrackingPosition) => void>();
const heartbeatListeners = new Set<(playing: boolean) => void>();

/**
 * Cria um buffer WAV inaudível em memória com dither (-90dB)
 * O sinal PCM muito baixo garante que o DSP de áudio do iOS e Android não desligue
 * a placa de som por economia de energia, mantendo o processo do navegador ativo.
 */
function createSilentWavBlob(): Blob {
  const sampleRate = 8000;
  const numSamples = sampleRate * 4; // 4 segundos de áudio
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // RIFF Chunk
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // Format Chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // Data Chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, numSamples * 2, true);

  // Dither inaudível (amplitude 1 em 32767) para enganar o algoritmo de suspensão do iOS
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function notifyHeartbeatStatus(playing: boolean) {
  isHeartbeatPlaying = playing;
  heartbeatListeners.forEach((fn) => fn(playing));
}

/**
 * Inicia o áudio silencioso em loop contínuo e configura a MediaSession para a tela de bloqueio
 */
async function startSilentHeartbeat(driverName = "Motoboy"): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    if (!silentBlobUrl) {
      const blob = createSilentWavBlob();
      silentBlobUrl = URL.createObjectURL(blob);
    }

    if (!silentAudioElement) {
      silentAudioElement = new Audio(silentBlobUrl);
      silentAudioElement.loop = true;
      silentAudioElement.volume = 0.01;
      silentAudioElement.setAttribute("playsinline", "true");
      silentAudioElement.setAttribute("webkit-playsinline", "true");
      silentAudioElement.setAttribute("x-webkit-airplay", "deny");

      silentAudioElement.addEventListener("play", () => notifyHeartbeatStatus(true));
      silentAudioElement.addEventListener("playing", () => notifyHeartbeatStatus(true));
      silentAudioElement.addEventListener("timeupdate", () => {
        checkWatchdog();
      });
      silentAudioElement.addEventListener("pause", () => {
        if (activeConfig) {
          silentAudioElement?.play().catch(() => {});
        } else {
          notifyHeartbeatStatus(false);
        }
      });
      silentAudioElement.addEventListener("ended", () => {
        if (activeConfig) silentAudioElement?.play().catch(() => {});
      });
    }

    await silentAudioElement.play();

    // Configura a tela de bloqueio nativa do Android / iOS
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: "Rastreamento GPS Ativo 🛵",
        artist: `${driverName} (House Burger)`,
        album: "Sinal transmitindo para a loja em segundo plano",
        artwork: [
          { src: "/favicon.svg", sizes: "96x96", type: "image/svg+xml" },
          { src: "/favicon.svg", sizes: "192x192", type: "image/svg+xml" },
        ],
      });
      navigator.mediaSession.playbackState = "playing";

      // Handlers obrigatórios para iOS/Android manterem a aba em background ativa
      navigator.mediaSession.setActionHandler("play", () => {
        silentAudioElement?.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        // Auto-reativa para evitar pausas acidentais por fones de ouvido ou controles de carro
        silentAudioElement?.play().catch(() => {});
        navigator.mediaSession.playbackState = "playing";
      });
    }

    notifyHeartbeatStatus(true);
    return true;
  } catch (err) {
    console.warn("Silent audio aguardando interação do usuário:", err);
    notifyHeartbeatStatus(false);
    return false;
  }
}

/**
 * Solicita WakeLock para impedir que a tela apague no suporte da moto
 */
async function requestWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
    wakeLockSentinel.addEventListener?.("release", () => {
      wakeLockSentinel = null;
    });
  } catch (err) {
    console.warn("WakeLock não suportado ou bloqueado:", err);
  }
}

/**
 * Lê o nível de bateria do celular (se suportado pelo navegador)
 */
async function getBatteryPercentage(): Promise<number | null> {
  if (typeof navigator === "undefined" || !("getBattery" in navigator)) return null;
  try {
    const battery = await (navigator as any).getBattery();
    if (typeof battery?.level === "number") {
      const val = battery.level <= 1 ? Math.round(battery.level * 100) : Math.round(battery.level);
      return Math.min(100, Math.max(0, val));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Processa uma coordenada obtida pelo watchPosition ou pelo Watchdog Timer
 */
async function handleNewPosition(pos: GeolocationPosition): Promise<void> {
  lastPositionReceivedTime = Date.now();

  const speedKmH =
    pos.coords.speed !== null && typeof pos.coords.speed === "number" && pos.coords.speed >= 0
      ? Math.round(pos.coords.speed * 3.6)
      : null;

  const battery = await getBatteryPercentage();

  const trackingPos: TrackingPosition = {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    speed: speedKmH,
    heading: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? Math.round(pos.coords.heading) : null,
    accuracy: Math.round(pos.coords.accuracy),
    batteryLevel: battery,
    timestamp: Date.now(),
  };

  lastPosition = trackingPos;

  // Notifica ouvintes locais na tela
  listeners.forEach((fn) => fn(trackingPos));

  // Envia para o Firebase RTDB se atingiu o intervalo mínimo
  const now = Date.now();
  const minInterval = activeConfig?.minIntervalMs || 4000;
  if (now - lastSentTime >= minInterval && activeConfig) {
    lastSentTime = now;

    const telemetry: DriverTelemetryUpdate = {
      latitude: trackingPos.latitude,
      longitude: trackingPos.longitude,
      speed: trackingPos.speed,
      heading: trackingPos.heading,
      accuracy: trackingPos.accuracy,
      batteryLevel: trackingPos.batteryLevel,
      activeDeliveryId: activeConfig.activeDeliveryId,
      activeOrderNumber: activeConfig.activeOrderNumber,
      statusText: activeConfig.statusText || (activeConfig.activeDeliveryId ? "Em rota de entrega" : "Livre na Loja"),
    };

    void updateDriverGpsLocationRTDB(
      activeConfig.driverId,
      telemetry,
      activeConfig.activeDeliveryId,
    );
  }
}

let lastWatchdogRun = 0;

/**
 * Watchdog contínuo: executa a cada 4s (ou a cada timeupdate do áudio)
 * para garantir que nem o áudio nem o GPS adormeçam com a tela apagada.
 */
function checkWatchdog(): void {
  if (!activeConfig) return;
  const now = Date.now();
  if (now - lastWatchdogRun < 3500) return;
  lastWatchdogRun = now;

  // 1. Garante que o áudio de batimento não foi pausado pelo sistema
  if (silentAudioElement && silentAudioElement.paused) {
    silentAudioElement.play().catch(() => {});
  }

  // 2. Se o watchPosition não entregou nada nos últimos 6s, força getCurrentPosition
  if (now - lastPositionReceivedTime >= 6000) {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => void handleNewPosition(pos),
        (err) => console.warn("Watchdog GPS error:", err.message),
        {
          enableHighAccuracy: true,
          maximumAge: 3000,
          timeout: 6000,
        },
      );
    }
  }
}

function startWatchdog(): void {
  if (watchdogTimerId) clearInterval(watchdogTimerId);
  watchdogTimerId = setInterval(checkWatchdog, 4000);
}

/**
 * Inicia o rastreamento contínuo com tela ligada ou desligada
 */
export async function startBackgroundTracking(config: BackgroundTrackingConfig): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    console.warn("Geolocalização não suportada no aparelho.");
    return false;
  }

  activeConfig = config;

  // 1. Inicia o canal de áudio silencioso (mantém o processo vivo na tela de bloqueio)
  const audioPlaying = await startSilentHeartbeat(config.driverName);

  // 2. Tenta manter a tela acesa no suporte
  await requestWakeLock();

  // 3. Inicia o Watchdog de segundo plano
  startWatchdog();

  // 4. Cancela watcher anterior se houver
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  watchId = navigator.geolocation.watchPosition(
    (pos) => void handleNewPosition(pos),
    (err) => {
      console.warn("Aviso de GPS background:", err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    },
  );

  // Leitura imediata para telemetria instantânea
  navigator.geolocation.getCurrentPosition(
    (pos) => void handleNewPosition(pos),
    () => {},
    { enableHighAccuracy: true, timeout: 5000 },
  );

  return audioPlaying;
}

/**
 * Ativa o modo segundo plano por gesto explícito do usuário (toque no botão)
 * Essencial para satisfazer a política de autoplay do iOS Safari e Android Chrome
 */
export async function unlockAndStartBackgroundTracking(driverName = "Motoboy"): Promise<boolean> {
  const ok = await startSilentHeartbeat(driverName);
  await requestWakeLock();
  if (activeConfig) {
    startWatchdog();
    checkWatchdog();
  }
  if (ok && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([80, 40, 80]);
    } catch {}
  }
  return ok;
}

/**
 * Atualiza a configuração em tempo de execução (ex: quando sai para uma entrega específica)
 */
export function updateBackgroundTrackingConfig(updates: Partial<BackgroundTrackingConfig>): void {
  if (activeConfig) {
    activeConfig = { ...activeConfig, ...updates };
  }
}

/**
 * Para o rastreamento em segundo plano e libera recursos
 */
export function stopBackgroundTracking(): void {
  if (typeof navigator !== "undefined" && watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (watchdogTimerId) {
    clearInterval(watchdogTimerId);
    watchdogTimerId = null;
  }

  if (silentAudioElement) {
    silentAudioElement.pause();
  }

  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }

  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "none";
  }

  activeConfig = null;
  notifyHeartbeatStatus(false);
}

export function isBackgroundTrackingActive(): boolean {
  return watchId !== null;
}

export function isAudioHeartbeatPlaying(): boolean {
  return isHeartbeatPlaying;
}

export function addHeartbeatListener(listener: (playing: boolean) => void): () => void {
  heartbeatListeners.add(listener);
  listener(isHeartbeatPlaying);
  return () => {
    heartbeatListeners.delete(listener);
  };
}

export function getLastKnownPosition(): TrackingPosition | null {
  return lastPosition;
}

export function addTrackingListener(listener: (pos: TrackingPosition) => void): () => void {
  listeners.add(listener);
  if (lastPosition) listener(lastPosition);
  return () => {
    listeners.delete(listener);
  };
}

// Ouvinte do ciclo de vida da aba / bloqueio de tela
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      requestWakeLock();
    } else {
      // Quando a tela é bloqueada: garante que o áudio de segundo plano não pausou
      if (activeConfig && silentAudioElement && silentAudioElement.paused) {
        silentAudioElement.play().catch(() => {});
      }
    }
  });

  // Captura o primeiro toque em qualquer lugar do app para desbloquear o áudio no Safari/Android
  const unlockOnFirstTouch = () => {
    if (activeConfig && (!silentAudioElement || silentAudioElement.paused)) {
      void startSilentHeartbeat(activeConfig.driverName);
    }
  };
  window.addEventListener("touchstart", unlockOnFirstTouch, { passive: true });
  window.addEventListener("click", unlockOnFirstTouch, { passive: true });
}
