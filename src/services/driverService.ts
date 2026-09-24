import type { Driver } from "../types";
import {
  deleteDriverRTDB,
  saveDriverRTDB,
  subscribeToDriversRTDB,
} from "./realtimeDbService";

const DRIVERS_STORAGE_KEY = "rotacerta_drivers";

export function loadStoredDrivers(): Driver[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DRIVERS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredDrivers(drivers: Driver[]) {
  try {
    localStorage.setItem(DRIVERS_STORAGE_KEY, JSON.stringify(drivers));
  } catch {}
}

export function subscribeToDrivers(
  _companyId: string,
  onChange: (drivers: Driver[]) => void,
  fallbackToLocal = true,
) {
  if (fallbackToLocal) {
    const local = loadStoredDrivers();
    if (local.length > 0) onChange(local);
  }

  return subscribeToDriversRTDB(
    (list) => {
      onChange(list);
      saveStoredDrivers(list);
    },
    () => {
      if (fallbackToLocal) onChange(loadStoredDrivers());
    },
  );
}

export async function createDriver(
  companyId: string,
  driverData: Omit<Driver, "id">,
): Promise<Driver> {
  const newDriver: Driver = {
    ...driverData,
    id: `drv-${Date.now()}`,
    companyId,
    createdAt: new Date().toISOString(),
  };

  // Salva no Firebase Realtime Database
  try {
    await saveDriverRTDB(newDriver);
  } catch (e) {
    console.warn("Erro ao salvar motoboy no RTDB:", e);
  }

  const current = loadStoredDrivers();
  const updated = [newDriver, ...current];
  saveStoredDrivers(updated);
  return newDriver;
}

export async function updateDriver(
  _companyId: string,
  driverId: string,
  updates: Partial<Driver>,
) {
  const current = loadStoredDrivers();
  const existing = current.find((d) => d.id === driverId);
  if (existing) {
    const updatedDriver = { ...existing, ...updates };
    try {
      await saveDriverRTDB(updatedDriver);
    } catch (e) {
      console.warn("Erro ao atualizar motoboy no RTDB:", e);
    }
  }

  const updated = current.map((d) => (d.id === driverId ? { ...d, ...updates } : d));
  saveStoredDrivers(updated);
  return updated;
}

export async function deleteDriver(_companyId: string, driverId: string) {
  try {
    await deleteDriverRTDB(driverId);
  } catch (e) {
    console.warn("Erro ao remover motoboy no RTDB:", e);
  }

  const current = loadStoredDrivers();
  const updated = current.filter((d) => d.id !== driverId);
  saveStoredDrivers(updated);
  return updated;
}
