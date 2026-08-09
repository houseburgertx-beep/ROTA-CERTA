import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "./firebase";
import type { DriverLocation } from "../types";

export function subscribeToDriverLocations(
  companyId: string,
  onChange: (locations: DriverLocation[]) => void,
) {
  if (!db) return () => undefined;
  return onSnapshot(collection(db, "companies", companyId, "driverLocations"), snapshot => {
    onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as DriverLocation));
  }, () => onChange([]));
}

export async function publishDriverLocation(
  companyId: string,
  driverId: string,
  point: Omit<DriverLocation, "id" | "companyId" | "driverId" | "updatedAt">,
) {
  if (!db) throw new Error("Firebase não está configurado.");
  await setDoc(doc(db, "companies", companyId, "driverLocations", driverId), {
    companyId,
    driverId,
    routeId: point.routeId || "active",
    nextStopId: point.nextStopId || "",
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy ?? null,
    heading: point.heading ?? null,
    speed: point.speed ?? null,
    active: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function finishDriverRoute(companyId: string, driverId: string) {
  if (!db) throw new Error("Firebase não está configurado.");
  await setDoc(doc(db, "companies", companyId, "driverLocations", driverId), {
    companyId,
    driverId,
    routeId: "",
    nextStopId: "",
    active: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
