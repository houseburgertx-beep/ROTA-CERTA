/**
 * Sanitiza e valida números de telefone para links do WhatsApp no padrão internacional (+55 DDD NÚMERO).
 * Retorna o número pronto para wa.me/55... ou null se o número for inválido ou falso (ex: zeros, incompleto).
 */
export function sanitizeWhatsAppNumber(phone?: string, notes?: string): string | null {
  if (!phone && !notes) return null;

  function validate(raw: string): string | null {
    if (!raw || raw.length < 8) return null;
    // Descarta sequências de dígitos repetidos (ex: 00000000000, 99999999999)
    if (/^(\d)\1+$/.test(raw)) return null;
    // Descarta números que começam com 00
    if (raw.startsWith("00")) return null;

    // Se já começa com DDI 55 do Brasil:
    if (raw.startsWith("55")) {
      const rest = raw.slice(2);
      // Se o restante tem 10 ou 11 dígitos com DDD válido (11 a 99)
      if (rest.length === 10 || rest.length === 11) {
        const ddd = parseInt(rest.slice(0, 2), 10);
        if (ddd >= 11 && ddd <= 99) return raw;
      }
      // Se o restante tem 8 ou 9 dígitos e começa com DDD 73 (ex: 55 73 988-7286)
      if (rest.length === 8 || rest.length === 9) {
        const ddd = parseInt(rest.slice(0, 2), 10);
        if (ddd >= 11 && ddd <= 99) {
          const numberPart = rest.slice(2);
          const completeRest = numberPart.length === 8 ? `${rest.slice(0, 2)}9${numberPart}` : rest;
          return `55${completeRest}`;
        }
      }
    }

    // Se tem DDD e número: 10 ou 11 dígitos (ex: 73 99999-8888 ou 73 8888-7777)
    if (raw.length === 10 || raw.length === 11) {
      const ddd = parseInt(raw.slice(0, 2), 10);
      if (ddd >= 11 && ddd <= 99) {
        const numberPart = raw.slice(2);
        const completeNumber =
          raw.length === 10 && numberPart.startsWith("9")
            ? `${raw.slice(0, 2)}9${numberPart}`
            : raw;
        return `55${completeNumber}`;
      }
    }

    // Se foi digitado sem DDD (8 ou 9 dígitos, ex: 99999-8888):
    if (raw.length === 8 || raw.length === 9) {
      const num = raw.length === 8 ? `9${raw}` : raw;
      return `5573${num}`; // DDD 73 padrão da região
    }

    return null;
  }

  const cleanedFromPhone = validate((phone || "").replace(/\D/g, ""));
  if (cleanedFromPhone) return cleanedFromPhone;

  // Busca número dentro de observações/notas
  if (notes) {
    const matches = notes.match(
      /(?:(?:wa\.me\/|zap|whats|tel|cel|contato|fone)?\s*\(?(\d{2})\)?\s*)?(\d{4,5}[-\s]?\d{4})/gi
    );
    if (matches) {
      for (const m of matches) {
        const cleaned = validate(m.replace(/\D/g, ""));
        if (cleaned) return cleaned;
      }
    }
  }

  return null;
}
