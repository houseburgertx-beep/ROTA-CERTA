import type { Delivery, Driver, OrderItem } from "../types";
import { saveTakeatConfigRTDB, saveDriverRTDB, getDriversRTDB } from "./realtimeDbService";
import { geocodeDeliveryAddress } from "./geocodingService";

export interface TakeatBuyerAddress {
  country?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  number?: string;
  complement?: string;
  reference?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
}

export interface TakeatBuyer {
  name?: string;
  phone?: string;
  delivery_address?: TakeatBuyerAddress | null;
}

export interface TakeatOrderComplement {
  id?: number;
  amount?: number;
  complement?: {
    id?: number;
    name?: string;
  };
}

export interface TakeatComplementCategory {
  id?: number;
  complement_category?: {
    id?: number;
    name?: string;
  };
  order_complements?: TakeatOrderComplement[];
}

export interface TakeatOrderItem {
  id?: number;
  amount: number;
  price?: string;
  total_price?: string;
  details?: string | null;
  product?: {
    id?: number;
    name?: string;
  };
  complement_categories?: TakeatComplementCategory[];
}

export interface TakeatOrderBasket {
  id?: number;
  basket_id?: string;
  channel?: string;
  orders?: TakeatOrderItem[];
}

export interface TakeatWaiter {
  id?: number;
  name?: string;
}

export interface TakeatDriverInfo {
  id?: number | string;
  name?: string;
  phone?: string;
}

export interface TakeatMotoboy {
  id: number;
  name: string;
  phone?: string | null;
  active?: boolean;
  runtime_status?: string;
  current_route_stops?: number;
  current_route_total_stops?: number;
  current_route_delivered?: number;
}

export interface TakeatAssignedDriver {
  id: number;
  name: string;
  phone?: string | null;
}

export interface TakeatBill {
  id?: number;
  total_price?: string;
  waiter?: TakeatWaiter | null;
  buyer?: TakeatBuyer | null;
  order_baskets?: TakeatOrderBasket[];
}

export interface TakeatPayment {
  payment_value?: string;
  payment_method?: {
    id?: number;
    name?: string;
    method?: string;
    brand?: string;
  };
}

export interface TakeatTableSession {
  id: number;
  details?: string | null;
  ifood_document?: string | null;
  total_price?: string;
  total_service_price?: string;
  start_time?: string;
  end_time?: string | null;
  completed_at?: string | null;
  status?: string;
  is_delivery?: boolean;
  delivery_tax_price?: string | null;
  total_delivery_price?: string | null;
  attendance_password?: string | null;
  delivery_by?: string | null;
  driver?: TakeatDriverInfo | string | null;
  motoboy?: TakeatDriverInfo | string | null;
  delivery_person?: TakeatDriverInfo | string | null;
  courier?: TakeatDriverInfo | string | null;
  delivery?: { driver?: TakeatDriverInfo; driver_name?: string; motoboy?: string } | null;
  table?: {
    table_number?: number;
    table_type?: string;
  };
  payments?: TakeatPayment[];
  bills?: TakeatBill[];
  status_timings?: {
    start_time?: string | null;
    accepted_at?: string | null;
    ready_at?: string | null;
    ongoing_at?: string | null;
    delivered_at?: string | null;
    end_time?: string | null;
    completed_at?: string | null;
    delivery_canceled_at?: string | null;
  };
}

export interface TakeatCredentials {
  authMethod: "credentials" | "apikey";
  email?: string;
  password?: string;
  apiKey?: string;
}

const TAKEAT_KEY_STORAGE = "rotacerta_takeat_key";
const TAKEAT_CREDS_STORAGE = "rotacerta_takeat_creds";
const TAKEAT_SYNC_STORAGE = "rotacerta_takeat_sync_active";
const TAKEAT_TOKEN_STORAGE = "rotacerta_takeat_cached_token";

let cachedToken: { token: string; expiresAt: number } | null = null;
let activeTakeatCreds: TakeatCredentials | null = null;

/**
 * Define em memória e no localStorage as credenciais recebidas do RTDB ou do formulário.
 */
export function setTakeatCredentials(creds: TakeatCredentials | null): void {
  activeTakeatCreds = creds;
  if (creds) {
    try {
      localStorage.setItem(TAKEAT_CREDS_STORAGE, JSON.stringify(creds));
      if (creds.apiKey) {
        localStorage.setItem(TAKEAT_KEY_STORAGE, creds.apiKey.trim());
      }
    } catch {}
  }
}

/**
 * Retorna as credenciais completas da Takeat salvas no sistema.
 */
export function getTakeatCredentials(): TakeatCredentials {
  if (activeTakeatCreds && (activeTakeatCreds.apiKey || (activeTakeatCreds.email && activeTakeatCreds.password))) {
    return activeTakeatCreds;
  }

  try {
    const raw = localStorage.getItem(TAKEAT_CREDS_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        activeTakeatCreds = parsed;
        return parsed;
      }
    }
  } catch {}

  const apiKey = getTakeatApiKey();
  if (apiKey) return { authMethod: "apikey", apiKey };
  return { authMethod: "credentials", email: "", password: "" };
}

/**
 * Salva as credenciais da Takeat (Login/Senha ou API Key) permanentemente no sistema e no Firebase RTDB.
 */
export function saveTakeatCredentials(creds: TakeatCredentials): void {
  activeTakeatCreds = creds;
  try {
    localStorage.setItem(TAKEAT_CREDS_STORAGE, JSON.stringify(creds));
    if (creds.apiKey) {
      localStorage.setItem(TAKEAT_KEY_STORAGE, creds.apiKey.trim());
    }
    cachedToken = null;
    sessionStorage.removeItem(TAKEAT_TOKEN_STORAGE);
  } catch {}

  // Salva no Firebase RTDB para que todos os celulares/motoboys sincronizem automaticamente
  void saveTakeatConfigRTDB(creds);
}

/**
 * Remove todas as credenciais da Takeat salvas no sistema.
 */
export function clearTakeatCredentials(): void {
  activeTakeatCreds = null;
  try {
    localStorage.removeItem(TAKEAT_CREDS_STORAGE);
    localStorage.removeItem(TAKEAT_KEY_STORAGE);
    cachedToken = null;
    sessionStorage.removeItem(TAKEAT_TOKEN_STORAGE);
  } catch {}
}

/**
 * Verifica se a Takeat está configurada (por login/senha ou API key).
 */
export function isTakeatConfigured(): boolean {
  const creds = getTakeatCredentials();
  if (creds.authMethod === "credentials") {
    return Boolean(creds.email && creds.password);
  }
  return Boolean(creds.apiKey || getTakeatApiKey());
}

/**
 * Retorna a chave de API da Takeat salva localmente ou em variável de ambiente.
 */
export function getTakeatApiKey(): string {
  try {
    const saved = localStorage.getItem(TAKEAT_KEY_STORAGE);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return (import.meta.env.VITE_TAKEAT_API_KEY || "").trim();
}

/**
 * Salva a chave de API da Takeat no localStorage.
 */
export function saveTakeatApiKey(apiKey: string): void {
  try {
    localStorage.setItem(TAKEAT_KEY_STORAGE, apiKey.trim());
    const existing = getTakeatCredentials();
    saveTakeatCredentials({ ...existing, apiKey: apiKey.trim() });
    cachedToken = null;
    sessionStorage.removeItem(TAKEAT_TOKEN_STORAGE);
  } catch {}
}

/**
 * Remove a chave da Takeat.
 */
export function clearTakeatApiKey(): void {
  try {
    localStorage.removeItem(TAKEAT_KEY_STORAGE);
    cachedToken = null;
    sessionStorage.removeItem(TAKEAT_TOKEN_STORAGE);
  } catch {}
}

/**
 * Verifica se a sincronização automática está ativada.
 */
export function isTakeatSyncEnabled(): boolean {
  try {
    const val = localStorage.getItem(TAKEAT_SYNC_STORAGE);
    // Padrão ativado se já tiver credenciais configuradas
    if (val === null) return isTakeatConfigured();
    return val === "true";
  } catch {
    return true;
  }
}

/**
 * Ativa ou desativa a sincronização automática.
 */
export function setTakeatSyncEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TAKEAT_SYNC_STORAGE, enabled ? "true" : "false");
  } catch {}
}

/**
 * Endpoints adaptáveis: usa proxy Vite em dev/tunnel e URLs diretas em produção (Firebase/Vercel).
 */
function getApiEndpoint(endpointPath: string): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.includes("trycloudflare.com")) {
      return `/takeat-api${endpointPath}`;
    }
  }
  return `https://public-api.takeat.app${endpointPath}`;
}

function getAuthEndpoint(endpointPath: string): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.includes("trycloudflare.com")) {
      return `/takeat-auth${endpointPath}`;
    }
  }
  return `https://backend-pdv-2.takeat.app${endpointPath}`;
}

/**
 * Autentica o restaurante usando E-mail e Senha do Gestor Takeat.
 * Retorna a sessão JWT autenticada diretamente da Takeat.
 */
export async function loginTakeatWithPassword(email: string, password: string): Promise<string> {
  const cleanEmail = email.trim();
  const cleanPassword = password.trim();

  if (!cleanEmail || !cleanPassword) {
    throw new Error("Informe o e-mail e a senha do gestor Takeat.");
  }

  const endpoint = getAuthEndpoint("/public/sessions/restaurants");
  const payload = JSON.stringify({ email: cleanEmail, password: cleanPassword });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
    });
  } catch (err: unknown) {
    // Fallback caso proxy falhe
    res = await fetch("https://backend-pdv-2.takeat.app/public/sessions/restaurants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: payload,
    });
  }

  if (!res.ok) {
    let errorMsg = `Erro ${res.status} no login Takeat`;
    try {
      const errData = await res.json();
      if (errData.message) {
        errorMsg = errData.message;
      } else if (errData.error) {
        errorMsg = errData.error;
      } else if (errData.messages?.[0]?.message) {
        errorMsg = errData.messages[0].message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await res.json();
  const token = data.token;
  if (!token) {
    throw new Error("Token de autenticação não retornado pelo login Takeat.");
  }

  // Sessão persistida em cache (válida por 4 horas)
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  cachedToken = { token, expiresAt };
  try {
    sessionStorage.setItem(TAKEAT_TOKEN_STORAGE, JSON.stringify(cachedToken));
  } catch {}

  return token;
}

/**
 * Emite ou reutiliza um token Bearer autenticado (via Login/Senha ou API Key).
 */
export async function authenticateTakeat(apiKeyOverride?: string): Promise<string> {
  // Verifica cache em memória
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30000) {
    return cachedToken.token;
  }

  // Verifica cache no sessionStorage
  try {
    const stored = sessionStorage.getItem(TAKEAT_TOKEN_STORAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.token && parsed.expiresAt > now + 30000) {
        cachedToken = parsed;
        return parsed.token;
      }
    }
  } catch {}

  const creds = getTakeatCredentials();

  // 1. Método Login e Senha (recomendado e solicitado pelo usuário)
  if (creds.authMethod === "credentials" && creds.email && creds.password) {
    return await loginTakeatWithPassword(creds.email, creds.password);
  }

  // 2. Método API Key OAuth
  const apiKey = (apiKeyOverride || creds.apiKey || getTakeatApiKey()).trim();
  if (apiKey) {
    const params = new URLSearchParams();
    params.append("grant_type", "api_key");
    params.append("api_key", apiKey);

    const endpoint = getApiEndpoint("/oauth/token");

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      });
    } catch (err: unknown) {
      res = await fetch("https://public-api.takeat.app/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      });
    }

    if (!res.ok) {
      let errorMsg = `Erro ${res.status} ao autenticar com a Takeat`;
      try {
        const errData = await res.json();
        if (errData.error_description || errData.error || errData.message) {
          errorMsg = errData.error_description || errData.error || errData.message;
        }
      } catch {}
      throw new Error(errorMsg);
    }

    const data = await res.json();
    const token = data.access_token;
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 900;
    const expiresAt = Date.now() + expiresIn * 1000;

    cachedToken = { token, expiresAt };
    try {
      sessionStorage.setItem(TAKEAT_TOKEN_STORAGE, JSON.stringify(cachedToken));
    } catch {}

    return token;
  }

  throw new Error("Takeat não conectada. Conecte com seu E-mail e Senha no painel ADM.");
}

/**
 * Consulta as sessões de pedidos na API Takeat V1.0.
 */
export async function fetchTakeatDeliverySessions(options?: {
  startDate?: string;
  endDate?: string;
  apiKey?: string;
}): Promise<TakeatTableSession[]> {
  const token = await authenticateTakeat(options?.apiKey);

  const now = new Date();
  const start = options?.startDate
    ? new Date(options.startDate)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = options?.endDate
    ? new Date(options.endDate)
    : new Date(now.getTime() + 60 * 60 * 1000);

  const queryParams = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  });

  const endpoint = `${getApiEndpoint("/v1/table-sessions")}?${queryParams.toString()}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err: unknown) {
    res = await fetch(
      `https://public-api.takeat.app/v1/table-sessions?${queryParams.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );
  }

  if (!res.ok) {
    let errorMsg = `Erro ${res.status} ao consultar pedidos Takeat`;
    try {
      const errData = await res.json();
      if (errData.error_description || errData.error || errData.message) {
        errorMsg = errData.error_description || errData.error || errData.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const sessions: TakeatTableSession[] = await res.json();
  if (!Array.isArray(sessions)) return [];

  console.warn("=== SESSÕES RECEBIDAS DA TAKEAT ===");
  for (const s of sessions.slice(-5)) {
    console.warn(`[Takeat Raw] #${s.id} (Senha #${s.attendance_password}): status=${s.status}, delivery_by=${s.delivery_by}, driver=${JSON.stringify(s.driver)}, motoboy=${JSON.stringify(s.motoboy)}, waiter=${JSON.stringify(s.bills?.[0]?.waiter)}, details=${s.details}`);
  }

  // Filtra apenas sessões que são de delivery ou possuem endereço de entrega ou taxa de entrega
  return sessions.filter((s) => {
    if (s.is_delivery === true || (s as unknown as { is_delivery: number }).is_delivery === 1) return true;
    if (String(s.table?.table_type || "").toLowerCase() === "delivery") return true;
    if (s.delivery_by || s.total_delivery_price || s.delivery_tax_price) return true;
    const hasAddress = s.bills?.some(
      (b) => b.buyer?.delivery_address?.street || b.buyer?.delivery_address?.neighborhood || b.buyer?.delivery_address?.city
    );
    return Boolean(hasAddress);
  });
}

/**
 * Busca a lista de motoboys cadastrados no restaurante na Takeat.
 */
export async function fetchTakeatMotoboys(apiKey?: string): Promise<TakeatMotoboy[]> {
  try {
    const token = await authenticateTakeat(apiKey);
    const endpoint = getAuthEndpoint("/restaurants/motoboys");
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch {
      res = await fetch("https://backend-pdv-2.takeat.app/restaurants/motoboys", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    }
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("Erro ao buscar motoboys Takeat:", e);
    return [];
  }
}

/**
 * Puxa todos os motoboys cadastrados no Takeat e sincroniza diretamente no Firebase RTDB.
 */
export async function syncTakeatMotoboysToRTDB(apiKey?: string): Promise<Driver[]> {
  try {
    const list = await fetchTakeatMotoboys(apiKey);
    if (!list.length) return [];

    const existingDrivers = await getDriversRTDB();
    const updatedDrivers: Driver[] = [...existingDrivers];

    for (const mb of list) {
      if (!mb.id || !mb.name) continue;
      const cleanName = mb.name.trim();
      const displayName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
      const slug = cleanName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim() || `motoboy${mb.id}`;
      const email = `${slug}@motoboy.com`;
      const phone = mb.phone && mb.phone !== "null" ? mb.phone.trim() : "";

      const idx = updatedDrivers.findIndex(
        (d) =>
          (d.takeatId && Number(d.takeatId) === Number(mb.id)) ||
          d.name.toLowerCase() === displayName.toLowerCase() ||
          (d.email && d.email.toLowerCase() === email.toLowerCase())
      );

      const driverRecord: Driver = {
        id: idx >= 0 ? updatedDrivers[idx].id : `drv-takeat-${mb.id}`,
        name: displayName,
        email: idx >= 0 && updatedDrivers[idx].email ? updatedDrivers[idx].email : email,
        phone: phone || (idx >= 0 ? updatedDrivers[idx].phone : ""),
        vehicle: "Moto",
        defaultFee: idx >= 0 && updatedDrivers[idx].defaultFee ? updatedDrivers[idx].defaultFee : 7.0,
        active: mb.active !== false,
        companyId: "house-burger-190",
        takeatId: mb.id,
        createdAt: idx >= 0 && updatedDrivers[idx].createdAt ? updatedDrivers[idx].createdAt : new Date().toISOString(),
      };

      await saveDriverRTDB(driverRecord);
      if (idx >= 0) {
        updatedDrivers[idx] = driverRecord;
      } else {
        updatedDrivers.push(driverRecord);
      }
    }

    return updatedDrivers;
  } catch (err) {
    console.error("Erro ao sincronizar motoboys da Takeat:", err);
    return [];
  }
}

/**
 * Busca as cestas (pedidos ativos em tempo real) da Takeat com o motoboy atribuído.
 */
export async function fetchTakeatBaskets(apiKey?: string): Promise<{
  sessionMotoboyMap: Map<number, TakeatAssignedDriver>;
  rawOrders: Record<string, unknown>[];
}> {
  const map = new Map<number, TakeatAssignedDriver>();
  try {
    const token = await authenticateTakeat(apiKey);
    const endpoint = getAuthEndpoint("/restaurants/baskets");
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch {
      res = await fetch("https://backend-pdv-2.takeat.app/restaurants/baskets", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    }
    if (!res.ok) return { sessionMotoboyMap: map, rawOrders: [] };
    const data = await res.json();
    const orders = Array.isArray(data?.orders) ? (data.orders as Record<string, unknown>[]) : [];
    for (const o of orders) {
      const sId = Number(o.session_id || o.table_session_id || (o.basket as Record<string, unknown> | undefined)?.table_session_id);
      const motoboy = o.motoboy as { id?: number | string; name?: string; phone?: string } | undefined;
      if (sId && motoboy && typeof motoboy === "object" && motoboy.name) {
        map.set(sId, {
          id: Number(motoboy.id),
          name: String(motoboy.name).trim(),
          phone: motoboy.phone ? String(motoboy.phone).trim() : null,
        });
      }
    }
    return { sessionMotoboyMap: map, rawOrders: orders };
  } catch (e) {
    console.warn("Erro ao buscar cestas Takeat:", e);
    return { sessionMotoboyMap: map, rawOrders: [] };
  }
}

/**
 * Busca as sessões de pedidos por motoboy no período na Takeat.
 */
export async function fetchTakeatMotoboySessions(
  startDate?: string,
  endDate?: string,
  apiKey?: string
): Promise<Map<number, TakeatAssignedDriver>> {
  const map = new Map<number, TakeatAssignedDriver>();
  try {
    const token = await authenticateTakeat(apiKey);
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().split("T")[0];
    const end = endDate || new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const endpoint = `${getAuthEndpoint("/restaurants/motoboys/sessions")}?start=${start}&end=${end}`;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    } catch {
      res = await fetch(`https://backend-pdv-2.takeat.app/restaurants/motoboys/sessions?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
    }
    if (!res.ok) return map;
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const m of data) {
        if (Array.isArray(m.sessions)) {
          for (const s of m.sessions) {
            const sId = Number(s.id);
            if (sId) {
              map.set(sId, {
                id: Number(m.id),
                name: String(m.name).trim(),
                phone: m.phone ? String(m.phone).trim() : null,
              });
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Erro ao buscar sessões de motoboys Takeat:", e);
  }
  return map;
}

/**
 * Converte os itens de um pedido Takeat para a estrutura padronizada OrderItem.
 */
export function extractTakeatItems(session: TakeatTableSession): {
  items: OrderItem[];
  itemsSummary: string;
} {
  const items: OrderItem[] = [];

  const bills = session.bills || [];
  for (const bill of bills) {
    for (const basket of bill.order_baskets || []) {
      for (const order of basket.orders || []) {
        const prodName = order.product?.name || "Item sem nome";
        const complements: string[] = [];

        for (const cat of order.complement_categories || []) {
          for (const oc of cat.order_complements || []) {
            if (oc.complement?.name) {
              const compText = oc.amount && oc.amount > 1
                ? `${oc.amount}x ${oc.complement.name}`
                : oc.complement.name;
              complements.push(compText);
            }
          }
        }

        const price = parseFloat(order.price || "0");
        const totalPrice = parseFloat(order.total_price || (price * order.amount).toFixed(2));

        const item: OrderItem = {
          id: order.id,
          name: prodName,
          amount: order.amount || 1,
          price,
          totalPrice,
        };
        if (order.details) item.details = order.details;
        if (complements.length > 0) item.complements = complements;
        items.push(item);
      }
    }
  }

  const itemsSummary = items.length > 0
    ? items
        .map((i) => {
          const compSuffix = i.complements && i.complements.length > 0
            ? ` (${i.complements.join(", ")})`
            : "";
          return `${i.amount}x ${i.name}${compSuffix}`;
        })
        .join(" • ")
    : "Itens não especificados";

  return { items, itemsSummary };
}

/**
 * Extrai o nome bruto do motoboy de qualquer propriedade possível do JSON da Takeat.
 * Inspeciona delivery_by, motoboy, driver, delivery_person, bills[].waiter, created_by_waiter,
 * e faz varredura profunda em objetos aninhados.
 */
export function extractRawDriverFromTakeatSession(session: TakeatTableSession): string | null {
  const raw = session as unknown as Record<string, unknown>;
  const candidates: (string | undefined | null)[] = [];

  // 1. Propriedades diretas de entregador / motoboy (delivery_by é tipo logístico 'MERCHANT', não nome)
  if (typeof raw.driver === "string") candidates.push(raw.driver);
  else if (raw.driver && typeof raw.driver === "object" && "name" in raw.driver) {
    candidates.push(String((raw.driver as Record<string, unknown>).name));
  }

  if (typeof raw.motoboy === "string") candidates.push(raw.motoboy);
  else if (raw.motoboy && typeof raw.motoboy === "object" && "name" in raw.motoboy) {
    candidates.push(String((raw.motoboy as Record<string, unknown>).name));
  }

  if (typeof raw.delivery_person === "string") candidates.push(raw.delivery_person);
  else if (raw.delivery_person && typeof raw.delivery_person === "object" && "name" in raw.delivery_person) {
    candidates.push(String((raw.delivery_person as Record<string, unknown>).name));
  }

  if (typeof raw.courier === "string") candidates.push(raw.courier);
  else if (raw.courier && typeof raw.courier === "object" && "name" in raw.courier) {
    candidates.push(String((raw.courier as Record<string, unknown>).name));
  }

  // 3. Objeto delivery aninhado
  const rawDeliv = raw.delivery as Record<string, unknown> | undefined;
  if (rawDeliv) {
    if (typeof rawDeliv.driver_name === "string") candidates.push(rawDeliv.driver_name);
    if (typeof rawDeliv.motoboy === "string") candidates.push(rawDeliv.motoboy);
    if (rawDeliv.driver && typeof rawDeliv.driver === "object" && "name" in rawDeliv.driver) {
      candidates.push(String((rawDeliv.driver as Record<string, unknown>).name));
    }
  }

  // 4. Garçom / colaborador ou entregador vinculado na conta
  for (const bill of session.bills || []) {
    if (bill.waiter?.name) candidates.push(bill.waiter.name);
    const rawBill = bill as unknown as Record<string, unknown>;
    if (typeof rawBill.motoboy === "string") candidates.push(rawBill.motoboy);
    if (rawBill.driver && typeof rawBill.driver === "object" && "name" in rawBill.driver) {
      candidates.push(String((rawBill.driver as Record<string, unknown>).name));
    }
    const buyer = bill.buyer as Record<string, unknown> | undefined;
    if (buyer && typeof buyer.created_by_waiter === "string") {
      candidates.push(buyer.created_by_waiter);
    }
  }

  // 5. Varredura recursiva em chaves relacionadas a entregador
  function scan(obj: unknown, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 3) return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const keyLower = k.toLowerCase();
      if (
        (keyLower.includes("motoboy") ||
          keyLower.includes("driver") ||
          keyLower.includes("entregador") ||
          keyLower.includes("courier")) &&
        typeof v === "string" &&
        v.trim()
      ) {
        candidates.push(v);
      } else if (v && typeof v === "object") {
        scan(v, depth + 1);
      }
    }
  }
  scan(raw);

  // 6. Procura no campo details / observações
  if (session.details) {
    const m = session.details.match(/(?:motoboy|entregador|motorista)\s*[:=]\s*([a-zA-ZÀ-ÿ0-9_\-\s]+)/i);
    if (m && m[1]) candidates.push(m[1].trim());
  }

  for (const cand of candidates) {
    if (!cand) continue;
    let clean = cand.trim();
    // Remove prefixos como "Motoboy: " ou "Entregador: "
    clean = clean.replace(/^(motoboy|entregador|motorista|driver)\s*[:\-]\s*/i, "").trim();
    const lower = clean.toLowerCase();
    if (
      clean.length >= 2 &&
      !lower.includes("aguardando") &&
      !lower.includes("sem motoboy") &&
      !lower.includes("não atribuído") &&
      lower !== "merchant" &&
      lower !== "platform" &&
      lower !== "takeat" &&
      lower !== "ifood"
    ) {
      return clean;
    }
  }

  return null;
}

/**
 * Tenta reconhecer qual motoboy está associado ao pedido da Takeat.
 */
export function findDriverInTakeatSession(
  session: TakeatTableSession,
  driversList: Driver[] = [],
): Driver | null {
  const rawDriverName = extractRawDriverFromTakeatSession(session);
  if (!rawDriverName) return null;

  const cleanCand = rawDriverName.trim().toLowerCase();

  // Tenta correspondência direta com a equipe cadastrada no Rota Certa
  if (driversList && driversList.length > 0) {
    for (const drv of driversList) {
      if (drv.active === false) continue;
      const cleanDrv = drv.name.trim().toLowerCase();
      // Match exato ou contido
      if (cleanDrv === cleanCand || cleanDrv.includes(cleanCand) || cleanCand.includes(cleanDrv)) {
        return drv;
      }
      // Checa apelido entre parênteses ex: "(Kaká)"
      const nickMatch = drv.name.match(/\(([^)]+)\)/);
      if (nickMatch && cleanCand.includes(nickMatch[1].trim().toLowerCase())) {
        return drv;
      }
      // Primeiro nome com 3+ letras
      const firstPart = cleanDrv.split(/\s+/)[0];
      if (firstPart && firstPart.length >= 3 && cleanCand.includes(firstPart)) {
        return drv;
      }
    }
  }

  // Se for o Guilherme e a lista ainda não tiver carregado ou não deu match
  if (cleanCand.includes("guilherme")) {
    return {
      id: "drv-TOIXT7FvH1Mxymob9bP6U5Bv85M2",
      name: "Guilherme",
      email: "guilherme@motoboy.com",
      phone: "(73) 99999-1234",
      vehicle: "Moto",
      defaultFee: 7.0,
      active: true,
      companyId: "house-burger-190",
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Converte uma sessão de comanda Takeat em um objeto Delivery do Rota Certa.
 */
export function mapTakeatSessionToDelivery(
  session: TakeatTableSession,
  driversList: Driver[] = [],
  assignedMotoboy?: TakeatAssignedDriver | null,
  defaultDriverName = "Carlos Eduardo (Kaká)",
  defaultDriverId = "driver-1"
): Delivery {
  const rawSession = session as unknown as Record<string, unknown>;
  const bill = session.bills?.[0];
  const buyer = bill?.buyer || (rawSession.buyer as TakeatBuyer | undefined);
  const addressObj = buyer?.delivery_address || (rawSession.delivery_address as TakeatBuyerAddress | undefined) || (rawSession.address as TakeatBuyerAddress | undefined);

  const { items, itemsSummary } = extractTakeatItems(session);

  // Formata o endereço completo
  const streetPart = addressObj?.street || "Endereço Takeat";
  const numPart = addressObj?.number && addressObj.number !== "0" ? addressObj.number : "s/n";
  const formattedAddress = `${streetPart}, ${numPart}`;
  const district = addressObj?.neighborhood || "Centro";
  const city = addressObj?.city || "Teixeira de Freitas";
  const state = addressObj?.state || "BA";
  const postalCode = addressObj?.zip_code || "";

  // Telefone do comprador
  const phone = buyer?.phone || "";

  // Nome do cliente
  const customer = buyer?.name || "Cliente Takeat";

  // Identificador iFood se houver
  const isIfood =
    Boolean(session.ifood_document) ||
    session.bills?.some((b) =>
      b.order_baskets?.some((ob) => ob.channel?.toLowerCase().includes("ifood"))
    );

  const ifoodId =
    session.ifood_document ||
    session.bills?.[0]?.order_baskets?.[0]?.basket_id ||
    (session.attendance_password ? `#${session.attendance_password}` : undefined);

  const pickupCode = session.attendance_password || undefined;

  // Preço e taxa
  const amount = parseFloat(session.total_price || "0");
  const deliveryFee = parseFloat(
    session.delivery_tax_price || session.total_delivery_price || "7.00"
  );

  // Método de pagamento
  const paymentMethod =
    session.payments?.[0]?.payment_method?.name ||
    (isIfood ? "Pago Online (iFood)" : "A Cobrar na Entrega");

  // Status da sessão Takeat mapeado para o Rota Certa
  let status: Delivery["status"] = "Aguardando";
  if (
    session.status_timings?.delivered_at ||
    session.status === "completed" ||
    session.completed_at
  ) {
    status = "Entregue";
  } else if (
    session.status_timings?.ongoing_at ||
    session.status === "ongoing" ||
    session.status === "dispatched"
  ) {
    status = "Em rota";
  } else if (
    session.status_timings?.ready_at ||
    session.status === "ready" ||
    session.status_timings?.accepted_at
  ) {
    status = "Pronta para sair";
  } else if (session.status === "canceled" || session.status_timings?.delivery_canceled_at) {
    status = "Problema";
  }

  // Notas e referências
  const notesParts: string[] = [];
  if (pickupCode) notesParts.push(`Coleta: ${pickupCode}`);
  if (addressObj?.complement) notesParts.push(`Comp: ${addressObj.complement}`);
  if (addressObj?.reference) notesParts.push(`Ref: ${addressObj.reference}`);
  if (session.details) notesParts.push(`Obs: ${session.details}`);
  const notes = notesParts.join(" | ") || undefined;

  // Horário
  const createdDate = session.start_time ? new Date(session.start_time) : new Date();
  const time = createdDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Reconhecimento de motoboy: prioridade absoluta para a atribuição real do Takeat Gestor/PDV
  let driverName = "Aguardando despacho";
  let driverId = "";

  if (assignedMotoboy?.name) {
    const rawName = assignedMotoboy.name.trim();
    const candLower = rawName.toLowerCase();

    // 1. Procura match na lista de motoristas cadastrados (por takeatId, nome ou email)
    let match = driversList.find((d) => {
      if (d.active === false) return false;
      if (d.takeatId && Number(d.takeatId) === Number(assignedMotoboy.id)) return true;
      const dLower = d.name.toLowerCase().trim();
      return (
        dLower === candLower ||
        dLower.includes(candLower) ||
        candLower.includes(dLower) ||
        (d.email && d.email.toLowerCase().includes(candLower))
      );
    });

    // 1.1 Match por telefone se o nome não bater exatamente
    if (!match && assignedMotoboy.phone) {
      const cleanAssignedPhone = assignedMotoboy.phone.replace(/\D/g, "");
      if (cleanAssignedPhone.length >= 8) {
        match = driversList.find((d) => {
          if (!d.phone) return false;
          const cleanDPhone = d.phone.replace(/\D/g, "");
          return cleanDPhone.includes(cleanAssignedPhone) || cleanAssignedPhone.includes(cleanDPhone);
        });
      }
    }

    // 2. Se for Guilherme (motoboy configurado pelo usuário para testes e entregas)
    if (!match && candLower.includes("guilherme")) {
      match = {
        id: "drv-TOIXT7FvH1Mxymob9bP6U5Bv85M2",
        name: "Guilherme",
        email: "guilherme@motoboy.com",
        phone: assignedMotoboy.phone || "(73) 99964-3417",
        vehicle: "Moto",
        defaultFee: 7.0,
        active: true,
        companyId: "house-burger-190",
        createdAt: new Date().toISOString(),
      };
    }

    if (match) {
      driverName = match.name;
      driverId = match.id;
    } else {
      const formatted = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      driverName = formatted;
      driverId = `takeat-${assignedMotoboy.id}`;
    }
  } else {
    // Fallback: tenta extrair das propriedades do JSON da sessão pública
    const recognizedDriver = findDriverInTakeatSession(session, driversList);
    const rawDriverName = extractRawDriverFromTakeatSession(session);

    if (recognizedDriver) {
      driverName = recognizedDriver.name;
      driverId = recognizedDriver.id;
    } else if (rawDriverName) {
      const formatted = rawDriverName.charAt(0).toUpperCase() + rawDriverName.slice(1);
      driverName = formatted;
      const match = driversList.find(
        (d) =>
          d.name.toLowerCase().includes(rawDriverName.toLowerCase()) ||
          rawDriverName.toLowerCase().includes(d.name.toLowerCase())
      );
      driverId = match ? match.id : `drv-${rawDriverName.toLowerCase().replace(/\s+/g, "-")}`;
    } else if (status === "Em rota") {
      driverName = "Despachado (Sem motoboy)";
    }
  }

  const delivery: Delivery = {
    id: `takeat-${session.id}`,
    order: pickupCode ? `#${pickupCode}` : `#TK-${session.id}`,
    customer,
    phone,
    address: formattedAddress,
    district,
    city,
    state,
    postalCode,
    amount,
    deliveryFee: deliveryFee > 0 ? deliveryFee : 7.0,
    payment: paymentMethod,
    platform: isIfood ? "ifood" : "takeat",
    platformOrderId: ifoodId,
    pickupCode,
    ifoodLocalizer: session.ifood_document || undefined,
    priority: "Normal",
    status,
    driver: driverName,
    driverId,
    driverPhone: assignedMotoboy?.phone || undefined,
    time,
    items,
    itemsSummary,
    source: "takeat",
    createdAt: session.start_time || new Date().toISOString(),
  };

  if (addressObj?.complement) delivery.complement = addressObj.complement;
  if (addressObj?.reference) delivery.reference = addressObj.reference;
  const rawLat = addressObj?.latitude ?? (rawSession.latitude as number | undefined);
  const rawLng = addressObj?.longitude ?? (rawSession.longitude as number | undefined);
  if (rawLat !== undefined && rawLat !== null && !isNaN(Number(rawLat)) && Number(rawLat) !== 0) {
    delivery.latitude = Number(rawLat);
  }
  if (rawLng !== undefined && rawLng !== null && !isNaN(Number(rawLng)) && Number(rawLng) !== 0) {
    delivery.longitude = Number(rawLng);
  }
  if (ifoodId) delivery.platformOrderId = ifoodId;
  if (pickupCode) delivery.pickupCode = pickupCode;
  if (notes) delivery.notes = notes;
  if (session.status_timings?.delivered_at) {
    delivery.deliveredAt = session.status_timings.delivered_at;
  }

  return delivery;
}

/**
 * Sincroniza entregas da Takeat com a lista existente de entregas,
 * mesclando novos pedidos e atualizando status sem sobrescrever atribuições manuais.
 */
export async function syncTakeatDeliveries(
  existingDeliveries: Delivery[],
  driversList: Driver[] = []
): Promise<{
  deliveries: Delivery[];
  addedCount: number;
  updatedCount: number;
}> {
  // Busca em paralelo sessões da API pública e os motoboys atribuídos da API PDV / Gestor
  const [sessionsRes, basketsRes, motoboySessionsRes] = await Promise.allSettled([
    fetchTakeatDeliverySessions(),
    fetchTakeatBaskets(),
    fetchTakeatMotoboySessions(),
  ]);

  const sessions = sessionsRes.status === "fulfilled" ? sessionsRes.value : [];
  const basketsMap =
    basketsRes.status === "fulfilled" ? basketsRes.value.sessionMotoboyMap : new Map<number, TakeatAssignedDriver>();
  const motoboySessionsMap =
    motoboySessionsRes.status === "fulfilled" ? motoboySessionsRes.value : new Map<number, TakeatAssignedDriver>();

  // Consolida o mapa de motoboy para cada session_id (cestas ativas têm precedência sobre histórico)
  const assignedMotoboyMap = new Map<number, TakeatAssignedDriver>();
  for (const [sId, m] of motoboySessionsMap.entries()) {
    assignedMotoboyMap.set(sId, m);
  }
  for (const [sId, m] of basketsMap.entries()) {
    assignedMotoboyMap.set(sId, m);
  }

  if (sessions.length === 0 && assignedMotoboyMap.size === 0) {
    return { deliveries: existingDeliveries, addedCount: 0, updatedCount: 0 };
  }

  const existingMap = new Map<string, Delivery>();
  for (const d of existingDeliveries) {
    existingMap.set(d.id, d);
    if (d.platformOrderId) {
      existingMap.set(d.platformOrderId, d);
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  const result: Delivery[] = [...existingDeliveries];

  for (const session of sessions) {
    const takeatId = `takeat-${session.id}`;
    const assignedMotoboy = assignedMotoboyMap.get(session.id);
    const mapped = mapTakeatSessionToDelivery(session, driversList, assignedMotoboy);

    const existing =
      existingMap.get(takeatId) ||
      (mapped.platformOrderId ? existingMap.get(mapped.platformOrderId) : undefined);

    if (existing) {
      let changed = false;
      const idx = result.findIndex((d) => d.id === existing.id);
      if (idx !== -1) {
        const current = result[idx];
        if (current.status !== mapped.status && (mapped.status === "Entregue" || mapped.status === "Problema")) {
          current.status = mapped.status;
          if (mapped.status === "Entregue") {
            current.deliveredAt = mapped.deliveredAt || new Date().toISOString();
          }
          changed = true;
        }
        // Atualiza status se o pedido acabou de ser despachado no Takeat ("Em rota")
        if (current.status !== "Entregue" && mapped.status === "Em rota" && current.status !== "Em rota") {
          current.status = "Em rota";
          changed = true;
        }
        // Se um motoboy foi reconhecido no Takeat e o pedido foi atribuído ou alterado
        if (
          mapped.driver &&
          !mapped.driver.toLowerCase().includes("aguardando") &&
          !mapped.driver.toLowerCase().includes("sem motoboy") &&
          (mapped.driver !== current.driver ||
            current.driver.toLowerCase().includes("sem motoboy") ||
            current.driver.toLowerCase().includes("aguardando") ||
            current.driver.toLowerCase() === "merchant")
        ) {
          current.driver = mapped.driver;
          current.driverId = mapped.driverId;
          changed = true;
        }
        if ((!current.latitude || !current.longitude) && mapped.latitude && mapped.longitude) {
          current.latitude = mapped.latitude;
          current.longitude = mapped.longitude;
          changed = true;
        }
        if (!current.items || current.items.length === 0) {
          current.items = mapped.items;
          current.itemsSummary = mapped.itemsSummary;
          changed = true;
        }
        if (changed) {
          result[idx] = { ...current };
          updatedCount++;
        }
      }
    } else {
      result.unshift(mapped);
      existingMap.set(takeatId, mapped);
      if (mapped.platformOrderId) existingMap.set(mapped.platformOrderId, mapped);
      addedCount++;
    }
  }

  // Geocodifica automaticamente entregas ativas que ainda estejam sem coordenadas GPS
  const pendingGeocode = result.filter(
    (d) => (!d.latitude || !d.longitude) && d.status !== "Entregue" && d.address
  ).slice(0, 5);
  for (const item of pendingGeocode) {
    try {
      const geo = await geocodeDeliveryAddress({
        address: item.address,
        district: item.district,
        city: item.city || "Teixeira de Freitas",
        postalCode: item.postalCode,
      });
      if (geo) {
        item.latitude = geo.latitude;
        item.longitude = geo.longitude;
      }
    } catch {}
  }

  return { deliveries: result, addedCount, updatedCount };
}

/**
 * Mock de pedido Takeat para demonstração e testes rápidos no app
 */
export function getSampleTakeatDelivery(): Delivery {
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sampleId = Math.floor(1000 + Math.random() * 9000);

  return {
    id: `takeat-demo-${sampleId}`,
    order: `#${sampleId}`,
    customer: "Guilherme Santos",
    phone: "(73) 99123-4567",
    address: "Av. Marechal Castelo Branco, 480",
    district: "Centro",
    city: "Teixeira de Freitas",
    state: "BA",
    postalCode: "45985-000",
    latitude: -17.5365,
    longitude: -39.7428,
    amount: 68.5,
    deliveryFee: 7.0,
    payment: "Pago Online (iFood)",
    platform: "ifood",
    platformOrderId: `#IF-${sampleId}`,
    pickupCode: `${Math.floor(1000 + Math.random() * 9000)}`,
    ifoodLocalizer: "84729103",
    priority: "Normal",
    status: "Aguardando",
    driver: "Carlos Eduardo (Kaká)",
    driverId: "driver-1",
    time,
    notes: "Código de Coleta | Ref: Próximo à Praça da Bíblia | Tocar campainha",
    items: [
      {
        id: 1,
        name: "Combo Burger Smash Duplo",
        amount: 1,
        price: 42.0,
        totalPrice: 42.0,
        details: "Ponto da carne: bem passado",
        complements: ["Bacon Crocante", "Maionese Artesanal de Alho"],
      },
      {
        id: 2,
        name: "Batata Frita Rústica G",
        amount: 1,
        price: 18.5,
        totalPrice: 18.5,
        complements: ["Cheddar Cremoso"],
      },
      {
        id: 3,
        name: "Coca-Cola Zero 350ml",
        amount: 1,
        price: 8.0,
        totalPrice: 8.0,
      },
    ],
    itemsSummary: "1x Combo Burger Smash Duplo (Bacon, Maionese), 1x Batata Frita G, 1x Coca-Cola Zero",
    source: "takeat",
    createdAt: now.toISOString(),
  };
}
