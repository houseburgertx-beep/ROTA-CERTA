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
  Plus,
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
  const [newShiftPreselectedDate, setNewShiftPreselectedDate] = useState<string | null>(null);
  const [swapTargetShift, setSwapTargetShift] = useState<Shift | null>(null);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Dias da semana atual (Segunda a Domingo)
  const weekDays = useMemo(() => {
    const days: { dateStr: string; dayName: string; formattedDate: string; isToday: boolean }[] = [];
    const todayStr = toDateString(new Date());

    const dayNames = [
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
      "Domingo",
    ];

    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(d.getDate() + i);
      const dateStr = toDateString(d);
      const formattedDate = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayName: dayNames[i],
        formattedDate,
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [currentMonday]);

  const weekStartStr = weekDays[0].dateStr;
  const weekEndStr = weekDays[6].dateStr;
  const isCurrentWeek = weekDays.some((d) => d.isToday);

  // Plantões do motoboy logado (ordenados cronologicamente a partir de hoje)
  const todayStr = toDateString(new Date());
  const myShifts = useMemo(() => {
    return shifts
      .filter(
        (s) =>
          s.driverId === currentUser.id ||
          (s.driverName && s.driverName.toLowerCase() === currentUser.name.toLowerCase())
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shifts, currentUser]);

  // Plantão de hoje do motoboy logado
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

  const openAddShiftForDate = (dateStr?: string) => {
    setNewShiftPreselectedDate(dateStr || todayStr);
    setIsNewShiftModalOpen(true);
  };

  return (
    <div className="shift-view-container">
      {/* 1. Sub-navegação Estilo Segmented Control Minimalista */}
      <div className="shift-nav-header">
        <button
          type="button"
          className={`shift-nav-btn ${subTab === "minha_escala" ? "active" : ""}`}
          onClick={() => setSubTab("minha_escala")}
        >
          <CalendarCheck size={15} />
          <span>Minha Escala</span>
          {myTodayShift && <span className="shift-pulse-dot" title="Plantão ativo hoje" />}
        </button>

        <button
          type="button"
          className={`shift-nav-btn ${subTab === "grade" ? "active" : ""}`}
          onClick={() => setSubTab("grade")}
        >
          <Calendar size={15} />
          <span>Grade Semanal</span>
        </button>

        <button
          type="button"
          className={`shift-nav-btn ${subTab === "trocas" ? "active" : ""}`}
          onClick={() => setSubTab("trocas")}
        >
          <ArrowLeftRight size={15} />
          <span>Trocas</span>
          {(isAdmin ? pendingSwapsCount : pendingSwapsForMe.length) > 0 && (
            <span className="shift-nav-badge">
              {isAdmin ? pendingSwapsCount : pendingSwapsForMe.length}
            </span>
          )}
        </button>
      </div>

      {/* 2. ABA 1: MINHA ESCALA (MINIMALISTA E DIRETA) */}
      {subTab === "minha_escala" && (
        <div className="shift-my-list">
          {/* Se houver trocas solicitadas para mim */}
          {pendingSwapsForMe.length > 0 && (
            <div className="shift-alert-box">
              <div className="sab-title">
                <AlertCircle size={15} />
                <span>{pendingSwapsForMe.length} proposta(s) de troca para você:</span>
              </div>
              <div className="sab-list">
                {pendingSwapsForMe.map((sw) => (
                  <div key={sw.id} className="sab-item">
                    <div className="sab-desc">
                      <strong>{sw.requestingDriverName}</strong> solicitou passar o plantão de{" "}
                      <strong>{formatShiftDateBR(sw.shiftDate)}</strong> ({sw.shiftTime}).
                      {sw.reason && <em> Motivo: "{sw.reason}"</em>}
                    </div>
                    <div className="sab-actions">
                      <button
                        type="button"
                        className="sab-btn-accept"
                        onClick={async () => {
                          await onRespondSwap(sw, true);
                          onNotify(`Você aceitou a troca com ${sw.requestingDriverName}.`);
                        }}
                      >
                        <Check size={14} /> Aceitar
                      </button>
                      <button
                        type="button"
                        className="sab-btn-reject"
                        onClick={async () => {
                          await onRespondSwap(sw, false);
                          onNotify("Troca recusada.");
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

          {myShifts.length === 0 ? (
            <div className="shift-empty-card">
              <div className="sec-icon">
                <CalendarCheck size={28} />
              </div>
              <h3>Você não tem plantões escalados</h3>
              <p>Nenhum turno agendado no seu nome para os próximos dias.</p>
              <div className="sec-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => setSubTab("grade")}
                >
                  <Users size={15} />
                  <span>Ver Grade Semanal da Loja</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="shift-cards-container">
              <div className="shift-cards-grid">
                {myShifts.map((s) => {
                  const isPast = s.date < todayStr;
                  const isToday = s.date === todayStr;

                  return (
                    <div
                      key={s.id}
                      className={`shift-card-mini ${isToday ? "is-today" : ""} ${isPast ? "is-past" : ""}`}
                    >
                      <div className="scm-left">
                        <div className="scm-title-row">
                          <span className="scm-day-name">{formatShiftDateBR(s.date)}</span>
                          {isToday && <span className="scm-today-badge">Hoje</span>}
                        </div>
                        <div className="scm-time-row">
                          <Clock size={12} />
                          <span>{s.startTime} às {s.endTime}</span>
                        </div>
                      </div>

                      <div className="scm-right">
                        {isToday && s.status !== "confirmado" ? (
                          <button
                            type="button"
                            className="scm-btn-checkin"
                            onClick={async () => {
                              setProcessingId(s.id);
                              try {
                                await onCheckInShift(s.id);
                                onNotify("Presença confirmada no plantão.");
                              } finally {
                                setProcessingId(null);
                              }
                            }}
                            disabled={processingId === s.id}
                          >
                            <UserCheck size={13} />
                            <span>Confirmar Presença</span>
                          </button>
                        ) : (
                          <span className={`scm-status-pill ${s.status}`}>
                            {s.status === "confirmado" ? "Confirmado" : "Escalado"}
                          </span>
                        )}

                        {!isPast && (
                          <button
                            type="button"
                            className="scm-btn-swap"
                            onClick={() => setSwapTargetShift(s)}
                            title="Trocar este plantão"
                          >
                            <ArrowLeftRight size={12} />
                            <span>Trocar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. ABA 2: GRADE SEMANAL (COM SELETOR DE SEMANA) */}
      {subTab === "grade" && (
        <div className="shift-grade-wrapper">
          {/* Seletor de Semana */}
          <div className="shift-week-selector">
            <div className="sws-left-controls">
              <button type="button" className="sws-nav-btn" onClick={prevWeek} title="Semana anterior">
                <ChevronLeft size={16} />
              </button>
              <div className="sws-label-box">
                <span className="sws-label">
                  {weekDays[0].formattedDate} até {weekDays[6].formattedDate}
                </span>
                {isCurrentWeek && <span className="sws-current-badge">Semana Atual</span>}
              </div>
              <button type="button" className="sws-nav-btn" onClick={nextWeek} title="Próxima semana">
                <ChevronRight size={16} />
              </button>
            </div>

            {isAdmin && (
              <div className="sws-actions">
                <button
                  type="button"
                  className="sws-btn-add"
                  onClick={() => openAddShiftForDate()}
                  title="Adicionar novo plantão"
                >
                  <CalendarPlus size={14} />
                  <span>+ Plantão</span>
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
                      onNotify("Plantões replicados com sucesso para a próxima semana.");
                    }
                  }}
                  title="Replicar esta semana para a próxima"
                >
                  <Repeat size={14} />
                  <span className="sws-btn-text-desktop">Replicar</span>
                </button>
                <button
                  type="button"
                  className="sws-btn-wpp"
                  onClick={() => setWhatsAppModalOpen(true)}
                  title="Compartilhar escala no WhatsApp"
                >
                  <Share2 size={14} />
                  <span className="sws-btn-text-desktop">WhatsApp</span>
                </button>
              </div>
            )}
          </div>

          <div className="shift-week-grid">
            {weekDays.map((day) => {
              const dayShifts = currentWeekShifts.filter((s) => s.date === day.dateStr);

              return (
                <div
                  key={day.dateStr}
                  className={`shift-day-col ${day.isToday ? "is-today" : ""}`}
                >
                  <div className="sdc-header">
                    <div className="sdc-header-left">
                      <span className="sdc-day-title">{day.dayName}</span>
                      <span className="sdc-date-pill">{day.formattedDate}</span>
                      {day.isToday && <span className="sdc-today-pill">Hoje</span>}
                    </div>

                    <div className="sdc-header-right">
                      <span className="sdc-count-pill">
                        {dayShifts.length === 0
                          ? "Folga geral"
                          : `${dayShifts.length} ${dayShifts.length === 1 ? "motoboy" : "motoboys"}`}
                      </span>
                      {isAdmin && (
                        <button
                          type="button"
                          className="sdc-btn-add-inline"
                          onClick={() => openAddShiftForDate(day.dateStr)}
                          title={`Escalar motoboy para ${day.dayName}`}
                        >
                          <Plus size={13} />
                          <span>Escalar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="sdc-shifts-list">
                    {dayShifts.length === 0 ? (
                      <div className="sdc-empty-box">
                        <span>Sem plantonistas agendados</span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="sdc-empty-link"
                            onClick={() => openAddShiftForDate(day.dateStr)}
                          >
                            + Adicionar
                          </button>
                        )}
                      </div>
                    ) : (
                      dayShifts.map((s) => {
                        const isMe =
                          s.driverId === currentUser.id ||
                          (s.driverName && s.driverName.toLowerCase() === currentUser.name.toLowerCase());

                        return (
                          <div
                            key={s.id}
                            className={`sdc-shift-pill ${isMe ? "is-me" : ""}`}
                          >
                            <div className="ssp-left">
                              <div className="ssp-avatar">
                                {s.driverName.charAt(0).toUpperCase()}
                              </div>
                              <div className="ssp-info">
                                <span className="ssp-driver">
                                  {s.driverName} {isMe && <strong className="ssp-me-tag">(Você)</strong>}
                                </span>
                                <div className="ssp-meta">
                                  <span className="ssp-time">
                                    <Clock size={11} /> {s.startTime} - {s.endTime}
                                  </span>
                                  <span className={`ssp-status ${s.status}`}>
                                    {s.status === "confirmado" ? "Presente" : "Escalado"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {isAdmin && (
                              <button
                                type="button"
                                className="ssp-delete"
                                onClick={() => {
                                  if (confirm(`Remover o plantão de ${s.driverName} em ${day.formattedDate}?`)) {
                                    onDeleteShift(s.id);
                                  }
                                }}
                                title="Remover plantão"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. ABA 3: TROCAS DE ESCALA */}
      {subTab === "trocas" && (
        <div className="shift-swaps-list">
          <div className="scc-header">
            <h3 className="shift-section-title">Solicitações de Troca</h3>
            <span className="scc-count-pill">{swaps.length} registrada(s)</span>
          </div>

          {swaps.length === 0 ? (
            <div className="shift-empty-card">
              <div className="sec-icon">
                <ArrowLeftRight size={28} />
              </div>
              <h3>Nenhuma troca pendente</h3>
              <p>Quando alguém pedir troca de plantão, ela aparecerá aqui.</p>
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
                      <div className="swc-drivers-flow">
                        <strong>{sw.requestingDriverName}</strong>
                        <ArrowLeftRight size={12} className="swc-arrow" />
                        <span className="swc-target">
                          {sw.targetDriverName || "Aberto para a equipe"}
                        </span>
                      </div>
                      <span className={`swc-status-badge ${sw.status}`}>
                        {sw.status === "aprovada"
                          ? "Aprovada"
                          : sw.status === "pendente"
                          ? "Pendente"
                          : sw.status === "aceita"
                          ? "Aguardando Loja"
                          : sw.status === "recusada"
                          ? "Recusada"
                          : sw.status}
                      </span>
                    </div>

                    <div className="swc-body">
                      <div className="swc-info">
                        <Calendar size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                        <strong>{formatShiftDateBR(sw.shiftDate)}</strong> • {sw.shiftTime}
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
                              onNotify("Troca aceita com sucesso.");
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
                            onNotify("Troca aprovada pelo gestor.");
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

      {/* 5. MODAIS */}
      {isNewShiftModalOpen && (
        <NewShiftModal
          drivers={drivers}
          defaultDate={newShiftPreselectedDate || todayStr}
          currentStoreId={currentStoreId}
          onClose={() => {
            setIsNewShiftModalOpen(false);
            setNewShiftPreselectedDate(null);
          }}
          onSave={async (shift) => {
            await onSaveShift(shift);
            setIsNewShiftModalOpen(false);
            setNewShiftPreselectedDate(null);
            onNotify(`Plantão de ${shift.driverName} agendado.`);
          }}
        />
      )}

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
            onNotify("Solicitação de troca enviada.");
          }}
        />
      )}

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
// SUB-MODAIS DE APOIO (CLEAN & EMOJI-FREE)
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
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "460px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">
              <Calendar size={13} /> Escala
            </span>
            <h2>Adicionar Plantão</h2>
            <p>Selecione o motoboy e o horário do turno.</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "18px 20px" }}>
          <div className="form-grid">
            <label className="full">
              Motoboy
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} required>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="full">
              Data do Plantão
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <div className="full">
              <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--muted)", display: "block", marginBottom: "6px" }}>
                Horário Padrão
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <button
                  type="button"
                  className={`preset-btn ${shiftType === "almoco" ? "active" : ""}`}
                  onClick={() => handleTypePreset("almoco")}
                >
                  Almoço (11h-15h)
                </button>
                <button
                  type="button"
                  className={`preset-btn ${shiftType === "jantar" ? "active" : ""}`}
                  onClick={() => handleTypePreset("jantar")}
                >
                  Noite (18h-23h30)
                </button>
                <button
                  type="button"
                  className={`preset-btn ${shiftType === "integral" ? "active" : ""}`}
                  onClick={() => handleTypePreset("integral")}
                >
                  Integral
                </button>
              </div>
            </div>

            <label>
              Início
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>

            <label>
              Término
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>

            <label className="full">
              Observação (Opcional)
              <input
                type="text"
                placeholder="Ex: Apoio no salão, primeiro turno..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: "18px" }}>
            <button type="button" onClick={onClose} className="text-btn" style={{ padding: "10px 16px", borderRadius: "12px" }}>
              Cancelar
            </button>
            <button type="submit" className="primary" style={{ borderRadius: "12px", minWidth: "140px" }}>
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "460px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">
              <ArrowLeftRight size={13} /> Troca de Plantão
            </span>
            <h2>Solicitar Troca</h2>
            <p>Selecione um colega ou disponibilize para a equipe.</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "18px 20px" }}>
          {/* Card Resumo do Plantão */}
          <div className="swap-modal-summary">
            <div className="sms-row">
              <span className="sms-label">Plantão</span>
              <span className="sms-value">{formatShiftDateBR(shift.date)}</span>
            </div>
            <div className="sms-row">
              <span className="sms-label">Horário</span>
              <span className="sms-value">{shift.startTime} às {shift.endTime}</span>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: "14px" }}>
            <label className="full">
              Passar plantão para
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="all">Qualquer motoboy da equipe</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.phone ? `(${d.phone})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="full">
              Motivo (opcional)
              <input
                type="text"
                placeholder="Informe o motivo da solicitação..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: "20px" }}>
            <button
              type="button"
              onClick={onClose}
              className="text-btn"
              style={{ padding: "10px 16px", borderRadius: "12px" }}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              style={{ borderRadius: "12px", minWidth: "150px" }}
              disabled={isSubmitting}
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  await onConfirm(targetId === "all" ? undefined : targetId, reason);
                } finally {
                  setIsSubmitting(false);
                }
              }}
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
      onNotify("Escala copiada para a área de transferência.");
    }
  };

  const openWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">
              <Share2 size={13} /> Exportação
            </span>
            <h2>Escala para WhatsApp</h2>
            <p>Texto formatado pronto para enviar no grupo da equipe.</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "18px 20px" }}>
          <div className="wpp-text-preview">
            <textarea readOnly value={text} rows={12} />
          </div>

          <div className="modal-actions" style={{ marginTop: "16px" }}>
            <button type="button" onClick={copyToClipboard} className="text-btn" style={{ display: "flex", alignItems: "center", gap: "6px", borderRadius: "12px" }}>
              <Copy size={15} /> Copiar Texto
            </button>
            <button type="button" onClick={openWhatsApp} className="primary" style={{ background: "#25d366", borderColor: "#25d366", borderRadius: "12px" }}>
              <Share2 size={15} /> Abrir WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
