import { get, onValue, ref, remove, set, update } from "firebase/database";
import { rtdb } from "./firebase";
import type { Shift, ShiftConfig, ShiftSwapRequest } from "../types";
import { cleanForRTDB } from "./realtimeDbService";
import { getActiveStoreId, getRtdbPath, getStoreCacheKey } from "./storeService";

const getShiftsCacheKey = () => getStoreCacheKey("rotacerta_shifts_cache");
const getSwapsCacheKey = () => getStoreCacheKey("rotacerta_swaps_cache");
const getConfigCacheKey = () => getStoreCacheKey("rotacerta_shift_config_cache");

export const DEFAULT_SHIFT_CONFIG: ShiftConfig = {
  reminderMinutes: 60,
  autoApproveSwaps: true,
};

// ==========================================
// CACHE LOCAL
// ==========================================

export function loadStoredShifts(): Shift[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(getShiftsCacheKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredShifts(shifts: Shift[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(getShiftsCacheKey(), JSON.stringify(shifts));
  } catch {}
}

export function loadStoredSwaps(): ShiftSwapRequest[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(getSwapsCacheKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveStoredSwaps(swaps: ShiftSwapRequest[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(getSwapsCacheKey(), JSON.stringify(swaps));
  } catch {}
}

// ==========================================
// NORMALIZAÇÃO DE DADOS
// ==========================================

function normalizeShifts(raw: Record<string, Shift> | Shift[] | null): Shift[] {
  if (!raw) return [];
  let list: Shift[];
  if (Array.isArray(raw)) {
    list = raw.filter((s): s is Shift => Boolean(s && typeof s === "object" && s.id));
  } else {
    list = Object.entries(raw)
      .map(([key, val]) => {
        if (!val || typeof val !== "object") return null;
        const id = val.id && typeof val.id === "string" ? val.id : key;
        return { ...val, id } as Shift;
      })
      .filter((s): s is Shift => Boolean(s && s.id));
  }

  // Ordena por data crescente e depois por horário de início
  return list.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.startTime.localeCompare(b.startTime);
  });
}

function normalizeSwaps(raw: Record<string, ShiftSwapRequest> | ShiftSwapRequest[] | null): ShiftSwapRequest[] {
  if (!raw) return [];
  let list: ShiftSwapRequest[];
  if (Array.isArray(raw)) {
    list = raw.filter((s): s is ShiftSwapRequest => Boolean(s && typeof s === "object" && s.id));
  } else {
    list = Object.entries(raw)
      .map(([key, val]) => {
        if (!val || typeof val !== "object") return null;
        const id = val.id && typeof val.id === "string" ? val.id : key;
        return { ...val, id } as ShiftSwapRequest;
      })
      .filter((s): s is ShiftSwapRequest => Boolean(s && s.id));
  }

  // Ordena por data de criação decrescente
  return list.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });
}

// ==========================================
// ASSINATURAS EM TEMPO REAL (RTDB)
// ==========================================

export function subscribeToShifts(
  onChange: (shifts: Shift[]) => void,
  onError?: (err: Error) => void
): () => void {
  // Dispara cache local imediatamente
  const local = loadStoredShifts();
  if (local.length > 0) onChange(local);

  if (!rtdb) return () => undefined;

  const shiftsRef = ref(rtdb, getRtdbPath("shifts"));
  return onValue(
    shiftsRef,
    (snapshot) => {
      const list = normalizeShifts(snapshot.val());
      saveStoredShifts(list);
      onChange(list);
    },
    (err) => {
      console.error("Erro no listener de shifts:", err);
      onError?.(err);
    }
  );
}

export function subscribeToShiftSwaps(
  onChange: (swaps: ShiftSwapRequest[]) => void,
  onError?: (err: Error) => void
): () => void {
  const local = loadStoredSwaps();
  if (local.length > 0) onChange(local);

  if (!rtdb) return () => undefined;

  const swapsRef = ref(rtdb, getRtdbPath("shift_swaps"));
  return onValue(
    swapsRef,
    (snapshot) => {
      const list = normalizeSwaps(snapshot.val());
      saveStoredSwaps(list);
      onChange(list);
    },
    (err) => {
      console.error("Erro no listener de shift_swaps:", err);
      onError?.(err);
    }
  );
}

// ==========================================
// OPERAÇÕES DE PLANTÃO (SHIFTS)
// ==========================================

export async function saveShift(shift: Shift): Promise<void> {
  const current = loadStoredShifts();
  const idx = current.findIndex((s) => s.id === shift.id);
  if (idx >= 0) current[idx] = shift;
  else current.push(shift);
  saveStoredShifts(current);

  if (!rtdb) return;
  const shiftRef = ref(rtdb, `${getRtdbPath("shifts")}/${shift.id}`);
  await set(shiftRef, cleanForRTDB(shift));
}

export async function deleteShift(shiftId: string): Promise<void> {
  const current = loadStoredShifts().filter((s) => s.id !== shiftId);
  saveStoredShifts(current);

  if (!rtdb) return;
  const shiftRef = ref(rtdb, `${getRtdbPath("shifts")}/${shiftId}`);
  await remove(shiftRef);
}

export async function checkInShift(shiftId: string): Promise<void> {
  const now = new Date().toISOString();
  const updates: Partial<Shift> = {
    status: "confirmado",
    checkedInAt: now,
    updatedAt: now,
  };

  const current = loadStoredShifts();
  const idx = current.findIndex((s) => s.id === shiftId);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...updates };
    saveStoredShifts(current);
  }

  if (!rtdb) return;
  const shiftRef = ref(rtdb, `${getRtdbPath("shifts")}/${shiftId}`);
  await update(shiftRef, cleanForRTDB(updates));
}

/**
 * Replica os plantões de uma semana para a semana seguinte (adiciona 7 dias a cada data).
 */
export async function replicateWeekShifts(
  sourceShifts: Shift[],
  targetMondayDate: string
): Promise<Shift[]> {
  if (sourceShifts.length === 0) return [];

  // Encontra a data da segunda-feira de origem (menor data da lista)
  const sortedDates = [...sourceShifts].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = new Date(sortedDates[0].date + "T00:00:00");
  const targetDate = new Date(targetMondayDate + "T00:00:00");
  const dayOffset = Math.round((targetDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

  const newShifts: Shift[] = [];
  const now = new Date().toISOString();

  for (const s of sourceShifts) {
    const sDate = new Date(s.date + "T00:00:00");
    sDate.setDate(sDate.getDate() + dayOffset);
    const newDateStr = sDate.toISOString().slice(0, 10);

    const cloned: Shift = {
      ...s,
      id: `shift-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      date: newDateStr,
      status: "agendado",
      checkedInAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    newShifts.push(cloned);
    await saveShift(cloned);
  }

  return newShifts;
}

// ==========================================
// OPERAÇÕES DE TROCA DE ESCALA (SWAPS)
// ==========================================

export async function requestShiftSwap(params: {
  shift: Shift;
  requestingDriver: { id: string; name: string };
  targetDriver?: { id: string; name: string };
  reason?: string;
}): Promise<ShiftSwapRequest> {
  const swapId = `swap-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const swap: ShiftSwapRequest = {
    id: swapId,
    shiftId: params.shift.id,
    requestingDriverId: params.requestingDriver.id,
    requestingDriverName: params.requestingDriver.name,
    targetDriverId: params.targetDriver?.id,
    targetDriverName: params.targetDriver?.name,
    shiftDate: params.shift.date,
    shiftTime: `${params.shift.startTime} às ${params.shift.endTime}`,
    shiftType: params.shift.shiftType,
    storeId: params.shift.storeId,
    status: "pendente",
    reason: params.reason?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };

  const current = loadStoredSwaps();
  current.unshift(swap);
  saveStoredSwaps(current);

  if (rtdb) {
    const swapRef = ref(rtdb, `${getRtdbPath("shift_swaps")}/${swap.id}`);
    await set(swapRef, cleanForRTDB(swap));
  }

  return swap;
}

export async function respondToShiftSwap(params: {
  swap: ShiftSwapRequest;
  accepted: boolean;
  responder: { id: string; name: string; phone?: string };
  autoApprove?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const shouldAutoApprove = params.accepted && (params.autoApprove ?? true);

  const updates: Partial<ShiftSwapRequest> = {
    status: params.accepted ? (shouldAutoApprove ? "aprovada" : "aceita") : "recusada",
    targetDriverId: params.responder.id,
    targetDriverName: params.responder.name,
    respondedAt: now,
    ...(shouldAutoApprove ? { approvedAt: now } : {}),
  };

  // Se auto-aprovado, transfere o plantão no banco de dados imediatamente
  if (shouldAutoApprove) {
    await transferShift({
      shiftId: params.swap.shiftId,
      newDriver: {
        id: params.responder.id,
        name: params.responder.name,
        phone: params.responder.phone,
      },
      originalDriverName: params.swap.requestingDriverName,
    });
  }

  if (rtdb) {
    const swapRef = ref(rtdb, `${getRtdbPath("shift_swaps")}/${params.swap.id}`);
    await update(swapRef, cleanForRTDB(updates));
  }
}

export async function approveShiftSwapAdmin(params: {
  swap: ShiftSwapRequest;
  responderPhone?: string;
}): Promise<void> {
  if (!params.swap.targetDriverId || !params.swap.targetDriverName) {
    throw new Error("Não é possível aprovar uma troca sem motoboy de destino definido.");
  }

  const now = new Date().toISOString();
  await transferShift({
    shiftId: params.swap.shiftId,
    newDriver: {
      id: params.swap.targetDriverId,
      name: params.swap.targetDriverName,
      phone: params.responderPhone,
    },
    originalDriverName: params.swap.requestingDriverName,
  });

  const updates: Partial<ShiftSwapRequest> = {
    status: "aprovada",
    approvedAt: now,
  };

  if (rtdb) {
    const swapRef = ref(rtdb, `${getRtdbPath("shift_swaps")}/${params.swap.id}`);
    await update(swapRef, cleanForRTDB(updates));
  }
}

async function transferShift(params: {
  shiftId: string;
  newDriver: { id: string; name: string; phone?: string };
  originalDriverName: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const shiftUpdates: Partial<Shift> = {
    driverId: params.newDriver.id,
    driverName: params.newDriver.name,
    driverPhone: params.newDriver.phone,
    status: "agendado",
    checkedInAt: undefined,
    notes: `Trocado com ${params.originalDriverName} em ${new Date().toLocaleDateString("pt-BR")}`,
    updatedAt: now,
  };

  const stored = loadStoredShifts();
  const idx = stored.findIndex((s) => s.id === params.shiftId);
  if (idx >= 0) {
    stored[idx] = { ...stored[idx], ...shiftUpdates };
    saveStoredShifts(stored);
  }

  if (rtdb) {
    const shiftRef = ref(rtdb, `${getRtdbPath("shifts")}/${params.shiftId}`);
    await update(shiftRef, cleanForRTDB(shiftUpdates));
  }
}

// ==========================================
// EXPORTAÇÃO E FORMATAÇÃO PARA WHATSAPP
// ==========================================

const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export function formatShiftDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = WEEKDAY_NAMES[dt.getDay()] || "";
  const dayFmt = String(d).padStart(2, "0");
  const monthFmt = String(m).padStart(2, "0");
  return `${weekday} (${dayFmt}/${monthFmt})`;
}

export function generateWhatsAppScheduleText(
  shifts: Shift[],
  startDate: string,
  endDate: string,
  storeName: string
): string {
  const title = `*ESCALA DE MOTOBOYS - ${storeName.toUpperCase()}*\n*Período:* ${formatShiftDateBR(startDate)} até ${formatShiftDateBR(endDate)}\n\n`;

  // Agrupa os plantões por data
  const byDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (s.date >= startDate && s.date <= endDate) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date)!.push(s);
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  if (sortedDates.length === 0) {
    return `${title}Nenhum plantão agendado para este período.`;
  }

  let text = title;
  for (const d of sortedDates) {
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*${formatShiftDateBR(d).toUpperCase()}*\n`;
    const dayShifts = byDate.get(d)!.sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const s of dayShifts) {
      const typeStr = s.shiftType === "almoco" ? "Almoço" : s.shiftType === "jantar" ? "Noite" : "Integral";
      text += `• *${s.startTime} às ${s.endTime}* (${typeStr}) - ${s.driverName}\n`;
    }
    text += `\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*Orientações:*\n`;
  text += `• Trocas de plantão devem ser solicitadas no app Rota Certa.\n`;
  text += `• Em caso de imprevisto, comunique a coordenação com antecedência.\n`;

  return text;
}
