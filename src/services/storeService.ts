export type StoreId = "houseburger" | "foodpark" | string;

export interface StoreConfig {
  id: StoreId;
  name: string;
  shortName: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  rtdbPrefix: string;
  hostingDomain: string;
  defaultTakeatEmail: string;
  companyId: string;
}

export const STORES: Record<string, StoreConfig> = {
  houseburger: {
    id: "houseburger",
    name: "House Burger 190 Hamburgueria",
    shortName: "House Burger",
    phone: "(73) 99800-1122",
    address: "Centro, Teixeira de Freitas - BA",
    latitude: -17.5399,
    longitude: -39.7414,
    rtdbPrefix: "rotacerta",
    hostingDomain: "houseburger-entregas.web.app",
    defaultTakeatEmail: "gleucehouse@gmail.com",
    companyId: "house-burger-190",
  },
  foodpark: {
    id: "foodpark",
    name: "House Food Park",
    shortName: "Food Park",
    phone: "(73) 99800-1122",
    address: "Av. Pres. Getúlio Vargas, 5082, Santa Rita, Teixeira de Freitas - BA",
    latitude: -17.5327473,
    longitude: -39.7526662,
    rtdbPrefix: "rotacerta/stores/foodpark",
    hostingDomain: "foodpark-entregas.web.app",
    defaultTakeatEmail: "gleucedias1@gmail.com",
    companyId: "house-foodpark",
  },
};

const dynamicStoresCache: Record<string, StoreConfig> = {};

/**
 * Registra ou atualiza em tempo real as configurações de uma nova loja conectada via Takeat Store
 */
export function registerDynamicStore(store: Partial<StoreConfig> & { id: string; name?: string }): StoreConfig {
  const cleanId = store.id.trim().toLowerCase();
  const existing = STORES[cleanId] || dynamicStoresCache[cleanId];

  const fullConfig: StoreConfig = {
    id: cleanId,
    name: store.name || existing?.name || `Loja ${store.id}`,
    shortName: store.shortName || existing?.shortName || store.name?.split(" ")[0] || `Loja ${store.id}`,
    phone: store.phone || existing?.phone || "",
    address: store.address || existing?.address || "",
    latitude: store.latitude ?? existing?.latitude ?? -17.5399,
    longitude: store.longitude ?? existing?.longitude ?? -39.7414,
    rtdbPrefix: cleanId === "houseburger" ? "rotacerta" : `rotacerta/stores/${cleanId}`,
    hostingDomain: store.hostingDomain || existing?.hostingDomain || (typeof window !== "undefined" ? window.location.hostname : "houseburger-entregas.web.app"),
    defaultTakeatEmail: store.defaultTakeatEmail || existing?.defaultTakeatEmail || "",
    companyId: store.companyId || existing?.companyId || `store-${cleanId}`,
  };

  dynamicStoresCache[cleanId] = fullConfig;

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(`rotacerta_store_cfg_${cleanId}`, JSON.stringify(fullConfig));
    }
  } catch {}

  return fullConfig;
}

/**
 * Detecta a loja ativa com base no hostname (domínio da URL),
 * parâmetro de busca (?store=xyz ou ?loja=xyz) ou localStorage.
 */
export function getActiveStoreId(): StoreId {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const queryStore = (params.get("store") || params.get("loja"))?.toLowerCase().trim();

    if (queryStore) {
      if (queryStore === "foodpark" || queryStore === "housefoodpark") return "foodpark";
      if (queryStore === "houseburger" || queryStore === "house") return "houseburger";
      return queryStore;
    }

    if (hostname.includes("foodpark")) {
      return "foodpark";
    }
    if (hostname.includes("houseburger")) {
      return "houseburger";
    }

    try {
      const stored = localStorage.getItem("rotacerta_active_store_id");
      if (stored && stored.trim()) {
        return stored.trim();
      }
    } catch {}
  }
  return "houseburger";
}

/**
 * Retorna as configurações completas da loja ativa (estática ou dinâmica).
 */
export function getActiveStore(): StoreConfig {
  const id = getActiveStoreId();
  if (STORES[id]) return STORES[id];
  if (dynamicStoresCache[id]) return dynamicStoresCache[id];

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(`rotacerta_store_cfg_${id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.id) {
          dynamicStoresCache[id] = parsed;
          return parsed;
        }
      }
    }
  } catch {}

  return registerDynamicStore({ id });
}

/**
 * Define manualmente a loja ativa.
 */
export function setActiveStore(storeId: StoreId): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("rotacerta_active_store_id", storeId);
    }
  } catch {}
}

/**
 * Retorna o caminho no Firebase Realtime Database para a loja ativa.
 * Exemplo:
 * - Para houseburger: "rotacerta/deliveries", "rotacerta/drivers", "rotacerta/config/takeat"
 * - Para foodpark: "rotacerta/stores/foodpark/deliveries", "rotacerta/stores/foodpark/drivers", "rotacerta/stores/foodpark/config/takeat"
 * - Para qualquer outra loja (ex: loja 241): "rotacerta/stores/241/deliveries", "rotacerta/stores/241/drivers"
 */
export function getRtdbPath(subpath: string): string {
  const store = getActiveStore();
  const cleanSub = subpath.replace(/^\/+/, "");
  return `${store.rtdbPrefix}/${cleanSub}`;
}

/**
 * Retorna uma chave de cache local (localStorage) com namespace da loja.
 */
export function getStoreCacheKey(baseKey: string): string {
  const storeId = getActiveStoreId();
  if (storeId === "houseburger") return baseKey;
  return `${baseKey}_${storeId}`;
}

/**
 * Gera o link de acesso direto para os motoboys da loja
 */
export function getStoreMotoboyLoginUrl(storeId?: string): string {
  const id = storeId || getActiveStoreId();
  const origin = typeof window !== "undefined" ? window.location.origin : "https://houseburger-entregas.web.app";
  return `${origin}/?store=${encodeURIComponent(id)}&role=driver`;
}
