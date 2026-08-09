import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai";
import { z } from "zod";

import { firebaseApp } from "./firebase";

const receiptSchema = z.object({
  customer: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  number: z.string().default(""),
  district: z.string().default(""),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  complement: z.string().default(""),
  reference: z.string().default(""),
  items: z.array(z.string()).default([]),
  notes: z.string().default(""),
  amount: z.number().nonnegative().nullable().default(null),
  deliveryFee: z.number().nonnegative().nullable().default(null),
  payment: z.enum(["Pix", "Dinheiro", "Cartão", "Pago", "Não identificado"]).default("Não identificado"),
  uncertainFields: z.array(z.string()).default([]),
  confidence: z.record(z.number().min(0).max(1)).default({}),
});

export type AIReceiptFields = z.infer<typeof receiptSchema>;

async function prepareReceiptImage(file: File): Promise<{ data: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não consegui preparar a imagem.");
  context.filter = "grayscale(1) contrast(1.18) brightness(1.04)";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.9);
  return { data: url.split(",")[1] || "", mimeType: "image/jpeg" };
}

export async function analyzeReceiptWithAI(file: File): Promise<AIReceiptFields> {
  if (!firebaseApp) throw new Error("Firebase não está configurado.");
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem da comanda.");
  if (file.size > 7 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 7 MB.");

  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: "gemini-3.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          customer: { type: "string" }, phone: { type: "string" }, address: { type: "string" },
          number: { type: "string" }, district: { type: "string" }, city: { type: "string" },
          postalCode: { type: "string" }, complement: { type: "string" }, reference: { type: "string" },
          items: { type: "array", items: { type: "string" } }, notes: { type: "string" },
          amount: { type: ["number", "null"] }, deliveryFee: { type: ["number", "null"] },
          payment: { type: "string", enum: ["Pix", "Dinheiro", "Cartão", "Pago", "Não identificado"] },
          uncertainFields: { type: "array", items: { type: "string" } },
          confidence: { type: "object", additionalProperties: { type: "number" } },
        },
        required: ["customer", "phone", "address", "number", "district", "city", "postalCode", "complement", "reference", "items", "notes", "amount", "deliveryFee", "payment", "uncertainFields", "confidence"],
      },
    },
  });
  const image = await prepareReceiptImage(file);
  const result = await model.generateContent([
    `Você é especialista em leitura de comandas brasileiras de delivery. Examine toda a imagem, inclusive texto manuscrito.
Regras obrigatórias:
- extraia somente dados realmente visíveis; nunca complete por suposição;
- diferencie valor do pedido, taxa de entrega e troco;
- normalize telefone brasileiro, CEP e valores em reais;
- separe logradouro e número; preserve complemento e referência;
- transcreva itens com quantidade e variações;
- confidence deve conter uma nota de 0 a 1 para cada campo encontrado;
- inclua em uncertainFields todo campo ausente, ilegível, ambíguo ou com confiança abaixo de 0.78.
A resposta deve ser somente o JSON solicitado.`,
    { inlineData: image },
  ]);
  return receiptSchema.parse(JSON.parse(result.response.text()));
}

export function receiptFieldsForForm(fields: AIReceiptFields): Record<string, string> {
  const notes = [fields.notes, fields.reference && `Referência: ${fields.reference}`, fields.items.length && `Itens: ${fields.items.join("; ")}`].filter(Boolean).join("\n");
  const uncertain = new Set(fields.uncertainFields);
  for (const [field, confidence] of Object.entries(fields.confidence)) if (confidence < 0.78) uncertain.add(field);
  return Object.fromEntries(Object.entries({
    customer: fields.customer, phone: fields.phone,
    address: [fields.address, fields.number].filter(Boolean).join(", "),
    district: fields.district, city: fields.city, postalCode: fields.postalCode,
    amount: fields.amount == null ? "" : String(fields.amount),
    deliveryFee: fields.deliveryFee == null ? "" : String(fields.deliveryFee),
    payment: fields.payment === "Não identificado" ? "" : fields.payment,
    notes,
    _uncertain: [...uncertain].join(","),
    _source: "Firebase AI · Gemini 3.5 Flash",
  }).filter(([, value]) => Boolean(value)));
}
