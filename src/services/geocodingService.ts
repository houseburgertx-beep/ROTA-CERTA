import type { GeocodingResult, GeoPoint } from "../types";

export type GeocodingProvider =
  | "nominatim"
  | "photon"
  | "geoapify"
  | "locationiq";

const requestTimes = new Map<string, number>();

const env = (name: string) =>
  String((import.meta.env as Record<string, string | undefined>)[name] || "");

const throttledFetch = async (provider: string, url: string) => {
  const minimumInterval = provider === "nominatim" ? 1100 : 250;
  const elapsed = Date.now() - (requestTimes.get(provider) || 0);
  if (elapsed < minimumInterval) {
    await new Promise((resolve) =>
      setTimeout(resolve, minimumInterval - elapsed),
    );
  }
  requestTimes.set(provider, Date.now());
  return fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
};

const providers = (): GeocodingProvider[] => {
  const configured = String(env("VITE_GEOCODING_PROVIDER") || "auto");
  if (configured !== "auto") return [configured as GeocodingProvider];
  return [
    ...(env("VITE_GEOAPIFY_API_KEY") ? (["geoapify"] as const) : []),
    ...(env("VITE_LOCATIONIQ_API_KEY") ? (["locationiq"] as const) : []),
    "nominatim",
    "photon",
  ];
};

async function searchProvider(
  provider: GeocodingProvider,
  address: string,
): Promise<GeocodingResult | null> {
  const query = encodeURIComponent(address);
  if (provider === "nominatim") {
    const response = await throttledFetch(
      provider,
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&addressdetails=1&q=${query}`,
    );
    if (!response.ok) throw new Error("Nominatim indisponível");
    const [item] = await response.json();
    return item
      ? {
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          displayName: item.display_name,
          provider,
        }
      : null;
  }
  if (provider === "photon") {
    const response = await throttledFetch(
      provider,
      `https://photon.komoot.io/api/?limit=1&lang=pt&q=${query}`,
    );
    if (!response.ok) throw new Error("Photon indisponível");
    const item = (await response.json()).features?.[0];
    return item
      ? {
          latitude: Number(item.geometry.coordinates[1]),
          longitude: Number(item.geometry.coordinates[0]),
          displayName:
            item.properties.name ||
            [item.properties.street, item.properties.city, item.properties.state]
              .filter(Boolean)
              .join(", "),
          provider,
        }
      : null;
  }
  if (provider === "geoapify") {
    const response = await throttledFetch(
      provider,
      `https://api.geoapify.com/v1/geocode/search?limit=1&filter=countrycode:br&text=${query}&apiKey=${encodeURIComponent(env("VITE_GEOAPIFY_API_KEY"))}`,
    );
    if (!response.ok) throw new Error("Geoapify indisponível");
    const item = (await response.json()).features?.[0];
    return item
      ? {
          latitude: Number(item.properties.lat),
          longitude: Number(item.properties.lon),
          displayName: item.properties.formatted,
          provider,
        }
      : null;
  }
  const response = await throttledFetch(
    provider,
    `https://us1.locationiq.com/v1/search?format=json&limit=1&countrycodes=br&q=${query}&key=${encodeURIComponent(env("VITE_LOCATIONIQ_API_KEY"))}`,
  );
  if (!response.ok) throw new Error("LocationIQ indisponível");
  const [item] = await response.json();
  return item
    ? {
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        displayName: item.display_name,
        provider,
      }
    : null;
}

export async function geocode(address: string): Promise<GeocodingResult | null> {
  const errors: string[] = [];
  for (const provider of providers()) {
    try {
      const result = await searchProvider(provider, address);
      if (result) return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length === providers().length) {
    throw new Error("Serviços de endereço indisponíveis no momento.");
  }
  return null;
}

export async function geocodeDeliveryAddress(parts: {
  address: string;
  district?: string;
  city?: string;
  postalCode?: string;
}): Promise<GeocodingResult | null> {
  const city = parts.city?.trim() || "Teixeira de Freitas";
  const addressWithoutNumber = parts.address.replace(/[,\s]+(?:n[º°o]?\s*)?\d+[a-z]?\b.*$/i, "").trim();
  const attempts = [
    [parts.address, parts.district, city, "BA", "Brasil"],
    [parts.postalCode, city, "BA", "Brasil"],
    [addressWithoutNumber, parts.district, city, "BA", "Brasil"],
    [parts.address, city, "BA", "Brasil"],
    [parts.district, city, "BA", "Brasil"],
  ].map(values => values.filter(Boolean).join(", ")).filter((value,index,list)=>value&&list.indexOf(value)===index);
  for (const attempt of attempts) {
    const result = await geocode(attempt);
    if (result) return result;
  }
  return null;
}

export async function reverseGeocode(
  point: GeoPoint,
): Promise<GeocodingResult | null> {
  const response = await throttledFetch(
    "nominatim",
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${point.latitude}&lon=${point.longitude}`,
  );
  if (!response.ok) return null;
  const item = await response.json();
  return item?.display_name
    ? { ...point, displayName: item.display_name, provider: "nominatim" }
    : null;
}

export const currentPosition = (options?: PositionOptions) =>
  new Promise<GeoPoint>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada neste aparelho."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      () => reject(new Error("Não foi possível obter sua localização.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000, ...options },
    );
  });
