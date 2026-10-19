import type { Driver, DriverEarningsSummary, FinancialStats } from "../types";

export interface DeliveryItemForFinance {
  id: string;
  order: string;
  customer: string;
  address: string;
  district: string;
  deliveryFee: number;
  amount: number;
  status: string;
  driver?: string;
  driverId?: string;
  time?: string;
  createdAt?: string;
  deliveredAt?: string;
}

/**
 * Retorna se uma data corresponde à "noite/turno de hoje".
 * Em entregas de delivery, o turno da noite normalmente vai das 17h até as 04h do dia seguinte.
 */
export function isSameShiftOrToday(dateInput?: unknown): boolean {
  if (!dateInput) return false;
  let date: Date;

  if (typeof dateInput === "number") {
    date = new Date(dateInput);
  } else if (typeof dateInput === "string") {
    const clean = dateInput.trim();
    if (!clean) return false;
    // Se for apenas formato de hora "HH:MM" ou "HH:MM:SS", é do dia/turno de hoje
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return true;
    const normalized = clean.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, "$1T$2");
    date = new Date(normalized);
  } else if (dateInput && typeof (dateInput as any).toDate === "function") {
    date = (dateInput as any).toDate();
  } else if (dateInput && typeof (dateInput as any).seconds === "number") {
    date = new Date((dateInput as any).seconds * 1000);
  } else {
    date = new Date(String(dateInput));
  }

  if (isNaN(date.getTime())) return false;

  const now = new Date();

  // Em operações de delivery e hamburguerias, o dia operacional/turno começa às 06:00
  // e se estende até as 05:59 da manhã seguinte.
  // Entregas feitas na madrugada (00:00 às 05:59) pertencem ao turno da noite anterior.
  const getShiftDateKey = (d: Date) => {
    const shift = new Date(d);
    if (shift.getHours() < 6) {
      shift.setDate(shift.getDate() - 1);
    }
    return `${shift.getFullYear()}-${shift.getMonth()}-${shift.getDate()}`;
  };

  return getShiftDateKey(date) === getShiftDateKey(now);
}

/**
 * Retorna se a data pertence ao mês e ano atuais ou a um mês específico (YYYY-MM).
 */
export function isCurrentMonth(dateInput?: unknown, targetYearMonth?: string): boolean {
  if (!dateInput) return true;
  let date: Date;

  if (typeof dateInput === "number") {
    date = new Date(dateInput);
  } else if (typeof dateInput === "string") {
    date = new Date(dateInput);
  } else if (dateInput && typeof (dateInput as any).toDate === "function") {
    date = (dateInput as any).toDate();
  } else if (dateInput && typeof (dateInput as any).seconds === "number") {
    date = new Date((dateInput as any).seconds * 1000);
  } else {
    date = new Date(String(dateInput));
  }

  if (isNaN(date.getTime())) return true;

  if (targetYearMonth && targetYearMonth !== "all") {
    const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return ym === targetYearMonth;
  }

  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/**
 * Calcula estatísticas financeiras gerais ou de um motoboy específico
 */
export function calculateFinancialStats(
  deliveries: DeliveryItemForFinance[],
  driverNameFilter?: string,
  driverIdFilter?: string,
  targetYearMonth?: string,
): FinancialStats {
  if (!Array.isArray(deliveries)) {
    return { nightTotal: 0, nightCount: 0, monthTotal: 0, monthCount: 0, avgFee: 0 };
  }

  const safeDeliveries = deliveries.filter((d): d is DeliveryItemForFinance => Boolean(d && typeof d === "object"));
  const filterNorm = driverNameFilter ? driverNameFilter.toLowerCase().trim() : undefined;
  const idNorm = driverIdFilter ? driverIdFilter.toLowerCase().trim() : undefined;

  const filtered = (filterNorm || idNorm)
    ? safeDeliveries.filter((d) => {
        if (idNorm && d.driverId) {
          const dId = String(d.driverId).toLowerCase().trim();
          if (
            dId === idNorm ||
            dId === `drv-${idNorm}` ||
            `drv-${dId}` === idNorm ||
            (idNorm.startsWith("drv-") && dId === idNorm.slice(4))
          ) {
            return true;
          }
        }
        if (!filterNorm || !d.driver) return false;
        const dNorm = String(d.driver).toLowerCase().trim();
        return dNorm === filterNorm || dNorm.includes(filterNorm) || filterNorm.includes(dNorm);
      })
    : safeDeliveries;

  // Apenas entregas concluídas contam como faturado
  const deliveredOnly = filtered.filter((d) => {
    const st = String(d.status || "").toLowerCase().trim();
    return st === "entregue" || st === "delivered" || st === "completed" || st === "concluída";
  });

  let nightTotal = 0;
  let nightCount = 0;
  let monthTotal = 0;
  let monthCount = 0;

  for (const item of deliveredOnly) {
    const fee = Number(item.deliveryFee) || 0;
    const dateRef = item.createdAt || item.deliveredAt;

    if (isSameShiftOrToday(dateRef)) {
      nightTotal += fee;
      nightCount += 1;
    }

    if (targetYearMonth === "all" || isCurrentMonth(dateRef, targetYearMonth)) {
      monthTotal += fee;
      monthCount += 1;
    }
  }

  const avgFee = nightCount > 0 ? nightTotal / nightCount : monthCount > 0 ? monthTotal / monthCount : 0;

  return {
    nightTotal,
    nightCount,
    monthTotal,
    monthCount,
    avgFee,
  };
}

/**
 * Gera resumo de faturamento de cada motoboy da equipe
 */
export function getDriversEarningsSummary(
  drivers: Driver[],
  deliveries: DeliveryItemForFinance[],
  targetYearMonth?: string,
): DriverEarningsSummary[] {
  return drivers.map((driver) => {
    const stats = calculateFinancialStats(deliveries, driver.name, driver.id, targetYearMonth);
    return {
      driverId: driver.id,
      driverName: driver.name,
      email: driver.email,
      phone: driver.phone,
      vehicle: `${driver.vehicle}${driver.plate ? ` (${driver.plate})` : ""}`,
      takeatId: driver.takeatId,
      nightTotal: stats.nightTotal,
      nightCount: stats.nightCount,
      monthTotal: stats.monthTotal,
      monthCount: stats.monthCount,
    };
  });
}
