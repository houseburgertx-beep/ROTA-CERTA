export type StoreId = "houseburger" | "foodpark";

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

export const STORES: Record<StoreId, StoreConfig> = {
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
    defaultTakeatEmail: "houseburgertx@gmail.com",
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

/**
 * Detecta a loja ativa com base no hostname (domínio da URL),
 * parâmetro de busca (?store=foodpark) ou localStorage.
 */
export function getActiveStoreId(): StoreId {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    const queryStore = params.get("store")?.toLowerCase();

    if (queryStore === "foodpark" || hostname.includes("foodpark")) {
      return "foodpark";
    }
    if (queryStore === "houseburger" || hostname.includes("houseburger")) {
      return "houseburger";
    }

    try {
      const stored = localStorage.getItem("rotacerta_active_store_id") as StoreId;
      if (stored && STORES[stored]) {
        return stored;
      }
    } catch {}
  }
  return "houseburger";
}

/**
 * Retorna as configurações completas da loja ativa.
 */
export function getActiveStore(): StoreConfig {
  const id = getActiveStoreId();
  return STORES[id] || STORES.houseburger;
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
