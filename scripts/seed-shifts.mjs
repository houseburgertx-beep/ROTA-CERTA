/**
 * Script para cadastrar a escala real da semana no Firebase RTDB.
 * Mapeia todos os 9 motoboys com seus IDs e Takeat IDs oficiais.
 */

export const DRIVER_MAP = {
  Robson: {
    id: "drv-Zs1Tchrp8FWHbMKBfVXiDg8RegL2",
    name: "Robson",
    phone: "(73)999610891",
    takeatId: 196625,
  },
  Jackson: {
    id: "drv-lh11BcJsdGQaGIwGALyIjfCRHkw2",
    name: "Jackson",
    phone: "(73)998231985",
    takeatId: 241373,
  },
  Mateus: {
    id: "drv-Zb9p9bf3IgTGR2EddyLSPpfLQw72",
    name: "Mateus",
    phone: "(73)999258918",
    takeatId: 203621,
  },
  Guilherme: {
    id: "drv-TOIXT7FvH1Mxymob9bP6U5Bv85M2",
    name: "Guilherme",
    phone: "(73)999643417",
    takeatId: 182368,
  },
  Amorim: {
    id: "drv-sErnkmVPQrXNDTGER1WWXBESZof2",
    name: "Amorim",
    phone: "(73)988410811",
    takeatId: 263244,
  },
  Wesley: {
    id: "drv-bVDx0wWtlUhuH21MTzio9AZYPpz1",
    name: "Wesley",
    phone: "(73)991485464",
    takeatId: 323085,
  },
  Silvino: {
    id: "2IXE96y3Z1M1t888hCubJy9WihL2",
    name: "Silvino",
    phone: "(73)999630003",
    takeatId: 302213,
  },
  Derick: {
    id: "drv-wHRIQICDIqRDGWofuN7S8STHdBw2",
    name: "Derick",
    phone: "(73)998068536",
    takeatId: 266236,
  },
  Hiago: {
    id: "drv-srhCpA6iQLQsfcEPBvH9w0S4xwD2",
    name: "Higor",
    phone: "(73)999046424",
    takeatId: 296016,
  },
};

export const RAW_SCHEDULE = [
  {
    day: "Segunda",
    date: "2026-10-05",
    drivers: ["Robson", "Jackson", "Mateus", "Guilherme"],
    startTime: "18:00",
    endTime: "23:30",
  },
  {
    day: "Terça",
    date: "2026-10-06",
    drivers: ["Guilherme", "Jackson", "Mateus", "Robson"],
    startTime: "18:00",
    endTime: "23:30",
  },
  {
    day: "Quarta",
    date: "2026-10-07",
    drivers: ["Guilherme", "Amorim", "Jackson", "Wesley"],
    startTime: "18:00",
    endTime: "23:30",
  },
  {
    day: "Quinta",
    date: "2026-10-08",
    drivers: ["Amorim", "Jackson", "Mateus", "Guilherme"],
    startTime: "18:00",
    endTime: "23:30",
  },
  {
    day: "Sexta",
    date: "2026-10-09",
    drivers: ["Guilherme", "Amorim", "Mateus", "Silvino", "Derick", "Robson"],
    startTime: "18:00",
    endTime: "23:59",
  },
  {
    day: "Sábado",
    date: "2026-10-10",
    drivers: ["Amorim", "Mateus", "Wesley", "Jackson", "Silvino", "Derick", "Robson"],
    startTime: "18:00",
    endTime: "23:59",
  },
  {
    day: "Domingo",
    date: "2026-10-11",
    drivers: ["Amorim", "Mateus", "Wesley", "Jackson", "Silvino", "Derick", "Hiago"],
    startTime: "18:00",
    endTime: "23:59",
  },
];

export function buildShiftsPayload(storeId = "houseburger") {
  const shifts = [];
  for (const dayItem of RAW_SCHEDULE) {
    for (const driverKey of dayItem.drivers) {
      const driver = DRIVER_MAP[driverKey];
      if (!driver) {
        console.warn(`Motoboy não encontrado: ${driverKey}`);
        continue;
      }
      const shiftId = `shift_${dayItem.date}_${driver.takeatId}`;
      shifts.push({
        id: shiftId,
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone,
        date: dayItem.date,
        startTime: dayItem.startTime,
        endTime: dayItem.endTime,
        shiftType: "jantar",
        storeId,
        status: "agendado",
        createdAt: new Date().toISOString(),
      });
    }
  }
  return shifts;
}
