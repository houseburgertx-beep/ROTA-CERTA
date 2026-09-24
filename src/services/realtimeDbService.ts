import { get, onValue, ref, remove, set, update } from "firebase/database";
import { rtdb } from "./firebase";
import type { Delivery, Driver, User } from "../types";

const DELIV_CACHE_KEY = "rotacerta_deliveries_rtdb_cache";
const DRIVERS_CACHE_KEY = "rotacerta_drivers_rtdb_cache";

/**
 * Normaliza lista de entregas a partir do snapshot do RTDB (que pode vir como objeto { [id]: Delivery })
 */
function normalizeDeliveries(raw: Record<string, Delivery> | Delivery[] | null): Delivery[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw);
  // Ordena por data de criação decrescente
  return list.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
}

function normalizeDrivers(raw: Record<string, Driver> | Driver[] | null): Driver[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// ==========================================
// ENTREGAS (DELIVERIES)
// ==========================================

export function subscribeToDeliveriesRTDB(
  onChange: (deliveries: Delivery[]) => void,
  onError?: (err: Error) => void,
): () => void {
  // Dispara cache local imediatamente se disponível
  try {
    const cached = localStorage.getItem(DELIV_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) onChange(parsed);
    }
  } catch {}

  if (!rtdb) {
    console.warn("RTDB não inicializado. Usando apenas dados locais para entregas.");
    return () => undefined;
  }

  const deliveriesRef = ref(rtdb, "rotacerta/deliveries");
  const unsubscribe = onValue(
    deliveriesRef,
    (snapshot) => {
      const val = snapshot.val();
      const list = normalizeDeliveries(val);
      try {
        localStorage.setItem(DELIV_CACHE_KEY, JSON.stringify(list));
      } catch {}
      onChange(list);
    },
    (error) => {
      console.error("Erro no listener de entregas RTDB:", error);
      onError?.(error);
    },
  );

  return unsubscribe;
}

/**
 * Remove recursivamente todas as propriedades 'undefined' de qualquer objeto ou array
 * antes de enviar ao Firebase RTDB, pois o Firebase rejeita terminantemente valores undefined.
 */
export function cleanForRTDB<T>(data: T): T {
  if (data === undefined) return null as unknown as T;
  return JSON.parse(JSON.stringify(data));
}

export async function saveDeliveryRTDB(delivery: Delivery): Promise<void> {
  // Salva no cache local
  try {
    const cached = localStorage.getItem(DELIV_CACHE_KEY);
    const list: Delivery[] = cached ? JSON.parse(cached) : [];
    const idx = list.findIndex((d) => d.id === delivery.id);
    if (idx >= 0) list[idx] = delivery;
    else list.unshift(delivery);
    localStorage.setItem(DELIV_CACHE_KEY, JSON.stringify(list));
  } catch {}

  if (!rtdb) return;
  const itemRef = ref(rtdb, `rotacerta/deliveries/${delivery.id}`);
  await set(itemRef, cleanForRTDB(delivery));
}

export async function updateDeliveryRTDB(deliveryId: string, updates: Partial<Delivery>): Promise<void> {
  try {
    const cached = localStorage.getItem(DELIV_CACHE_KEY);
    if (cached) {
      const list: Delivery[] = JSON.parse(cached);
      const idx = list.findIndex((d) => d.id === deliveryId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates };
        localStorage.setItem(DELIV_CACHE_KEY, JSON.stringify(list));
      }
    }
  } catch {}

  if (!rtdb) return;
  const itemRef = ref(rtdb, `rotacerta/deliveries/${deliveryId}`);
  await update(itemRef, cleanForRTDB(updates));
}

export async function deleteDeliveryRTDB(deliveryId: string): Promise<void> {
  try {
    const cached = localStorage.getItem(DELIV_CACHE_KEY);
    if (cached) {
      const list: Delivery[] = JSON.parse(cached);
      const filtered = list.filter((d) => d.id !== deliveryId);
      localStorage.setItem(DELIV_CACHE_KEY, JSON.stringify(filtered));
    }
  } catch {}

  if (!rtdb) return;
  const itemRef = ref(rtdb, `rotacerta/deliveries/${deliveryId}`);
  await remove(itemRef);
}

export async function batchSaveDeliveriesRTDB(deliveries: Delivery[]): Promise<void> {
  if (!deliveries.length) return;
  try {
    localStorage.setItem(DELIV_CACHE_KEY, JSON.stringify(deliveries));
  } catch {}

  if (!rtdb) return;
  const updates: Record<string, unknown> = {};
  for (const del of deliveries) {
    if (del && del.id) {
      updates[`rotacerta/deliveries/${del.id}`] = cleanForRTDB(del);
    }
  }
  await update(ref(rtdb), updates);
}

// ==========================================
// MOTOBOYS (DRIVERS)
// ==========================================

export function subscribeToDriversRTDB(
  onChange: (drivers: Driver[]) => void,
  onError?: (err: Error) => void,
): () => void {
  try {
    const cached = localStorage.getItem(DRIVERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) onChange(parsed);
    }
  } catch {}

  if (!rtdb) {
    console.warn("RTDB não inicializado. Usando apenas dados locais para motoristas.");
    return () => undefined;
  }

  const driversRef = ref(rtdb, "rotacerta/drivers");
  const unsubscribe = onValue(
    driversRef,
    (snapshot) => {
      const val = snapshot.val();
      const list = normalizeDrivers(val);
      try {
        localStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(list));
      } catch {}
      onChange(list);
    },
    (error) => {
      console.error("Erro no listener de motoristas RTDB:", error);
      onError?.(error);
    },
  );

  return unsubscribe;
}

export async function getDriversRTDB(): Promise<Driver[]> {
  try {
    const cached = localStorage.getItem(DRIVERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}

  if (!rtdb) return [];
  try {
    const driversRef = ref(rtdb, "rotacerta/drivers");
    const snapshot = await get(driversRef);
    if (snapshot.exists()) {
      const list = normalizeDrivers(snapshot.val());
      try {
        localStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(list));
      } catch {}
      return list;
    }
  } catch (e) {
    console.warn("Erro ao buscar motoristas do RTDB:", e);
  }
  return [];
}

export async function saveDriverRTDB(driver: Driver): Promise<void> {
  try {
    const cached = localStorage.getItem(DRIVERS_CACHE_KEY);
    const list: Driver[] = cached ? JSON.parse(cached) : [];
    const idx = list.findIndex((d) => d.id === driver.id);
    if (idx >= 0) list[idx] = driver;
    else list.push(driver);
    localStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(list));
  } catch {}

  if (!rtdb) return;
  const itemRef = ref(rtdb, `rotacerta/drivers/${driver.id}`);
  await set(itemRef, cleanForRTDB(driver));
}

export async function deleteDriverRTDB(driverId: string): Promise<void> {
  try {
    const cached = localStorage.getItem(DRIVERS_CACHE_KEY);
    if (cached) {
      const list: Driver[] = JSON.parse(cached);
      const filtered = list.filter((d) => d.id !== driverId);
      localStorage.setItem(DRIVERS_CACHE_KEY, JSON.stringify(filtered));
    }
  } catch {}

  if (!rtdb) return;
  const itemRef = ref(rtdb, `rotacerta/drivers/${driverId}`);
  await remove(itemRef);
}

// ==========================================
// USUÁRIOS E PERFIS (USERS & ROLES)
// ==========================================

export async function saveUserProfileRTDB(uid: string, profile: User): Promise<void> {
  if (!rtdb) return;
  const userRef = ref(rtdb, `rotacerta/users/${uid}`);
  await set(userRef, cleanForRTDB(profile));
}

export async function getUserProfileRTDB(uid: string): Promise<User | null> {
  if (!rtdb) return null;
  try {
    const userRef = ref(rtdb, `rotacerta/users/${uid}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      return snapshot.val() as User;
    }
    return null;
  } catch (e) {
    console.warn("Não foi possível carregar perfil do usuário no RTDB:", e);
    return null;
  }
}

// ==========================================
// CONFIGURAÇÃO CENTRALIZADA TAKEAT
// ==========================================

export interface TakeatConfigRTDB {
  authMethod: "credentials" | "apikey";
  email?: string;
  password?: string;
  apiKey?: string;
  updatedAt?: string;
}

export async function saveTakeatConfigRTDB(config: TakeatConfigRTDB): Promise<void> {
  if (!rtdb) return;
  const configRef = ref(rtdb, "rotacerta/config/takeat");
  await set(configRef, cleanForRTDB({
    ...config,
    updatedAt: new Date().toISOString(),
  }));
}

export async function getTakeatConfigRTDB(): Promise<TakeatConfigRTDB | null> {
  if (!rtdb) return null;
  try {
    const configRef = ref(rtdb, "rotacerta/config/takeat");
    const snapshot = await get(configRef);
    if (snapshot.exists()) {
      return snapshot.val() as TakeatConfigRTDB;
    }
    return null;
  } catch (e) {
    console.warn("Não foi possível carregar configuração Takeat do RTDB:", e);
    return null;
  }
}

export function subscribeToTakeatConfigRTDB(
  onChange: (config: TakeatConfigRTDB | null) => void,
): () => void {
  if (!rtdb) return () => undefined;
  const configRef = ref(rtdb, "rotacerta/config/takeat");
  return onValue(configRef, (snapshot) => {
    if (snapshot.exists()) {
      onChange(snapshot.val() as TakeatConfigRTDB);
    } else {
      onChange(null);
    }
  });
}
