import { colors } from "@/src/theme/theme";

export type DeliveryStatus = "aguardando" | "em_rota" | "entregue" | "problema";

export const STATUS_META: Record<
  DeliveryStatus,
  { label: string; color: string; bg: string }
> = {
  aguardando: { label: "Aguardando", color: colors.aguardando, bg: colors.aguardandoBg },
  em_rota: { label: "Em rota", color: colors.em_rota, bg: colors.em_rotaBg },
  entregue: { label: "Entregue", color: colors.entregue, bg: colors.entregueBg },
  problema: { label: "Com problema", color: colors.problema, bg: colors.problemaBg },
};

export const PAYMENT_META: Record<string, { label: string; icon: string }> = {
  dinheiro: { label: "Dinheiro", icon: "cash-outline" },
  cartao: { label: "Cartão", icon: "card-outline" },
  pix: { label: "Pix", icon: "qr-code-outline" },
};

export function brl(value: number | undefined | null): string {
  const n = Number(value || 0);
  return "R$ " + n.toFixed(2).replace(".", ",");
}

export function nextStatus(status: DeliveryStatus): DeliveryStatus | null {
  if (status === "aguardando") return "em_rota";
  if (status === "em_rota") return "entregue";
  return null;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
