/**
 * Serviço de Rastreamento GPS e Segundo Plano
 * DESATIVADO A PEDIDO DO USUÁRIO para poupar bateria dos motoboys.
 * Remove watchPosition contínuo, áudio silencioso, wakeLock e envio contínuo ao RTDB.
 */

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
  minIntervalMs?: number;
}

export function isBackgroundTrackingPermanentlyUnlocked(): boolean {
  return false;
}

export function startBackgroundTracking(_config: BackgroundTrackingConfig): Promise<boolean> {
  stopBackgroundTracking();
  return Promise.resolve(false);
}

export function unlockAndStartBackgroundTracking(_driverName?: string): Promise<boolean> {
  stopBackgroundTracking();
  return Promise.resolve(false);
}

export function updateBackgroundTrackingConfig(_updates: Partial<BackgroundTrackingConfig>): void {
  // No-op
}

export function stopBackgroundTracking(): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("rotacerta_background_unlocked");
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
      }
    }
  } catch {}
}

export function isBackgroundTrackingActive(): boolean {
  return false;
}

export function isAudioHeartbeatPlaying(): boolean {
  return false;
}

export function addHeartbeatListener(listener: (playing: boolean) => void): () => void {
  listener(false);
  return () => {};
}

export function getLastKnownPosition(): TrackingPosition | null {
  return null;
}

export function addTrackingListener(_listener: (pos: TrackingPosition) => void): () => void {
  return () => {};
}

export function getCurrentSpeedTier(): "stopped" | "slow" | "moving" {
  return "stopped";
}

// Auto-limpeza preventiva no carregamento
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("rotacerta_background_unlocked");
  } catch {}
}
