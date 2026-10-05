import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  MessageSquare,
  Repeat,
  Share2,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import type { Driver, Shift, ShiftSwapRequest, ShiftType, User } from "../types";
import { formatShiftDateBR, generateWhatsAppScheduleText } from "../services/shiftService";

interface ShiftManagementViewProps {
  currentUser: User;
  drivers: Driver[];
  shifts: Shift[];
  swaps: ShiftSwapRequest[];
  onSaveShift: (shift: Shift) => Promise<void>;
  onDeleteShift: (shiftId: string) => Promise<void>;
  onCheckInShift: (shiftId: string) => Promise<void>;
  onRequestSwap: (params: {
    shift: Shift;
    targetDriverId?: string;
    targetDriverName?: string;
    reason?: string;
  }) => Promise<void>;
  onRespondSwap: (swap: ShiftSwapRequest, accept: boolean) => Promise<void>;
  onApproveSwapAdmin: (swap: ShiftSwapRequest) => Promise<void>;
  onReplicateWeek: (targetMonday: string) => Promise<void>;
  onNotify: (msg: string) => void;
  currentStoreName: string;
  currentStoreId: string;
}

// Helpers para navegação semanal
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ShiftManagementView({
  currentUser,
  drivers,
  shifts,
  swaps,
  onSaveShift,
  onDeleteShift,
  onCheckInShift,
  onRequestSwap,
  onRespondSwap,
  onApproveSwapAdmin,
  onReplicateWeek,
  onNotify,
  currentStoreName,
  currentStoreId,
}: ShiftManagementViewProps) {
  const isAdmin = currentUser.role === "admin";
  const [subTab, setSubTab] = useState<"minha_escala" | "grade" | "trocas">(
    isAdmin ? "grade" : "minha_escala"
  );

  // Semana ativa (segunda-feira inicial)
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMonday(new Date()));
  const [isNewShiftModalOpen, setIsNewShiftModalOpen] = useState(false);
  const [swapTargetShift, setSwapTargetShift] = useState<Shift | null>(null);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Dias da semana atual (Segunda a Domingo)
  const weekDays = useMemo(() => {
    const days: { dateStr: string; label: string; dateObj: Date; isToday: boolean }[] = [];
    const todayStr = toDateString(new Date());

    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(d.getDate() + i);
      const dateStr = toDateString(d);
      const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
      days.push({
        dateStr,
        label: `${dayNames[i]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        dateObj: d,
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [currentMonday]);

  const weekStartStr = weekDays[0].dateStr;
  const weekEndStr = weekDays[6].dateStr;

  // Plantões do motoboy logado
  const myShifts = useMemo(() => {
    return shifts.filter(
      (s) =>
        s.driverId === currentUser.id ||
        (s.driverName && s.driverName.toLowerCase() === currentUser.name.toLowerCase())
    );
  }, [shifts, currentUser]);

  // Plantão de hoje do motoboy logado
  const todayStr = toDateString(new Date());
  const myTodayShift = useMemo(() => {
    return myShifts.find((s) => s.date === todayStr);
  }, [myShifts, todayStr]);

  // Trocas pendentes onde o motoboy é o destinatário (ou qualquer motoboy)
  const pendingSwapsForMe = useMemo(() => {
    return swaps.filter(
      (sw) =>
        sw.status === "pendente" &&
        sw.requestingDriverId !== currentUser.id &&
        (!sw.targetDriverId || sw.targetDriverId === currentUser.id || sw.targetDriverId === "all")
    );
  }, [swaps, currentUser.id]);

  // Total de trocas pendentes gerais (para o admin)
  const pendingSwapsCount = useMemo(() => {
    return swaps.filter((sw) => sw.status === "pendente").length;
  }, [swaps]);

  const prevWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() - 7);
    setCurrentMonday(d);
  };

  const nextWeek = () => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + 7);
    setCurrentMonday(d);
  };

  const currentWeekShifts = useMemo(() => {
    return shifts.filter((s) => s.date >= weekStartStr && s.date <= weekEndStr);
  }, [shifts, weekStartStr, weekEndStr]);

  return (
    <div className="shift-view-container">
      {/* Sub-navegação do Módulo de Escala */}
      <div className="shift-nav-header">
        <button
          type="button"
          className={`shift-nav-btn ${subTab === "minha_escala" ? "active" : ""}`}
          onClick={() => setSubTab("minha_escala")}
        >
          <CalendarCheck size={16} />
          <span>Minha Escala</span>
          {myTodayShift && <span className="shift-pulse-dot" title="Você tem plantão hoje!" />}
        </button>

        <button
          type="button"
          className={`shift-nav-btn ${subTab === "grade" ? "active" : ""}`}
          onClick={() => setSubTab("grade")}
        >
          <Calendar size={16} />
          <span>Grade Semanal</span>
        </button>

        <button
          type="button"
          className={`shift-nav-btn ${subTab === "trocas" ? "active" : ""}`}
          onClick={() => setSubTab("trocas")}
        >
          <ArrowLeftRight size={16} />
          <span>Trocas</span>
          {(isAdmin ? pendingSwapsCount : pendingSwapsForMe.length) > 0 && (
            <span className="shift-nav-badge">
              {isAdmin ? pendingSwapsCount : pendingSwapsForMe.length}
            </span>
          )}
        </button>
      </div>

      {/* Banner de Plantão Hoje (para Motoboy) */}
      {subTab === "minha_escala" && myTodayShift && (
        <div className="shift-today-banner">
          <div className="stb-left">
            <div className="stb-tag">Hoje • {myTodayShift.shiftType === "almoco" ? "Almoço" : "Jantar"}</div>
            <div className="stb-time">
              <Clock size={16} /> {myTodayShift.startTime} às {myTodayShift.endTime}
            </div>
            <div className="stb-store">{currentStoreName}</div>
          </div>
          <div className="stb-right">
            {myTodayShift.status === "confirmado" ? (
              <span className="stb-confirmed">
                <Check size={14} /> Presença Confirmada
              </span>
            ) : (
              <button
                type="button"
                className="stb-checkin-btn"
                onClick={async () => {
                  setProcessingId(myTodayShift.id);
                  try {
                    await onCheckInShift(myTodayShift.id);
                    onNotify("Check-in realizado com sucesso! Bom plantão! 🛵");
                  } finally {
                    setProcessingId(null);
                  }
                }}
                disabled={processingId === myTodayShift.id}
              >
                <UserCheck size={16} />
                <span>Confirmar Presença</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controles da Semana */}
      <div className="shift-week-selector">
        <button type="button" className="sws-nav-btn" onClick={prevWeek} title="Semana anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="sws-label">
          {formatShiftDateBR(weekStartStr).split("(")[1]?.replace(")", "") || ""} até{" "}
          {formatShiftDateBR(weekEndStr).split("(")[1]?.replace(")", "") || ""}
        </span>
        <button type="button" className="sws-nav-btn" onClick={nextWeek} title="Próxima semana">
          <ChevronRight size={18} />
        </button>

        {isAdmin && (
          <div className="sws-actions">
            <button
              type="button"
              className="sws-btn-add"
              onClick={() => setIsNewShiftModalOpen(true)}
              title="Adicionar novo plantão"
            >
              <CalendarPlus size={16} />
              <span>Plantão</span>
            </button>
            <button
              type="button"
              className="sws-btn-rep"
              onClick={async () => {
                if (currentWeekShifts.length === 0) {
                  onNotify("Não há plantões nesta semana para replicar.");
                  return;
                }
                const nextMon = new Date(currentMonday);
                nextMon.setDate(nextMon.getDate() + 7);
                const nextMonStr = toDateString(nextMon);
                if (
                  confirm(
                    `Deseja replicar os ${currentWeekShifts.length} plantões desta semana para a próxima semana (${formatShiftDateBR(nextMonStr)})?`
                  )
                ) {
                  await onReplicateWeek(nextMonStr);
                  nextWeek();
                  onNotify("Plantões replicados com sucesso para a próxima semana! 📋");
                }
              }}
              title="Replicar esta semana para a próxima"
            >
              <Repeat size={16} />
            </button>
            <button
              type="button"
              className="sws-btn-wpp"
              onClick={() => setWhatsAppModalOpen(true)}
              title="Compartilhar escala no WhatsApp"
            >
              <Share2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* 1. ABA MINHA ESCALA */}
      {subTab === "minha_escala" && (
        <div className="shift-my-list">
          {/* Se houver trocas solicitadas para mim */}
          {pendingSwapsForMe.length > 0 && (
            <div className="shift-alert-box">
              <div className="sab-title">
                <AlertCircle size={16} />
                <span>Você recebeu {pendingSwapsForMe.length} solicitação(ões) de troca de plantão:</span>
              </div>
              <div className="sab-list">
                {pendingSwapsForMe.map((sw) => (
                  <div key={sw.id} className="sab-item">
                    <div className="sab-desc">
                      <strong>{sw.requestingDriverName}</strong> quer trocar o plantão de{" "}
                      <strong>{formatShiftDateBR(sw.shiftDate)}</strong> ({sw.shiftTime}).
                      {sw.reason && <em> Motivo: "{sw.reason}"</em>}
                    </div>
                    <div className="sab-actions">
                      <button
                        type="button"
                        className="sab-btn-accept"
                        onClick={async () => {
                          await onRespondSwap(sw, true);
                          onNotify(`Você aceitou a troca com ${sw.requestingDriverName}! ✅`);
                        }}
                      >
                        <Check size={14} /> Aceitar
                      </button>
                      <button
                        type="button"
                        className="sab-btn-reject"
                        onClick={async () => {
                          await onRespondSwap(sw, false);
                          onNotify(`Troca recusada.`);
                        }}
                      >
                        <X size={14} /> Recusar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="shift-section-title">Meus Próximos Plantões</h3>

          {myShifts.length === 0 ? (
            <div className="shift-empty-state">
              <Calendar size={36} />
              <p>Você não tem plantões escalados no momento.</p>
              <span className="ses-sub">Avisos e escalas da gerência aparecerão aqui.</span>
            </div>
          ) : (
            <div className="shift-cards-grid">
              {myShifts.map((s) => {
                const isPast = s.date < todayStr;
                const isToday = s.date === todayStr;

                return (
                  <div
                    key={s.id}
                    className={`shift-card ${isToday ? "is-today" : ""} ${isPast ? "is-past" : ""}`}
                  >
                    <div className="sc-header">
                      <div className="sc-date">{formatShiftDateBR(s.date)}</div>
                      <span className={`sc-badge ${s.status}`}>
                        {s.status === "confirmado" ? "Confirmado" : s.status === "agendado" ? "Escalado" : s.status}
                      </span>
                    </div>

                    <div className="sc-time-row">
                      <Clock size={16} />
                      <span>{s.startTime} às {s.endTime}</span>
                      <span className="sc-type-pill">
                        {s.shiftType === "almoco" ? "Almoço" : s.shiftType === "jantar" ? "Jantar" : "Turno"}
                      </span>
                    </div>

                    {s.notes && <div className="sc-notes">Obs: {s.notes}</div>}

                    {!isPast && (
                      <div className="sc-actions">
                        {isToday && s.status !== "confirmado" && (
                          <button
                            type="button"
                            className="sc-btn-checkin"
                            onClick={() => onCheckInShift(s.id)}
                          >
                            <UserCheck size={14} /> Check-in
                          </button>
                        )}
                        <button
                          type="button"
                          className="sc-btn-swap"
                          onClick={() => setSwapTargetShift(s)}
                        >
                          <ArrowLeftRight size={14} /> Solicitar Troca
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. ABA GRADE SEMANAL */}
      {subTab === "grade" && (
        <div className="shift-week-grid">
          {weekDays.map((day) => {
            const dayShifts = currentWeekShifts.filter((s) => s.date === day.dateStr);

            return (
              <div
                key={day.dateStr}
                className={`shift-day-col ${day.isToday ? "is-today" : ""}`}
              >
                <div className="sdc-header">
                  <span className="sdc-title">{day.label}</span>
                  <span className="sdc-count">
                    {dayShifts.length} {dayShifts.length === 1 ? "motoboy" : "motoboys"}
                  </span>
                </div>

                <div className="sdc-shifts-list">
                  {dayShifts.length === 0 ? (
                    <div className="sdc-empty">Sem escala</div>
                  ) : (
                    dayShifts.map((s) => (
                      <div key={s.id} className="sdc-shift-pill">
                        <div className="ssp-top">
                          <span className="ssp-driver">{s.driverName}</span>
                          {isAdmin && (
                            <button
                              type="button"
                              className="ssp-delete"
                              onClick={() => {
                                if (confirm(`Remover plantão de ${s.driverName}?`)) {
                                  onDeleteShift(s.id);
                                }
                              }}
                              title="Remover plantão"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div className="ssp-bottom">
                          <span className="ssp-time">
                            {s.startTime} - {s.endTime}
                          </span>
                          <span className={`ssp-status ${s.status}`}>
                            {s.status === "confirmado" ? "✔ Chegou" : s.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. ABA TROCAS DE ESCALA */}
      {subTab === "trocas" && (
        <div className="shift-swaps-list">
          <h3 className="shift-section-title">Solicitações de Troca de Plantão</h3>

          {swaps.length === 0 ? (
            <div className="shift-empty-state">
              <ArrowLeftRight size={36} />
              <p>Nenhuma solicitação de troca registrada.</p>
              <span className="ses-sub">
                Quando um motoboy solicitar troca de horário, o pedido aparecerá aqui.
              </span>
            </div>
          ) : (
            <div className="swaps-cards-grid">
              {swaps.map((sw) => {
                const isMine = sw.requestingDriverId === currentUser.id;
                const canAccept =
                  sw.status === "pendente" &&
                  !isMine &&
                  (!sw.targetDriverId || sw.targetDriverId === currentUser.id || sw.targetDriverId === "all");

                return (
                  <div key={sw.id} className={`swap-card ${sw.status}`}>
                    <div className="swc-header">
                      <span className="swc-driver">
                        <strong>{sw.requestingDriverName}</strong>
                        {sw.targetDriverName ? ` ➔ ${sw.targetDriverName}` : " ➔ Aberto p/ Qualquer Colega"}
                      </span>
                      <span className={`swc-status-badge ${sw.status}`}>
                        {sw.status === "aprovada"
                          ? "Aprovada"
                          : sw.status === "pendente"
                          ? "Pendente"
                          : sw.status === "aceita"
                          ? "Aguardando Gestor"
                          : sw.status}
                      </span>
                    </div>

                    <div className="swc-body">
                      <div className="swc-info">
                        📅 <strong>{formatShiftDateBR(sw.shiftDate)}</strong> ({sw.shiftTime})
                      </div>
                      {sw.reason && <div className="swc-reason">Motivo: "{sw.reason}"</div>}
                    </div>

                    <div className="swc-footer">
                      {canAccept && (
                        <div className="swc-action-buttons">
                          <button
                            type="button"
                            className="swc-btn-accept"
                            onClick={async () => {
                              await onRespondSwap(sw, true);
                              onNotify("Troca aceita com sucesso!");
                            }}
                          >
                            <Check size={14} /> Aceitar Troca
                          </button>
                          <button
                            type="button"
                            className="swc-btn-reject"
                            onClick={async () => {
                              await onRespondSwap(sw, false);
                              onNotify("Troca recusada.");
                            }}
                          >
                            <X size={14} /> Recusar
                          </button>
                        </div>
                      )}

                      {isAdmin && sw.status === "aceita" && (
                        <button
                          type="button"
                          className="swc-btn-admin-approve"
                          onClick={async () => {
                            await onApproveSwapAdmin(sw);
                            onNotify("Troca aprovada pelo gestor!");
                          }}
                        >
                          <UserCheck size={14} /> Aprovar Troca Oficialmente
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: NOVO PLANTÃO (ADMIN) */}
      {isNewShiftModalOpen && (
        <NewShiftModal
          drivers={drivers}
          defaultDate={todayStr}
          currentStoreId={currentStoreId}
          onClose={() => setIsNewShiftModalOpen(false)}
          onSave={async (shift) => {
            await onSaveShift(shift);
            setIsNewShiftModalOpen(false);
            onNotify(`Plantão de ${shift.driverName} agendado! 📅`);
          }}
        />
      )}

      {/* MODAL: SOLICITAR TROCA (MOTOBOY) */}
      {swapTargetShift && (
        <RequestSwapModal
          shift={swapTargetShift}
          drivers={drivers.filter((d) => d.id !== currentUser.id && d.active !== false)}
          onClose={() => setSwapTargetShift(null)}
          onConfirm={async (targetDriverId, reason) => {
            const target = drivers.find((d) => d.id === targetDriverId);
            await onRequestSwap({
              shift: swapTargetShift,
              targetDriverId: target?.id,
              targetDriverName: target?.name,
              reason,
            });
            setSwapTargetShift(null);
            onNotify("Solicitação de troca enviada aos colegas! 🔄");
          }}
        />
      )}

      {/* MODAL: COMPARTILHAR WHATSAPP */}
      {whatsAppModalOpen && (
        <WhatsAppScheduleModal
          shifts={currentWeekShifts}
          startDate={weekStartStr}
          endDate={weekEndStr}
          storeName={currentStoreName}
          onClose={() => setWhatsAppModalOpen(false)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}

// ==========================================
// SUB-MODAIS DE APOIO
// ==========================================

function NewShiftModal({
  drivers,
  defaultDate,
  currentStoreId,
  onClose,
  onSave,
}: {
  drivers: Driver[];
  defaultDate: string;
  currentStoreId: string;
  onClose: () => void;
  onSave: (shift: Shift) => Promise<void>;
}) {
  const [driverId, setDriverId] = useState(drivers[0]?.id || "");
  const [date, setDate] = useState(defaultDate);
  const [shiftType, setShiftType] = useState<ShiftType>("jantar");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("23:30");
  const [notes, setNotes] = useState("");

  const handleTypePreset = (type: ShiftType) => {
    setShiftType(type);
    if (type === "almoco") {
      setStartTime("11:00");
      setEndTime("15:00");
    } else if (type === "jantar") {
      setStartTime("18:00");
      setEndTime("23:30");
    } else if (type === "integral") {
      setStartTime("11:00");
      setEndTime("23:30");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = drivers.find((x) => x.id === driverId);
    if (!d) return;

    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      driverId: d.id,
      driverName: d.name,
      driverPhone: d.phone,
      date,
      startTime,
      endTime,
      shiftType,
      storeId: currentStoreId,
      status: "agendado",
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    void onSave(newShift);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content shift-modal">
        <div className="modal-header">
          <h3>Adicionar Plantão na Escala</h3>
          <button type="button" onClick={onClose} className="btn-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="shift-form">
          <label>
            <span>Motoboy:</span>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.phone ? `(${d.phone})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Data:</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>

          <div className="shift-presets-row">
            <span>Atalho de Turno:</span>
            <div className="presets-buttons">
              <button
                type="button"
                className={`preset-btn ${shiftType === "almoco" ? "active" : ""}`}
                onClick={() => handleTypePreset("almoco")}
              >
                ☀️ Almoço (11h-15h)
              </button>
              <button
                type="button"
                className={`preset-btn ${shiftType === "jantar" ? "active" : ""}`}
                onClick={() => handleTypePreset("jantar")}
              >
                🌙 Jantar (18h-23h30)
              </button>
              <button
                type="button"
                className={`preset-btn ${shiftType === "integral" ? "active" : ""}`}
                onClick={() => handleTypePreset("integral")}
              >
                ⏰ Integral
              </button>
            </div>
          </div>

          <div className="form-row-2">
            <label>
              <span>Início:</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Fim:</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
          </div>

          <label>
            <span>Observação (opcional):</span>
            <input
              type="text"
              placeholder="Ex: Fica de apoio no salão"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button type="submit" className="btn-save">
              Salvar Plantão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RequestSwapModal({
  shift,
  drivers,
  onClose,
  onConfirm,
}: {
  shift: Shift;
  drivers: Driver[];
  onClose: () => void;
  onConfirm: (targetDriverId?: string, reason?: string) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState<string>("all");
  const [reason, setReason] = useState("");

  return (
    <div className="modal-overlay">
      <div className="modal-content shift-modal">
        <div className="modal-header">
          <h3>Solicitar Troca de Plantão</h3>
          <button type="button" onClick={onClose} className="btn-close">
            <X size={18} />
          </button>
        </div>

        <div className="swap-modal-summary">
          <div>
            Plantão: <strong>{formatShiftDateBR(shift.date)}</strong>
          </div>
          <div>
            Horário: <strong>{shift.startTime} às {shift.endTime}</strong>
          </div>
        </div>

        <div className="shift-form">
          <label>
            <span>Trocar com quem?</span>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="all">📢 Qualquer Motoboy (Aberto para o grupo)</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  👤 {d.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Motivo da troca (opcional):</span>
            <input
              type="text"
              placeholder="Ex: Consulta médica, imprevisto pessoal..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-cancel">
              Cancelar
            </button>
            <button
              type="button"
              className="btn-save"
              onClick={() => onConfirm(targetId === "all" ? undefined : targetId, reason)}
            >
              Enviar Solicitação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppScheduleModal({
  shifts,
  startDate,
  endDate,
  storeName,
  onClose,
  onNotify,
}: {
  shifts: Shift[];
  startDate: string;
  endDate: string;
  storeName: string;
  onClose: () => void;
  onNotify: (msg: string) => void;
}) {
  const text = useMemo(() => {
    return generateWhatsAppScheduleText(shifts, startDate, endDate, storeName);
  }, [shifts, startDate, endDate, storeName]);

  const copyToClipboard = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      onNotify("Escala copiada! Cole agora no grupo do WhatsApp. 📋");
    }
  };

  const openWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content shift-modal">
        <div className="modal-header">
          <h3>Escala Formatada para WhatsApp</h3>
          <button type="button" onClick={onClose} className="btn-close">
            <X size={18} />
          </button>
        </div>

        <div className="wpp-text-preview">
          <textarea readOnly value={text} rows={12} />
        </div>

        <div className="modal-actions">
          <button type="button" onClick={copyToClipboard} className="btn-copy">
            <Copy size={16} /> Copiar Texto
          </button>
          <button type="button" onClick={openWhatsApp} className="btn-whatsapp">
            <Share2 size={16} /> Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
