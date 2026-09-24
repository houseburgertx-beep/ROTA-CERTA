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
  time?: string;
  createdAt?: string;
  deliveredAt?: string;
}

/**
 * Retorna se uma data corresponde à "noite/turno de hoje".
 * Em entregas de delivery, o turno da noite normalmente vai das 17h até as 04h do dia seguinte.
 */
export function isSameShiftOrToday(dateStr?: string): boolean {
  if (!dateStr) return true; // se não tem data explícita, assume data corrente
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return true;

  const now = new Date();
  // Se for o mesmo dia do calendário:
  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return true;
  }

  // Se for madrugada (antes das 06:00) e a entrega foi ontem após as 18:00
  if (now.getHours() < 6) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear() &&
      date.getHours() >= 17
    ) {
      return true;
    }
  }

  return false;
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
): FinancialStats {
  const filtered = driverNameFilter
    ? deliveries.filter((d) => d.driver === driverNameFilter)
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
    const dateRef = item.deliveredAt || item.createdAt;

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
    const stats = calculateFinancialStats(deliveries, driver.name);
    return {
      driverId: driver.id,
      driverName: driver.name,
      phone: driver.phone,
      vehicle: `${driver.vehicle}${driver.plate ? ` (${driver.plate})` : ""}`,
      nightTotal: stats.nightTotal,
      nightCount: stats.nightCount,
      monthTotal: stats.monthTotal,
      monthCount: stats.monthCount,
    };
  });
}
