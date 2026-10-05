import assert from "node:assert/strict";
import test from "node:test";

// Funções puras simulando as regras do shiftService para teste unitário determinístico
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function formatDateISO(d) {
  return d.toISOString().slice(0, 10);
}

function replicateWeekShiftsPure(shifts, sourceMonday, targetMonday) {
  const sourceMon = new Date(`${sourceMonday}T00:00:00`);
  const targetMon = new Date(`${targetMonday}T00:00:00`);
  const diffDays = Math.round((targetMon.getTime() - sourceMon.getTime()) / (1000 * 60 * 60 * 24));

  const sourceWeekSunday = new Date(sourceMon);
  sourceWeekSunday.setDate(sourceMon.getDate() + 6);
  const minDate = formatDateISO(sourceMon);
  const maxDate = formatDateISO(sourceWeekSunday);

  const sourceShifts = shifts.filter((s) => s.date >= minDate && s.date <= maxDate);

  return sourceShifts.map((s, idx) => {
    const origDate = new Date(`${s.date}T00:00:00`);
    origDate.setDate(origDate.getDate() + diffDays);
    const newDateStr = formatDateISO(origDate);
    return {
      ...s,
      id: `shift_${Date.now()}_${idx}`,
      date: newDateStr,
      status: "agendado",
      confirmedAt: undefined,
    };
  });
}

function generateWhatsAppScheduleTextPure(shifts, startDateStr, storeName) {
  const start = new Date(`${startDateStr}T00:00:00`);
  const daysOfWeek = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

  let text = `📅 *ESCALA DE MOTOBOYS — ${storeName.toUpperCase()}*\n`;
  text += `Semana de ${start.toLocaleDateString("pt-BR")}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < 7; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const dateStr = formatDateISO(current);
    const dayLabel = daysOfWeek[i];
    const dateFormatted = `${current.getDate().toString().padStart(2, "0")}/${(current.getMonth() + 1).toString().padStart(2, "0")}`;

    const dayShifts = shifts.filter((s) => s.date === dateStr);

    text += `*${dayLabel.toUpperCase()} (${dateFormatted})*\n`;
    if (dayShifts.length === 0) {
      text += `  _(Sem plantonistas agendados)_\n\n`;
    } else {
      dayShifts.forEach((s) => {
        text += `  🛵 *${s.driverName}* — ${s.startTime} às ${s.endTime}\n`;
      });
      text += `\n`;
    }
  }

  text += `⚠️ *Avisos:*\n`;
  text += `• Solicitações de troca devem ser feitas pelo App Rota Certa.\n`;
  text += `• Faça o check-in no app ao iniciar o plantão.\n`;
  return text;
}

function processSwapDecision(swap, accepted, responder, autoApprove = true) {
  if (!accepted) {
    return {
      ...swap,
      status: "rejeitado",
      responderId: responder.id,
      responderName: responder.name,
      respondedAt: new Date().toISOString(),
    };
  }

  const finalStatus = autoApprove ? "aprovado" : "pendente_aprovacao_loja";
  return {
    ...swap,
    status: finalStatus,
    responderId: responder.id,
    responderName: responder.name,
    respondedAt: new Date().toISOString(),
  };
}

test("replicateWeekShiftsPure replica corretamente os plantões avançando 7 dias", () => {
  const currentShifts = [
    {
      id: "s1",
      driverId: "drv1",
      driverName: "Carlos",
      date: "2026-10-05", // Segunda
      startTime: "18:00",
      endTime: "23:30",
      status: "confirmado",
    },
    {
      id: "s2",
      driverId: "drv2",
      driverName: "Lucas",
      date: "2026-10-06", // Terça
      startTime: "18:00",
      endTime: "23:30",
      status: "agendado",
    },
    {
      id: "s_old",
      driverId: "drv3",
      driverName: "Marcos",
      date: "2026-09-20", // Outra semana
      startTime: "18:00",
      endTime: "23:30",
      status: "confirmado",
    },
  ];

  const replicated = replicateWeekShiftsPure(currentShifts, "2026-10-05", "2026-10-12");

  assert.equal(replicated.length, 2, "Apenas os plantões da semana de origem devem ser replicados");
  assert.equal(replicated[0].date, "2026-10-12", "Segunda-feira deve avançar para a próxima segunda");
  assert.equal(replicated[0].driverName, "Carlos");
  assert.equal(replicated[0].status, "agendado", "Status deve reiniciar como agendado");
  assert.equal(replicated[1].date, "2026-10-13", "Terça-feira deve avançar para a próxima terça");
  assert.equal(replicated[1].driverName, "Lucas");
});

test("generateWhatsAppScheduleTextPure formata mensagem pronta para o WhatsApp do grupo", () => {
  const shifts = [
    {
      id: "s1",
      driverId: "drv1",
      driverName: "Carlos Motoboy",
      date: "2026-10-05",
      startTime: "18:00",
      endTime: "23:30",
      status: "agendado",
    },
    {
      id: "s2",
      driverId: "drv2",
      driverName: "Lucas Silva",
      date: "2026-10-05",
      startTime: "19:00",
      endTime: "00:00",
      status: "agendado",
    },
  ];

  const text = generateWhatsAppScheduleTextPure(shifts, "2026-10-05", "House Burger");

  assert.match(text, /ESCALA DE MOTOBOYS — HOUSE BURGER/);
  assert.match(text, /Carlos Motoboy/);
  assert.match(text, /Lucas Silva/);
  assert.match(text, /18:00 às 23:30/);
  assert.match(text, /App Rota Certa/);
});

test("processSwapDecision gerencia transição de status de troca de plantão", () => {
  const swapRequest = {
    id: "swap_123",
    shiftId: "s1",
    shiftDate: "2026-10-05",
    shiftStartTime: "18:00",
    shiftEndTime: "23:30",
    requestingDriverId: "drv1",
    requestingDriverName: "Carlos",
    status: "pendente",
  };

  // Rejeição
  const rejected = processSwapDecision(swapRequest, false, { id: "drv2", name: "Lucas" });
  assert.equal(rejected.status, "rejeitado");
  assert.equal(rejected.responderName, "Lucas");

  // Aceite com aprovação direta (autoApprove = true)
  const acceptedDirect = processSwapDecision(swapRequest, true, { id: "drv2", name: "Lucas" }, true);
  assert.equal(acceptedDirect.status, "aprovado");

  // Aceite que requer aprovação do gerente/loja (autoApprove = false)
  const acceptedPendingAdmin = processSwapDecision(swapRequest, true, { id: "drv2", name: "Lucas" }, false);
  assert.equal(acceptedPendingAdmin.status, "pendente_aprovacao_loja");
});
