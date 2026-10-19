import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Bike,
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  Navigation,
  ArrowRight,
  ExternalLink,
  ChevronDown
} from "lucide-react";
import type { Delivery, Driver } from "../types";

interface KanbanExpeditionBoardProps {
  deliveries?: Delivery[];
  drivers?: Driver[];
  onAssignDriver: (deliveryId: string, driverId: string) => void;
  onUpdateStatus: (deliveryId: string, status: Delivery["status"]) => void;
  onMarkDelivered: (deliveryId: string) => void;
  onNotify?: (msg: string) => void;
}

function getMinutesElapsed(dateStr?: string): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60)));
}

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function KanbanExpeditionBoard({
  deliveries = [],
  drivers = [],
  onAssignDriver,
  onUpdateStatus,
  onMarkDelivered,
  onNotify,
}: KanbanExpeditionBoardProps) {
  const safeDeliveries = useMemo(() => Array.isArray(deliveries) ? deliveries : [], [deliveries]);
  const safeDrivers = useMemo(() => Array.isArray(drivers) ? drivers : [], [drivers]);

  // Atualiza os minutos decorridos a cada 30 segundos
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // 1. Balcão / Preparando: "Aguardando" ou "Pronta para sair"
  const colBalcao = useMemo(() => {
    return safeDeliveries.filter((d) => {
      const st = (d.status || "").toLowerCase();
      return st === "aguardando" || st === "pronta para sair" || st === "open" || st === "ready" || !st;
    });
  }, [safeDeliveries]);

  // 2. Em Rota: "Em rota" / "dispatched" / "ongoing"
  const colEmRota = useMemo(() => {
    return safeDeliveries.filter((d) => {
      const st = (d.status || "").toLowerCase();
      return st === "em rota" || st === "dispatched" || st === "ongoing";
    });
  }, [safeDeliveries]);

  // 3. Entregues: "Entregue" / "delivered"
  const colEntregues = useMemo(() => {
    return safeDeliveries.filter((d) => {
      const st = (d.status || "").toLowerCase();
      return st === "entregue" || st === "delivered" || st === "completed";
    });
  }, [safeDeliveries]);

  const totalEntreguesAmount = colEntregues.reduce((acc, d) => acc + (d.amount || 0), 0);

  return (
    <div className="kanban-expedition-container">
      {/* 3 Colunas de Expedição */}
      <div className="kanban-grid">
        {/* COLUNA 1: PREPARANDO / BALCÃO */}
        <section className="kanban-column balcao">
          <div className="kanban-col-header">
            <div className="kanban-col-title-wrap">
              <div className="kanban-col-icon balcao">
                <Clock size={16} />
              </div>
              <div>
                <h3 className="kanban-col-title">Preparando / Balcão</h3>
                <span className="kanban-col-sub">Aguardando saída da loja</span>
              </div>
            </div>
            <span className="kanban-count-badge balcao">{colBalcao.length}</span>
          </div>

          <div className="kanban-card-list">
            {colBalcao.length === 0 ? (
              <div className="kanban-empty">
                <span>Nenhum pedido no balcão</span>
              </div>
            ) : (
              colBalcao.map((d) => {
                const elapsedMin = getMinutesElapsed(d.createdAt || d.time);
                const isLate = elapsedMin >= 20;
                const isWarning = elapsedMin >= 10 && elapsedMin < 20;

                return (
                  <article key={d.id} className={`kanban-card ${isLate ? "is-late" : isWarning ? "is-warning" : ""}`}>
                    <div className="kanban-card-top">
                      <div className="kanban-order-badge">
                        <b>{d.order}</b>
                        {d.platform === "ifood" ? (
                          <span className="kanban-tag ifood">iFood</span>
                        ) : (
                          <span className="kanban-tag loja">Loja</span>
                        )}
                      </div>
                      <span className={`kanban-elapsed-pill ${isLate ? "late" : isWarning ? "warn" : ""}`}>
                        {isLate && <AlertTriangle size={11} />}
                        {elapsedMin} min no balcão
                      </span>
                    </div>

                    <div className="kanban-card-customer">
                      <b className="kanban-customer-name">{d.customer || "Cliente"}</b>
                      <span className="kanban-customer-address">
                        {d.address} {d.district ? `· ${d.district}` : ""}
                      </span>
                    </div>

                    <div className="kanban-card-finance">
                      {d.isPaidOnline ? (
                        <span className="kanban-paid-online">Pago Online ({money(d.amount)})</span>
                      ) : (
                        <span className="kanban-to-collect">Cobrar: {money(d.amount)} ({d.payment || "A Cobrar"})</span>
                      )}
                    </div>

                    {/* Despacho & Atribuição de Motoboy */}
                    <div className="kanban-card-actions">
                      <div className="kanban-driver-select-wrap">
                        <User size={13} style={{ color: "var(--muted)" }} />
                        <select
                          value={d.driverId || ""}
                          onChange={(e) => onAssignDriver(d.id, e.target.value)}
                          className="kanban-driver-select"
                        >
                          <option value="">Atribuir motoboy...</option>
                          {safeDrivers.map((drv) => (
                            <option key={drv.id} value={drv.id}>
                              {drv.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onUpdateStatus(d.id, "Em rota");
                          onNotify?.(`Pedido ${d.order} despachado em rota.`);
                        }}
                        className="kanban-btn-dispatch"
                        title="Despachar pedido para a rua"
                      >
                        <Bike size={14} />
                        <span>Despachar</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* COLUNA 2: NA RUA / EM ROTA */}
        <section className="kanban-column em-rota">
          <div className="kanban-col-header">
            <div className="kanban-col-title-wrap">
              <div className="kanban-col-icon em-rota">
                <Bike size={16} />
              </div>
              <div>
                <h3 className="kanban-col-title">Na Rua / Em Rota</h3>
                <span className="kanban-col-sub">Com os motoboys a caminho</span>
              </div>
            </div>
            <span className="kanban-count-badge em-rota">{colEmRota.length}</span>
          </div>

          <div className="kanban-card-list">
            {colEmRota.length === 0 ? (
              <div className="kanban-empty">
                <span>Nenhuma moto na rua no momento</span>
              </div>
            ) : (
              colEmRota.map((d) => {
                const elapsedMin = getMinutesElapsed(d.createdAt || d.time);

                return (
                  <article key={d.id} className="kanban-card em-rota-card">
                    <div className="kanban-card-top">
                      <div className="kanban-order-badge">
                        <b>{d.order}</b>
                        {d.platform === "ifood" ? (
                          <span className="kanban-tag ifood">iFood</span>
                        ) : (
                          <span className="kanban-tag loja">Loja</span>
                        )}
                      </div>
                      <span className="kanban-elapsed-pill transit">
                        {elapsedMin} min na rua
                      </span>
                    </div>

                    {/* Destaque do Motoboy Responsável */}
                    <div className="kanban-driver-banner">
                      <div className="kanban-driver-avatar">
                        <Bike size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b className="kanban-driver-name">{d.driver || "Motoboy não identificado"}</b>
                        {d.driverPhone && <span className="kanban-driver-phone">{d.driverPhone}</span>}
                      </div>
                    </div>

                    <div className="kanban-card-customer">
                      <b className="kanban-customer-name">{d.customer || "Cliente"}</b>
                      <span className="kanban-customer-address">
                        {d.address} {d.district ? `· ${d.district}` : ""}
                      </span>
                    </div>

                    <div className="kanban-card-finance">
                      {d.isPaidOnline ? (
                        <span className="kanban-paid-online">Pago Online ({money(d.amount)})</span>
                      ) : (
                        <span className="kanban-to-collect">Cobrar: {money(d.amount)} ({d.payment || "A Cobrar"})</span>
                      )}
                    </div>

                    <div className="kanban-card-actions">
                      <button
                        type="button"
                        onClick={() => onMarkDelivered(d.id)}
                        className="kanban-btn-delivered"
                        title="Marcar como entregue"
                      >
                        <CheckCircle2 size={15} />
                        <span>Confirmar Entrega</span>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* COLUNA 3: ENTREGUES HOJE */}
        <section className="kanban-column entregue">
          <div className="kanban-col-header">
            <div className="kanban-col-title-wrap">
              <div className="kanban-col-icon entregue">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <h3 className="kanban-col-title">Entregues Hoje</h3>
                <span className="kanban-col-sub">Histórico da noite</span>
              </div>
            </div>
            <span className="kanban-count-badge entregue">{colEntregues.length}</span>
          </div>

          <div className="kanban-card-list">
            {colEntregues.length === 0 ? (
              <div className="kanban-empty">
                <span>Nenhuma entrega finalizada ainda hoje</span>
              </div>
            ) : (
              colEntregues.map((d) => (
                <article key={d.id} className="kanban-card delivered-card">
                  <div className="kanban-card-top">
                    <div className="kanban-order-badge">
                      <b>{d.order}</b>
                      {d.platform === "ifood" ? (
                        <span className="kanban-tag ifood">iFood</span>
                      ) : (
                        <span className="kanban-tag loja">Loja</span>
                      )}
                    </div>
                    <span className="kanban-delivered-time">
                      {d.deliveredAt
                        ? new Date(d.deliveredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                        : "Concluído"}
                    </span>
                  </div>

                  <div className="kanban-card-customer">
                    <b className="kanban-customer-name">{d.customer || "Cliente"}</b>
                    <span className="kanban-customer-address">
                      {d.address} {d.district ? `· ${d.district}` : ""}
                    </span>
                  </div>

                  <div className="kanban-card-footer-delivered">
                    <span className="kanban-driver-tag">{d.driver || "Entregador"}</span>
                    <b className="kanban-delivered-amount">{money(d.amount)}</b>
                  </div>
                </article>
              ))
            )}
          </div>

          {colEntregues.length > 0 && (
            <div className="kanban-column-footer">
              <span>Total da Noite:</span>
              <b>{money(totalEntreguesAmount)}</b>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
