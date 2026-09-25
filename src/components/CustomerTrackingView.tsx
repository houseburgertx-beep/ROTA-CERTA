import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  Bike,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  ShieldCheck,
  Store,
} from "lucide-react";
import { subscribeToDeliveryByIdRTDB } from "../services/realtimeDbService";
import type { Delivery } from "../types";

const STORE_COORDS = {
  name: "House Burger",
  phone: "73998001122",
  displayPhone: "(73) 99800-1122",
  latitude: -17.5399,
  longitude: -39.7414,
};

interface CustomerTrackingViewProps {
  deliveryId: string;
}

export function CustomerTrackingView({ deliveryId }: CustomerTrackingViewProps) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);

  // Assina a entrega em tempo real no RTDB
  useEffect(() => {
    if (!deliveryId) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToDeliveryByIdRTDB(
      deliveryId,
      (del) => {
        setDelivery(del);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, [deliveryId]);

  // Inicializa e atualiza o mapa Leaflet dinamicamente
  useEffect(() => {
    if (!mapContainerRef.current || !delivery) return;

    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !mapContainerRef.current) return;

      const destLat = delivery.latitude || STORE_COORDS.latitude;
      const destLng = delivery.longitude || STORE_COORDS.longitude;
      const driverLat = delivery.driverLocation?.latitude;
      const driverLng = delivery.driverLocation?.longitude;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([destLat, destLng], 15);

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Marcador da Loja (House Burger)
      const storeIcon = L.divIcon({
        className: "custom-map-icon",
        html: `<div style="background:#e11d48;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(225,29,72,0.4);border:2px solid #fff;font-size:16px;">🍔</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      L.marker([STORE_COORDS.latitude, STORE_COORDS.longitude], { icon: storeIcon })
        .bindTooltip("<b>House Burger</b><br>Origem do Pedido", { direction: "top" })
        .addTo(map);

      // Marcador da Casa do Cliente
      if (delivery.latitude && delivery.longitude) {
        const homeIcon = L.divIcon({
          className: "custom-map-icon",
          html: `<div style="background:#2563eb;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(37,99,235,0.4);border:2px solid #fff;font-size:16px;">🏠</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([destLat, destLng], { icon: homeIcon })
          .bindTooltip(`<b>Seu Endereço</b><br>${delivery.address}`, { direction: "top" })
          .addTo(map);
      }

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Atualiza ou cria o marcador animado da moto
    if (driverLat && driverLng) {
      const bikeIcon = L.divIcon({
        className: "custom-map-icon-bike",
        html: `
          <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="position:absolute;width:100%;height:100%;border-radius:50%;background:#16a34a;opacity:0.3;animation:pulse-marker 1.5s infinite;"></div>
            <div style="position:relative;background:#16a34a;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(22,163,74,0.5);border:2.5px solid #fff;font-size:17px;">
              🛵
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      if (!driverMarkerRef.current) {
        driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: bikeIcon })
          .bindTooltip(`<b>${delivery.driver || "Motoboy"} a caminho!</b>`, { direction: "top", permanent: true })
          .addTo(map);
      } else {
        driverMarkerRef.current.setLatLng([driverLat, driverLng]);
      }

      // Enquadra a moto e o destino juntos
      const points: Array<[number, number]> = [
        [STORE_COORDS.latitude, STORE_COORDS.longitude],
        [driverLat, driverLng],
      ];
      if (delivery.latitude && delivery.longitude) {
        points.push([delivery.latitude, delivery.longitude]);
      }
      try {
        map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
      } catch {}
    } else if (delivery.latitude && delivery.longitude) {
      try {
        map.fitBounds(
          L.latLngBounds([
            [STORE_COORDS.latitude, STORE_COORDS.longitude],
            [destLat, destLng],
          ]),
          { padding: [40, 40], maxZoom: 16 },
        );
      } catch {}
    }

      // Força recalcular tamanho da tela em mobile
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    });

    return () => {
      active = false;
    };
  }, [delivery]);

  // Se estiver carregando
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#09090b", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ width: "42px", height: "42px", border: "3px solid #27272a", borderTopColor: "#e11d48", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <p style={{ marginTop: "16px", fontSize: "14px", color: "#a1a1aa", fontWeight: 600 }}>Carregando rastreio do pedido...</p>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Se não encontrar o pedido
  if (!delivery) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#09090b", color: "#fff", padding: "20px", textAlign: "center", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔍</div>
        <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 8px 0" }}>Pedido não encontrado</h2>
        <p style={{ color: "#a1a1aa", fontSize: "14px", maxWidth: "340px", lineHeight: 1.5, margin: "0 0 24px 0" }}>
          O link de rastreio pode estar expirado ou o pedido ainda não foi registrado pelo restaurante.
        </p>
        <a
          href={`https://api.whatsapp.com/send?phone=55${STORE_COORDS.phone}&text=${encodeURIComponent("Olá House Burger! Gostaria de informações sobre meu pedido.")}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ background: "#25D366", color: "#fff", textDecoration: "none", padding: "12px 20px", borderRadius: "12px", fontWeight: 800, fontSize: "14px", display: "flex", alignItems: "center", gap: "8px" }}
        >
          <MessageSquare size={18} /> Falar com a Loja no WhatsApp
        </a>
      </div>
    );
  }

  const rawStatus = (delivery.status || "").toLowerCase();
  const isDelivered = rawStatus === "entregue" || rawStatus === "delivered";
  const isOnRoute = rawStatus === "em rota" || rawStatus === "em_rota" || rawStatus === "on_route";
  const isArrived = rawStatus === "chegou" || rawStatus === "arrived";
  const isPreparing = !isOnRoute && !isArrived && !isDelivered;

  const currentStep = isDelivered ? 4 : isArrived ? 3 : isOnRoute ? 2 : 1;

  const statusTitle = isDelivered
    ? "Pedido Entregue! Bom apetite! 🎉"
    : isArrived
    ? "O Motoboy Chegou no seu Portão! 🔔"
    : isOnRoute
    ? `A caminho com ${delivery.driver || "nosso entregador"} 🛵`
    : "Seu House Burger está sendo preparado! 🍔";

  const statusSub = isDelivered
    ? "Entrega finalizada com sucesso."
    : isArrived
    ? "O entregador está aguardando você no portão ou interfone."
    : isOnRoute
    ? "Acompanhe a moto em tempo real se deslocando até o seu endereço."
    : "Em breve o motoboy sairá para entrega.";

  const isPaidOnline =
    delivery.platform === "ifood" ||
    (delivery.payment &&
      (delivery.payment.toLowerCase().includes("online") ||
        delivery.payment.toLowerCase().includes("pago") ||
        delivery.payment.toLowerCase().includes("pix")));

  return (
    <div style={{ minHeight: "100vh", background: "#09090b", color: "#f4f4f5", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Top Bar da Marca */}
      <header style={{ background: "#18181b", borderBottom: "1px solid #27272a", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #e11d48, #f97316)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
            🍔
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 900, letterSpacing: "-0.3px", color: "#fff" }}>
              House Burger
            </h1>
            <span style={{ fontSize: "11px", color: "#a1a1aa", fontWeight: 600 }}>
              Rastreamento em Tempo Real
            </span>
          </div>
        </div>

        <div style={{ background: "#27272a", padding: "5px 10px", borderRadius: "8px", fontSize: "12px", fontWeight: 800, color: "#f4f4f5" }}>
          Pedido #{delivery.order}
        </div>
      </header>

      {/* Hero Status do Pedido */}
      <div style={{ background: "linear-gradient(180deg, #18181b 0%, #09090b 100%)", padding: "20px 18px 16px 18px", borderBottom: "1px solid #27272a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          {isDelivered ? (
            <span style={{ color: "#22c55e", display: "flex" }}><CheckCircle2 size={24} /></span>
          ) : isArrived ? (
            <span style={{ fontSize: "22px" }}>🔔</span>
          ) : isOnRoute ? (
            <span style={{ fontSize: "22px" }}>🛵</span>
          ) : (
            <span style={{ fontSize: "22px" }}>👨‍🍳</span>
          )}
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 900, color: "#fff", letterSpacing: "-0.4px" }}>
            {statusTitle}
          </h2>
        </div>
        <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#a1a1aa", lineHeight: 1.4 }}>
          {statusSub}
        </p>

        {/* Stepper Visual de Progresso */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", marginTop: "12px" }}>
          {/* Linha conectora de fundo */}
          <div style={{ position: "absolute", top: "14px", left: "20px", right: "20px", height: "3px", background: "#27272a", zIndex: 1 }} />
          {/* Linha conectora preenchida */}
          <div
            style={{
              position: "absolute",
              top: "14px",
              left: "20px",
              width: currentStep === 1 ? "0%" : currentStep === 2 ? "33%" : currentStep === 3 ? "66%" : "calc(100% - 40px)",
              height: "3px",
              background: "#16a34a",
              zIndex: 2,
              transition: "width 0.4s ease",
            }}
          />

          {[
            { step: 1, label: "Cozinha", icon: "🍳" },
            { step: 2, label: "Na Rota", icon: "🛵" },
            { step: 3, label: "No Portão", icon: "🚪" },
            { step: 4, label: "Entregue", icon: "✓" },
          ].map((s) => {
            const isDone = currentStep >= s.step;
            const isCurrent = currentStep === s.step;
            return (
              <div key={s.step} style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 3 }}>
                <div
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    background: isDone ? (isCurrent ? "#22c55e" : "#16a34a") : "#27272a",
                    border: isCurrent ? "2px solid #fff" : "2px solid #18181b",
                    color: isDone ? "#fff" : "#71717a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 900,
                    boxShadow: isCurrent ? "0 0 12px rgba(34,197,94,0.6)" : "none",
                  }}
                >
                  {s.icon}
                </div>
                <span style={{ fontSize: "10.5px", marginTop: "6px", fontWeight: isCurrent ? 800 : 600, color: isCurrent ? "#fff" : isDone ? "#22c55e" : "#71717a" }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mapa Interativo ao Vivo */}
      <div style={{ position: "relative", height: "300px", width: "100%", background: "#18181b" }}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

        {/* Badge Flutuante no Mapa */}
        <div
          style={{
            position: "absolute",
            bottom: "12px",
            left: "14px",
            right: "14px",
            background: "rgba(24, 24, 27, 0.92)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "14px",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#27272a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>
              🏍️
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#fff" }}>
                {delivery.driver || "Entregador House Burger"}
              </div>
              <div style={{ fontSize: "11px", color: isOnRoute ? "#22c55e" : "#a1a1aa", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isOnRoute ? "#22c55e" : "#71717a", display: "inline-block" }} />
                {isOnRoute ? "Transmissão GPS ativa" : isDelivered ? "Viagem concluída" : "Aguardando saída da loja"}
              </div>
            </div>
          </div>

          <a
            href={`https://api.whatsapp.com/send?phone=55${STORE_COORDS.phone}&text=${encodeURIComponent(`Olá House Burger! Gostaria de falar sobre meu pedido #${delivery.order}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "#25D366",
              color: "#fff",
              textDecoration: "none",
              padding: "7px 12px",
              borderRadius: "9px",
              fontSize: "12px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <MessageSquare size={13} /> Loja
          </a>
        </div>
      </div>

      {/* Detalhes do Pedido e Pagamento */}
      <div style={{ padding: "18px 16px 40px 16px", maxWidth: "600px", margin: "0 auto" }}>
        {/* Card do Endereço de Entrega */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "16px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(37, 99, 235, 0.15)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px" }}>
              <MapPin size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: "11px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                Endereço de Entrega
              </span>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#fff", marginTop: "2px" }}>
                {delivery.address}
              </div>
              <div style={{ fontSize: "13px", color: "#a1a1aa", marginTop: "2px" }}>
                {delivery.district}{delivery.city ? ` • ${delivery.city}` : ""}
              </div>
              {delivery.reference && (
                <div style={{ fontSize: "12px", color: "#e4e4e7", background: "#27272a", padding: "4px 8px", borderRadius: "6px", marginTop: "8px", display: "inline-block" }}>
                  📍 Ref: {delivery.reference}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card de Pagamento */}
        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "16px", padding: "16px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: "11px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                Forma de Pagamento
              </span>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff", marginTop: "2px" }}>
                {delivery.payment || "Não especificado"}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "11px", color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>
                Total do Pedido
              </span>
              <div style={{ fontSize: "18px", fontWeight: 900, color: "#22c55e", marginTop: "1px" }}>
                R$ {Number(delivery.amount || 0).toFixed(2).replace(".", ",")}
              </div>
            </div>
          </div>

          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #27272a" }}>
            {isPaidOnline ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#22c55e", fontSize: "12.5px", fontWeight: 700 }}>
                <ShieldCheck size={16} /> Pedido pago online • Não precisa pagar nada na entrega
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#f59e0b", fontSize: "12.5px", fontWeight: 700 }}>
                ⚠️ Pagamento na entrega • Tenha o valor ou cartão em mãos
              </div>
            )}
          </div>
        </div>

        {/* Botão de Contato com a Loja */}
        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <a
            href={`https://api.whatsapp.com/send?phone=55${STORE_COORDS.phone}&text=${encodeURIComponent(`Olá House Burger! Gostaria de falar sobre meu pedido #${delivery.order}.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              background: "#25D366",
              color: "#fff",
              textDecoration: "none",
              padding: "14px",
              borderRadius: "14px",
              fontSize: "14px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(37,211,102,0.3)",
            }}
          >
            <MessageSquare size={18} /> WhatsApp da Loja
          </a>

          <a
            href={`tel:${STORE_COORDS.phone}`}
            style={{
              background: "#27272a",
              color: "#f4f4f5",
              textDecoration: "none",
              padding: "14px 18px",
              borderRadius: "14px",
              fontSize: "14px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              border: "1px solid #3f3f46",
            }}
          >
            <Phone size={16} /> Ligar
          </a>
        </div>
      </div>

      <style>{`
        @keyframes pulse-marker {
          0% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(0.9); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
