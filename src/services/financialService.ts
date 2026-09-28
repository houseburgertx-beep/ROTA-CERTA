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
export function isSameShiftOrToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  const clean = dateStr.trim();
  // Se for apenas formato de hora "HH:MM" ou "HH:MM:SS", é do dia/turno de hoje
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) return true;

  const normalized = clean.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, "$1T$2");
  const date = new Date(normalized);
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
 * Retorna se a data pertence ao mês e ano atuais.
 */
export function isCurrentMonth(dateStr?: string): boolean {
  if (!dateStr) return true;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return true;

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
): FinancialStats {
  const filterNorm = driverNameFilter ? driverNameFilter.toLowerCase().trim() : undefined;
  const idNorm = driverIdFilter ? driverIdFilter.toLowerCase().trim() : undefined;

  const filtered = (filterNorm || idNorm)
    ? deliveries.filter((d) => {
        if (idNorm && d.driverId) {
          const dId = d.driverId.toLowerCase().trim();
          if (dId === idNorm || dId === `drv-${idNorm}` || `drv-${dId}` === idNorm) {
            return true;
          }
        }
        if (!filterNorm || !d.driver) return false;
        const dNorm = d.driver.toLowerCase().trim();
        return dNorm === filterNorm || dNorm.includes(filterNorm) || filterNorm.includes(dNorm);
      })
    : deliveries;

  // Apenas entregas concluídas contam como faturado
  const deliveredOnly = filtered.filter(
    (d) => d.status.toLowerCase() === "entregue" || d.status.toLowerCase() === "delivered",
  );

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

    if (isCurrentMonth(dateRef)) {
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
): DriverEarningsSummary[] {
  return drivers.map((driver) => {
    const stats = calculateFinancialStats(deliveries, driver.name, driver.id);
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
