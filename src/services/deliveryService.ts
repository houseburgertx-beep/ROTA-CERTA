import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { z } from "zod";

import { db } from "./firebase";
import type { DeliveryRecord, NewDeliveryRecord } from "../types/delivery";

const deliverySchema = z.object({
  companyId: z.string().min(1),
  customerName: z.string().trim().min(2).max(120),
  orderNumber: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(8).max(24),
  address: z.string().trim().min(3).max(180),
  number: z.string().trim().min(1).max(20),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(12).optional(),
  complement: z.string().trim().max(100).optional(),
  reference: z.string().trim().max(160).optional(),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  amount: z.number().finite().min(0),
  deliveryFee: z.number().finite().min(0),
  paymentMethod: z.string().trim().min(2).max(40),
  priority: z.enum(["normal", "high", "urgent"]).optional(),
  source: z.enum(["manual", "ocr"]).optional(),
  notes: z.string().trim().max(500).optional(),
  status: z.enum(["pending","assigned","on_route","arrived","delivered","problem","cancelled"]),
  customerId: z.string().optional(),
  driverId: z.string().optional(),
  routeId: z.string().optional(),
});

const deliveriesPath = (companyId: string) =>
  collection(db!, "companies", companyId, "deliveries");

export function subscribeToDeliveries(
  companyId: string,
  onChange: (deliveries: DeliveryRecord[]) => void,
  onError: (message: string) => void,
) {
  if (!db) return () => undefined;
  const deliveriesQuery = query(deliveriesPath(companyId), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(deliveriesQuery, snapshot => {
    onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as DeliveryRecord));
  }, () => onError("Não foi possível atualizar as entregas."));
}

export async function createDelivery(input: NewDeliveryRecord) {
  if (!db) throw new Error("Firebase não está configurado.");
  const data = deliverySchema.parse(input);
  return addDoc(deliveriesPath(data.companyId), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateDeliveryStatus(
  companyId: string,
  deliveryId: string,
  status: DeliveryRecord["status"],
) {
  if (!db) throw new Error("Firebase não está configurado.");
  await updateDoc(doc(db, "companies", companyId, "deliveries", deliveryId), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === "delivered" ? { deliveredAt: serverTimestamp() } : {}),
  });
}

export async function deleteDelivery(companyId: string, deliveryId: string) {
  if (!db) throw new Error("Firebase não está configurado.");
  await deleteDoc(doc(db, "companies", companyId, "deliveries", deliveryId));
}

export async function updateDeliveryLocation(
  companyId: string,
  deliveryId: string,
  latitude: number,
  longitude: number,
) {
  if (!db) throw new Error("Firebase não está configurado.");
  await updateDoc(doc(db, "companies", companyId, "deliveries", deliveryId), {
    latitude,
    longitude,
    geocodedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
