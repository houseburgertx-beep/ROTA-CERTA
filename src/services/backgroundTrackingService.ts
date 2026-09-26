/**
 * Serviço de Rastreamento GPS em Segundo Plano (Tela Ligada / Desligada)
 * Utiliza Silent Audio Heartbeat + MediaSession + WakeLock para garantir que
 * celulares Android e iOS continuem transmitindo coordenadas mesmo com a tela
 * bloqueada no bolso do motoboy.
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
let wakeLockSentinel: any = null;
let silentAudioElement: HTMLAudioElement | null = null;
let silentBlobUrl: string | null = null;
let lastSentTime = 0;
let lastPosition: TrackingPosition | null = null;
const listeners = new Set<(pos: TrackingPosition) => void>();

/**
 * Cria um buffer WAV silencioso (inaudível) em memória para manter a sessão de áudio viva
 */
function createSilentWavBlob(): Blob {
  const sampleRate = 8000;
  const numSamples = sampleRate * 2; // 2 segundos de silêncio
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

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Inicia o áudio silencioso em loop contínuo e configura a MediaSession para a tela de bloqueio
 */
async function startSilentHeartbeat(driverName = "Motoboy"): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if (!silentBlobUrl) {
      const blob = createSilentWavBlob();
      silentBlobUrl = URL.createObjectURL(blob);
    }

    if (!silentAudioElement) {
      silentAudioElement = new Audio(silentBlobUrl);
      silentAudioElement.loop = true;
      // Volume mínimo não zero para garantir que o iOS Safari não descarte a sessão
      silentAudioElement.volume = 0.001;
      silentAudioElement.setAttribute("playsinline", "true");
      silentAudioElement.setAttribute("webkit-playsinline", "true");
    }

    await silentAudioElement.play().catch(() => {});

    // Configura a tela de bloqueio nativa do Android / iOS
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: "Rastreamento GPS Ativo 🛵",
        artist: `${driverName} (House Burger)`,
        album: "Em Serviço • Sinal transmitindo em tempo real",
      });
      navigator.mediaSession.playbackState = "playing";
    }
  } catch (err) {
    console.warn("Silent audio heartbeat não pôde ser iniciado:", err);
  }
}

/**
 * Solicita WakeLock para impedir que a tela apague no suporte da moto
 */
async function requestWakeLock(): Promise<void> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    wakeLockSentinel = await (navigator as any).wakeLock.request("screen");
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
    return Math.round(battery.level * 100);
  } catch {
    return null;
  }
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
  await startSilentHeartbeat(config.driverName);

  // 2. Tenta manter a tela acesa no suporte
  await requestWakeLock();

  // 3. Cancela watcher anterior se houver
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  const minInterval = config.minIntervalMs || 4000;

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      // Converte velocidade de m/s para km/h
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

      // Dispara para listeners internos (mapa, HUD)
      listeners.forEach((fn) => fn(trackingPos));

      // Envia para o Firebase RTDB se atingiu o intervalo mínimo
      const now = Date.now();
      if (now - lastSentTime >= minInterval) {
        lastSentTime = now;

        const telemetry: DriverTelemetryUpdate = {
          latitude: trackingPos.latitude,
          longitude: trackingPos.longitude,
          speed: trackingPos.speed,
          heading: trackingPos.heading,
          accuracy: trackingPos.accuracy,
          batteryLevel: trackingPos.batteryLevel,
          activeDeliveryId: activeConfig?.activeDeliveryId,
          activeOrderNumber: activeConfig?.activeOrderNumber,
          statusText: activeConfig?.statusText || (activeConfig?.activeDeliveryId ? "Em rota de entrega" : "Livre na Loja"),
        };

        void updateDriverGpsLocationRTDB(
          activeConfig!.driverId,
          telemetry,
          activeConfig?.activeDeliveryId,
        );
      }
    },
    (err) => {
      console.warn("Aviso de GPS background:", err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000,
    },
  );

  return true;
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
}

export function isBackgroundTrackingActive(): boolean {
  return watchId !== null;
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
