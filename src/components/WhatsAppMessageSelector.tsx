import { sanitizeWhatsAppNumber } from "../services/phoneService";

// Ícone SVG oficial do WhatsApp sem emojis
function WhatsAppIcon({ size = 13, color = "#16a34a" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export type MessageKey = "cheguei" | "saiu" | "dificuldade";

interface QuickNoticeOption {
  key: MessageKey;
  chipLabel: string;
  buildText: (ctx: { customer: string; order: string; address: string }) => string;
}

const QUICK_NOTICES: QuickNoticeOption[] = [
  {
    key: "cheguei",
    chipLabel: "Cheguei no local",
    buildText: ({ customer, order }) =>
      `Olá ${customer}! Sou o entregador com seu pedido ${order}. Já cheguei no seu endereço e estou no portão te aguardando. Pode retirar, por favor? Obrigado!`,
  },
  {
    key: "saiu",
    chipLabel: "Saiu p/ entrega",
    buildText: ({ customer, order, address }) =>
      `Olá ${customer}! Seu pedido ${order} acabou de sair para entrega e estou a caminho do seu endereço: ${address}. Até breve!`,
  },
  {
    key: "dificuldade",
    chipLabel: "Dificuldade endereço",
    buildText: ({ customer, order, address }) =>
      `Olá ${customer}! Sou o entregador com seu pedido ${order}. Estou com dificuldades para encontrar seu endereço (${address}). Poderia me enviar a localização ou um ponto de referência? Obrigado!`,
  },
];

interface WhatsAppMessageSelectorProps {
  customerName: string;
  orderNumber: string;
  address: string;
  phone?: string;
  notes?: string;
  onUpdatePhone?: (phone: string) => void;
  onNotify?: (msg: string) => void;
}

export function WhatsAppMessageSelector({
  customerName,
  orderNumber,
  address,
  phone,
  notes,
  onUpdatePhone,
  onNotify,
}: WhatsAppMessageSelectorProps) {
  const validPhone = sanitizeWhatsAppNumber(phone, notes);

  const sendMessage = (msgKey: MessageKey) => {
    const opt = QUICK_NOTICES.find((m) => m.key === msgKey);
    if (!opt) return;

    const cleanCustomer = customerName?.trim() || "Cliente";
    const cleanOrder = orderNumber?.trim() || "do pedido";
    const cleanAddress = address?.trim() || "seu endereço";

    const text = opt.buildText({
      customer: cleanCustomer,
      order: cleanOrder,
      address: cleanAddress,
    });

    const triggerOpen = (targetPhone: string) => {
      const url = `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
      onNotify?.(`WhatsApp aberto: "${opt.chipLabel}"`);
    };

    if (validPhone) {
      triggerOpen(validPhone);
    } else {
      const input = window.prompt(
        `Digite o WhatsApp do cliente ${cleanCustomer} (com DDD, ex: 73999998888):`
      );
      if (!input) return;
      const sanitized = sanitizeWhatsAppNumber(input);
      if (!sanitized) {
        alert("Número inválido! Digite com DDD (ex: 73999998888).");
        return;
      }
      onUpdatePhone?.(sanitized);
      triggerOpen(sanitized);
    }
  };

  return (
    <div className="cdc-quick-notices-row">
      <button
        type="button"
        className="btn-quick-notice arrived"
        onClick={() => sendMessage("cheguei")}
        title="Avisar no WhatsApp que chegou no portão"
      >
        <WhatsAppIcon size={13} color="#15803d" />
        <span>Cheguei no local</span>
      </button>

      <button
        type="button"
        className="btn-quick-notice transit"
        onClick={() => sendMessage("saiu")}
        title="Avisar no WhatsApp que o pedido saiu para entrega"
      >
        <span>Saiu p/ entrega</span>
      </button>

      <button
        type="button"
        className="btn-quick-notice help"
        onClick={() => sendMessage("dificuldade")}
        title="Pedir ajuda para achar o endereço"
      >
        <span>Dificuldade endereço</span>
      </button>
    </div>
  );
}
