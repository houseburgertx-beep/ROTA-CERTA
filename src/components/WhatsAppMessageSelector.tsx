import { useState } from "react";
import {
  MessageSquare,
  ChevronDown,
  Phone,
  Send,
  Pencil,
  AlertCircle
} from "lucide-react";
import { sanitizeWhatsAppNumber } from "../services/phoneService";

// Ícone SVG oficial do WhatsApp sem emojis
function WhatsAppIcon({ size = 15, color = "#16a34a" }: { size?: number; color?: string }) {
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

export type MessageKey = "cheguei" | "saiu" | "dificuldade" | "chat";

interface QuickMessageOption {
  key: MessageKey;
  label: string;
  chipLabel: string;
  buildText: (ctx: { customer: string; order: string; address: string }) => string;
}

const QUICK_MESSAGES: QuickMessageOption[] = [
  {
    key: "cheguei",
    label: "Cheguei no local / portão",
    chipLabel: "Cheguei no local",
    buildText: ({ customer, order }) =>
      `Olá ${customer}! Sou o entregador com seu pedido ${order}. Já cheguei no seu endereço e estou no portão te aguardando. Pode retirar, por favor? Obrigado!`,
  },
  {
    key: "saiu",
    label: "Seu pedido saiu para entrega",
    chipLabel: "Saiu p/ entrega",
    buildText: ({ customer, order, address }) =>
      `Olá ${customer}! Seu pedido ${order} acabou de sair para entrega e estou a caminho do seu endereço: ${address}. Até breve!`,
  },
  {
    key: "dificuldade",
    label: "Estou com dificuldades em achar endereço",
    chipLabel: "Dificuldade no endereço",
    buildText: ({ customer, order, address }) =>
      `Olá ${customer}! Sou o entregador com seu pedido ${order}. Estou com dificuldades para encontrar seu endereço (${address}). Poderia me enviar a localização ou um ponto de referência? Obrigado!`,
  },
  {
    key: "chat",
    label: "Conversar no WhatsApp (chat direto)",
    chipLabel: "Chat direto",
    buildText: ({ customer, order }) =>
      `Olá ${customer}! Sou o entregador com seu pedido ${order}.`,
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
  const [selectedKey, setSelectedKey] = useState<string>("");

  const validPhone = sanitizeWhatsAppNumber(phone, notes);

  const sendMessage = (msgKey: MessageKey) => {
    const opt = QUICK_MESSAGES.find((m) => m.key === msgKey);
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

    // Reseta o seletor para o estado neutro
    setSelectedKey("");
  };

  const handleEditPhone = () => {
    const current = validPhone ? `+${validPhone}` : "";
    const input = window.prompt(
      `Atualizar WhatsApp do cliente ${customerName || ""}:`,
      current
    );
    if (!input) return;
    const sanitized = sanitizeWhatsAppNumber(input);
    if (!sanitized) {
      alert("Número inválido! Digite com DDD (ex: 73999998888).");
      return;
    }
    onUpdatePhone?.(sanitized);
    onNotify?.("Número de WhatsApp atualizado com sucesso.");
  };

  return (
    <div className="cdc-whatsapp-selector-card">
      {/* Top Header: WhatsApp Title & Phone Status */}
      <div className="cdc-whatsapp-selector-header">
        <div className="cdc-whatsapp-title-wrap">
          <div className="cdc-whatsapp-icon-circle">
            <WhatsAppIcon size={14} color="#16a34a" />
          </div>
          <span className="cdc-whatsapp-title">Avisar no WhatsApp</span>
        </div>

        {validPhone ? (
          <button
            type="button"
            className="cdc-whatsapp-phone-badge"
            onClick={handleEditPhone}
            title="Editar número do cliente"
          >
            <Phone size={10} />
            <span>{validPhone.slice(-8)}</span>
            <Pencil size={9} style={{ opacity: 0.6 }} />
          </button>
        ) : (
          <button
            type="button"
            className="cdc-whatsapp-add-phone-btn"
            onClick={handleEditPhone}
            title="Adicionar número de WhatsApp"
          >
            <AlertCircle size={10} />
            <span>Adicionar WhatsApp</span>
          </button>
        )}
      </div>

      {/* Main Dropdown Select (Seletor Nativo de Mensagens) */}
      <div className="cdc-whatsapp-select-wrap">
        <MessageSquare size={13} className="cdc-whatsapp-select-icon" />
        <select
          className="cdc-whatsapp-select-input"
          value={selectedKey}
          onChange={(e) => {
            const val = e.target.value as MessageKey;
            if (val) {
              setSelectedKey(val);
              sendMessage(val);
            }
          }}
        >
          <option value="" disabled>
            Selecione uma mensagem rápida...
          </option>
          {QUICK_MESSAGES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="cdc-whatsapp-select-arrow" />
      </div>

      {/* 3 Quick Chips de 1 Toque (Atalho Rápido para o Motoboy na Moto) */}
      <div className="cdc-whatsapp-chips-grid">
        <button
          type="button"
          className="cdc-whatsapp-chip highlight"
          onClick={() => sendMessage("cheguei")}
          title="Avisar que chegou no portão"
        >
          <Send size={11} />
          <span>Cheguei no local</span>
        </button>

        <button
          type="button"
          className="cdc-whatsapp-chip"
          onClick={() => sendMessage("saiu")}
          title="Avisar que o pedido saiu para entrega"
        >
          <span>Saiu p/ entrega</span>
        </button>

        <button
          type="button"
          className="cdc-whatsapp-chip warn"
          onClick={() => sendMessage("dificuldade")}
          title="Pedir ponto de referência ou localização"
        >
          <span>Dificuldade endereço</span>
        </button>
      </div>
    </div>
  );
}
