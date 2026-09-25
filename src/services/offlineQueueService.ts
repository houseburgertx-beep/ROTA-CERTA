/**
 * Serviço de Fila Offline Blindada para o Rota Certa / House Burger
 * Garante que alterações feitas em áreas de sombra (sem 4G) sejam salvas
 * localmente e sincronizadas automaticamente assim que a conexão voltar.
 */

import {
  saveDeliveryRTDB,
  updateDeliveryRTDB,
  deleteDeliveryRTDB,
  saveDriverRTDB,
  deleteDriverRTDB,
} from "./realtimeDbService";
import type { Delivery, Driver } from "../types";

export interface OfflineAction {
  id: string;
  type: "save_delivery" | "update_delivery" | "delete_delivery" | "save_driver" | "delete_driver";
  payload: any;
  timestamp: number;
  retryCount: number;
}

const OFFLINE_QUEUE_KEY = "rotacerta_offline_queue";

export function isDeviceOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function getOfflineQueue(): OfflineAction[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: OfflineAction[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn("Falha ao salvar fila offline no localStorage:", err);
  }
}

export function enqueueOfflineAction(
  type: OfflineAction["type"],
  payload: any,
): OfflineAction {
  const queue = getOfflineQueue();
  const action: OfflineAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
  };

  // Se já houver uma ação de update para a mesma entrega, podemos fundir ou enfileirar em ordem
  queue.push(action);
  saveOfflineQueue(queue);
  return action;
}

export function removeOfflineAction(id: string): void {
  const queue = getOfflineQueue().filter((a) => a.id !== id);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {}
}

/**
 * Descarrega a fila offline enviando todas as pendências para o Firebase RTDB
 */
export async function flushOfflineQueue(): Promise<{
  success: boolean;
  syncedCount: number;
}> {
  if (!isDeviceOnline()) {
    return { success: false, syncedCount: 0 };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { success: true, syncedCount: 0 };
  }

  let syncedCount = 0;
  const remaining: OfflineAction[] = [];

  for (const action of queue) {
    try {
      switch (action.type) {
        case "save_delivery":
          await saveDeliveryRTDB(action.payload as Delivery);
          break;
        case "update_delivery":
          await updateDeliveryRTDB(action.payload.deliveryId, action.payload.updates);
          break;
        case "delete_delivery":
          await deleteDeliveryRTDB(action.payload as string);
          break;
        case "save_driver":
          await saveDriverRTDB(action.payload as Driver);
          break;
        case "delete_driver":
          await deleteDriverRTDB(action.payload as string);
          break;
      }
      syncedCount++;
    } catch (err) {
      console.warn(`Erro ao sincronizar ação offline ${action.id}:`, err);
      action.retryCount++;
      if (action.retryCount < 5) {
        remaining.push(action);
      }
    }
  }

  saveOfflineQueue(remaining);
  return { success: remaining.length === 0, syncedCount };
}

/**
 * Registra listeners de online/offline e dispara callback quando o estado muda
 */
export function onConnectionChange(
  callback: (online: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    callback(true);
  };

  const handleOffline = () => {
    callback(false);
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}
