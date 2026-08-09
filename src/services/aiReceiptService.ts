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
});

export type AIReceiptFields = z.infer<typeof receiptSchema>;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não consegui abrir a imagem."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

export async function analyzeReceiptWithAI(file: File): Promise<AIReceiptFields> {
  if (!firebaseApp) throw new Error("Firebase não está configurado.");
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem da comanda.");
  if (file.size > 7 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 7 MB.");

  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: "gemini-3.5-flash-lite",
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
        },
        required: ["customer", "phone", "address", "number", "district", "city", "postalCode", "complement", "reference", "items", "notes", "amount", "deliveryFee", "payment", "uncertainFields"],
      },
    },
  });
  const data = await fileToBase64(file);
  const result = await model.generateContent([
    "Analise esta comanda brasileira de entrega. Extraia somente informações visíveis. Não invente dados. Separe rua e número. Valores devem ser números em reais. Coloque em uncertainFields os nomes dos campos ausentes, ilegíveis ou duvidosos.",
    { inlineData: { data, mimeType: file.type } },
  ]);
  return receiptSchema.parse(JSON.parse(result.response.text()));
}

export function receiptFieldsForForm(fields: AIReceiptFields): Record<string, string> {
  const notes = [fields.notes, fields.reference && `Referência: ${fields.reference}`, fields.items.length && `Itens: ${fields.items.join("; ")}`].filter(Boolean).join("\n");
  return Object.fromEntries(Object.entries({
    customer: fields.customer, phone: fields.phone,
    address: [fields.address, fields.number].filter(Boolean).join(", "),
    district: fields.district, city: fields.city, postalCode: fields.postalCode,
    amount: fields.amount == null ? "" : String(fields.amount),
    deliveryFee: fields.deliveryFee == null ? "" : String(fields.deliveryFee),
    payment: fields.payment === "Não identificado" ? "" : fields.payment,
    notes,
  }).filter(([, value]) => Boolean(value)));
}
