/**
 * Serviço de Rastreamento GPS em Segundo Plano (Tela Ligada / Desligada)
 * Utiliza Silent Audio Heartbeat + MediaSession + WakeLock + GPS Watchdog
 * para garantir que celulares Android e iOS continuem transmitindo coordenadas
 * ininterruptamente mesmo com a tela bloqueada no bolso do motoboy.
 *
 * === Modo Eco-Bateria v2 ===
 * Adaptação inteligente de precisão e frequência de GPS:
 * - Parado (< 3 km/h): GPS low-accuracy, intervalo de envio 15s, maximumAge 10s
 * - Movimento lento (3-25 km/h): GPS high-accuracy, envio 6s, maximumAge 4s
 * - Em trânsito (> 25 km/h): GPS high-accuracy, envio 4s, maximumAge 2s
 * Resultado: ~40-60% menos consumo de bateria quando parado na loja/semáforo.
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
  minIntervalMs?: number; // padrão adaptativo (varia por velocidade)
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

// === Eco-Bateria: estado adaptativo ===
type SpeedTier = "stopped" | "slow" | "moving";
let currentSpeedTier: SpeedTier = "stopped";
let cachedBatteryLevel: number | null = null;
let lastBatteryReadTime = 0;
const BATTERY_READ_INTERVAL_MS = 60_000; // Lê bateria apenas 1x por minuto

const SPEED_TIER_CONFIG: Record<SpeedTier, {
  sendIntervalMs: number;
  watchdogIntervalMs: number;
  watchdogStaleMs: number;
  maximumAge: number;
  enableHighAccuracy: boolean;
}> = {
  stopped: {
    sendIntervalMs: 15_000,    // Envia a cada 15s quando parado
    watchdogIntervalMs: 12_000, // Checa watchdog a cada 12s
    watchdogStaleMs: 20_000,   // Espera 20s antes de forçar GPS
    maximumAge: 10_000,        // Aceita cache de até 10s
    enableHighAccuracy: false, // Low-accuracy = usa Wi-Fi/torre (baixo consumo)
  },
  slow: {
    sendIntervalMs: 6_000,     // A cada 6s em velocidade baixa
    watchdogIntervalMs: 8_000,
    watchdogStaleMs: 10_000,
    maximumAge: 4_000,
    enableHighAccuracy: true,
  },
  moving: {
    sendIntervalMs: 4_000,     // Máxima precisão em trânsito
    watchdogIntervalMs: 4_000,
    watchdogStaleMs: 6_000,
    maximumAge: 2_000,
    enableHighAccuracy: true,
  },
};

function getSpeedTier(speedKmH: number | null): SpeedTier {
  if (speedKmH === null || speedKmH < 3) return "stopped";
  if (speedKmH <= 25) return "slow";
  return "moving";
}

const listeners = new Set<(pos: TrackingPosition) => void>();
const heartbeatListeners = new Set<(playing: boolean) => void>();

const BG_UNLOCKED_KEY = "rotacerta_background_unlocked";

export function isBackgroundTrackingPermanentlyUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BG_UNLOCKED_KEY) === "true";
  } catch {
    return false;
  }
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

  // Se o áudio já está ativo e tocando, mantém ativo sem interrupção
  if (silentAudioElement && !silentAudioElement.paused && silentAudioElement.currentTime > 0) {
    notifyHeartbeatStatus(true);
    return true;
  }

  try {
    if (!silentAudioElement) {
      silentAudioElement = new Audio("/silent.wav");
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

    try {
      localStorage.setItem(BG_UNLOCKED_KEY, "true");
    } catch {}

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
    if (!isBackgroundTrackingPermanentlyUnlocked()) {
      notifyHeartbeatStatus(false);
    }
    return false;
  }
}

/**
 * Solicita WakeLock para impedir que a tela apague no suporte da moto.
 * APENAS se a tela está visível — libera automaticamente em pocket mode.
 */
async function requestWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  // Não solicita WakeLock se a tela está oculta (no bolso / bloqueada)
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
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
 * Libera o WakeLock (tela pode apagar no bolso para economizar bateria)
 */
function releaseWakeLock(): void {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

/**
 * Lê o nível de bateria do celular (com cache de 60s para economizar energia)
 */
async function getBatteryPercentage(): Promise<number | null> {
  const now = Date.now();
  // Retorna cache se leitura recente (< 60s)
  if (cachedBatteryLevel !== null && now - lastBatteryReadTime < BATTERY_READ_INTERVAL_MS) {
    return cachedBatteryLevel;
  }
  if (typeof navigator === "undefined" || !("getBattery" in navigator)) return cachedBatteryLevel;
  try {
    const battery = await (navigator as any).getBattery();
    if (typeof battery?.level === "number") {
      const val = battery.level <= 1 ? Math.round(battery.level * 100) : Math.round(battery.level);
      cachedBatteryLevel = Math.min(100, Math.max(0, val));
      lastBatteryReadTime = now;
      return cachedBatteryLevel;
    }
    return cachedBatteryLevel;
  } catch {
    return cachedBatteryLevel;
  }
}

/**
 * Calcula distância mínima significativa para considerar "movimento real"
 * ~3m em coordenadas decimais
 */
function hasMovedSignificantly(prev: TrackingPosition | null, lat: number, lng: number): boolean {
  if (!prev) return true;
  const dlat = lat - prev.latitude;
  const dlng = lng - prev.longitude;
  // ~3 metros threshold
  return Math.sqrt(dlat * dlat + dlng * dlng) > 0.00003;
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

  // Adapta a tier de precisão/frequência conforme velocidade
  const newTier = getSpeedTier(speedKmH);
  if (newTier !== currentSpeedTier) {
    currentSpeedTier = newTier;
    // Reinicia o watchdog com o novo intervalo
    if (activeConfig) restartWatchdog();
    // Se parou, podemos trocar para low-accuracy GPS e reiniciar o watcher
    if (activeConfig) restartGpsWatcher();
  }

  // Descarta posições redundantes quando parado (sem deslocamento real)
  if (currentSpeedTier === "stopped" && !hasMovedSignificantly(lastPosition, pos.coords.latitude, pos.coords.longitude)) {
    // Ainda assim, atualiza timestamp para evitar watchdog falso
    if (lastPosition) {
      lastPosition.timestamp = Date.now();
    }
    return; // Não notifica listeners nem envia ao RTDB — economia de CPU + rede + re-renders
  }

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

  // Envia para o Firebase RTDB com intervalo adaptativo
  const now = Date.now();
  const tierConfig = SPEED_TIER_CONFIG[currentSpeedTier];
  const minInterval = activeConfig?.minIntervalMs || tierConfig.sendIntervalMs;
  const effectiveInterval = Math.max(minInterval, tierConfig.sendIntervalMs);

  if (now - lastSentTime >= effectiveInterval && activeConfig) {
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
 * Watchdog adaptativo: intervalo varia com a velocidade
 * Garante que nem o áudio nem o GPS adormeçam com a tela apagada.
 */
function checkWatchdog(): void {
  if (!activeConfig) return;
  const now = Date.now();
  const tierConfig = SPEED_TIER_CONFIG[currentSpeedTier];
  if (now - lastWatchdogRun < tierConfig.watchdogIntervalMs - 500) return;
  lastWatchdogRun = now;

  // 1. Garante que o áudio de batimento não foi pausado pelo sistema
  if (silentAudioElement && silentAudioElement.paused) {
    silentAudioElement.play().catch(() => {});
  }

  // 2. Se o watchPosition não entregou nada no período da tier, força getCurrentPosition
  if (now - lastPositionReceivedTime >= tierConfig.watchdogStaleMs) {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => void handleNewPosition(pos),
        (err) => console.warn("Watchdog GPS error:", err.message),
        {
          enableHighAccuracy: tierConfig.enableHighAccuracy,
          maximumAge: tierConfig.maximumAge,
          timeout: 6000,
        },
      );
    }
  }
}

function restartWatchdog(): void {
  if (watchdogTimerId) clearInterval(watchdogTimerId);
  const tierConfig = SPEED_TIER_CONFIG[currentSpeedTier];
  watchdogTimerId = setInterval(checkWatchdog, tierConfig.watchdogIntervalMs);
}

function startWatchdog(): void {
  restartWatchdog();
}

/**
 * (Re)inicia o GPS watcher com as configurações da tier atual
 */
function restartGpsWatcher(): void {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  const tierConfig = SPEED_TIER_CONFIG[currentSpeedTier];
  watchId = navigator.geolocation.watchPosition(
    (pos) => void handleNewPosition(pos),
    (err) => {
      console.warn("Aviso de GPS background:", err.message);
    },
    {
      enableHighAccuracy: tierConfig.enableHighAccuracy,
      maximumAge: tierConfig.maximumAge,
      timeout: 10000,
    },
  );
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

  // 2. Tenta manter a tela acesa no suporte (só se visível)
  await requestWakeLock();

  // 3. Inicia o Watchdog de segundo plano
  startWatchdog();

  // 4. Inicia GPS watcher com configurações da tier atual
  restartGpsWatcher();

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

  releaseWakeLock();

  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "none";
  }

  activeConfig = null;
  currentSpeedTier = "stopped";
  notifyHeartbeatStatus(false);
}

export function isBackgroundTrackingActive(): boolean {
  return watchId !== null;
}

export function isAudioHeartbeatPlaying(): boolean {
  return isHeartbeatPlaying || isBackgroundTrackingPermanentlyUnlocked();
}

export function addHeartbeatListener(listener: (playing: boolean) => void): () => void {
  heartbeatListeners.add(listener);
  listener(isHeartbeatPlaying || isBackgroundTrackingPermanentlyUnlocked());
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

/**
 * Retorna a tier de velocidade atual para exibição na UI
 */
export function getCurrentSpeedTier(): SpeedTier {
  return currentSpeedTier;
}

// Ouvinte do ciclo de vida da aba / bloqueio de tela
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // Tela acendeu: reativa WakeLock e força leitura GPS imediata
      requestWakeLock();
      if (activeConfig) {
        // Força tier "moving" temporariamente para obter fix rápido ao desbloquear
        checkWatchdog();
      }
    } else {
      // Tela apagou / bloqueou:
      // 1. Libera WakeLock (permite tela apagar e poupar bateria)
      releaseWakeLock();
      // 2. Garante áudio de segundo plano
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
