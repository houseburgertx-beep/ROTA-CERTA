import type { GeoPoint, RouteResult, RoutingProvider } from "../types";

const cache = new Map<string, RouteResult>();
const env = (name: string) =>
  String((import.meta.env as Record<string, string | undefined>)[name] || "");
const radians = (value: number) => (value * Math.PI) / 180;
const haversine = (a: GeoPoint, b: GeoPoint) => {
  const earth = 6371000;
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(lon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};

export function nearestNeighbor(
  start: GeoPoint,
  points: GeoPoint[],
  returnToStart = false,
) {
  const pending = [...points];
  const ordered: GeoPoint[] = [];
  let current = start;
  while (pending.length) {
    let best = 0;
    for (let index = 1; index < pending.length; index += 1) {
      if (haversine(current, pending[index]) < haversine(current, pending[best])) {
        best = index;
      }
    }
    current = pending.splice(best, 1)[0];
    ordered.push(current);
  }
  return returnToStart ? [start, ...ordered, start] : [start, ...ordered];
}

const normalizeGeometry = (coordinates: number[][]): GeoPoint[] =>
  coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));

const routeWithOsrm = async (points: GeoPoint[]): Promise<RouteResult> => {
  const coordinates = points
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(";");
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
  );
  if (!response.ok) throw new Error("OSRM indisponível");
  const route = (await response.json()).routes?.[0];
  if (!route) throw new Error("OSRM não encontrou uma rota");
  return {
    provider: "osrm",
    orderedPoints: points,
    geometry: normalizeGeometry(route.geometry.coordinates),
    distanceMeters: Number(route.distance),
    durationSeconds: Number(route.duration),
  };
};

const routeWithOpenRouteService = async (
  points: GeoPoint[],
): Promise<RouteResult> => {
  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      method: "POST",
      headers: {
        Authorization: env("VITE_OPENROUTESERVICE_API_KEY"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: points.map((point) => [point.longitude, point.latitude]),
      }),
    },
  );
  if (!response.ok) throw new Error("OpenRouteService indisponível");
  const feature = (await response.json()).features?.[0];
  if (!feature) throw new Error("OpenRouteService não encontrou uma rota");
  return {
    provider: "openrouteservice",
    orderedPoints: points,
    geometry: normalizeGeometry(feature.geometry.coordinates),
    distanceMeters: Number(feature.properties.summary.distance),
    durationSeconds: Number(feature.properties.summary.duration),
  };
};

const routeWithGraphHopper = async (
  points: GeoPoint[],
): Promise<RouteResult> => {
  const query = points
    .map((point) => `point=${point.latitude},${point.longitude}`)
    .join("&");
  const response = await fetch(
    `https://graphhopper.com/api/1/route?${query}&vehicle=car&locale=pt-BR&points_encoded=false&key=${encodeURIComponent(env("VITE_GRAPHHOPPER_API_KEY"))}`,
  );
  if (!response.ok) throw new Error("GraphHopper indisponível");
  const route = (await response.json()).paths?.[0];
  if (!route) throw new Error("GraphHopper não encontrou uma rota");
  return {
    provider: "graphhopper",
    orderedPoints: points,
    geometry: normalizeGeometry(route.points.coordinates),
    distanceMeters: Number(route.distance),
    durationSeconds: Number(route.time) / 1000,
  };
};

const routeWithValhalla = async (points: GeoPoint[]): Promise<RouteResult> => {
  const payload = encodeURIComponent(
    JSON.stringify({
      locations: points.map((point) => ({
        lat: point.latitude,
        lon: point.longitude,
      })),
      costing: "auto",
      units: "kilometers",
    }),
  );
  const response = await fetch(
    `https://valhalla1.openstreetmap.de/route?json=${payload}`,
  );
  if (!response.ok) throw new Error("Valhalla indisponível");
  const result = await response.json();
  const summary = result.trip?.summary;
  if (!summary) throw new Error("Valhalla não encontrou uma rota");
  return {
    provider: "valhalla",
    orderedPoints: points,
    geometry: points,
    distanceMeters: Number(summary.length) * 1000,
    durationSeconds: Number(summary.time),
  };
};

const localRoute = (points: GeoPoint[]): RouteResult => {
  const distanceMeters = points
    .slice(1)
    .reduce((sum, point, index) => sum + haversine(points[index], point), 0);
  return {
    provider: "local",
    orderedPoints: points,
    geometry: points,
    distanceMeters,
    durationSeconds: distanceMeters / 8.33 + Math.max(0, points.length - 1) * 480,
  };
};

const providerOrder = (): RoutingProvider[] => {
  const configured = String(env("VITE_ROUTING_PROVIDER") || "auto");
  if (configured !== "auto") return [configured as RoutingProvider, "local"];
  return [
    ...(env("VITE_OPENROUTESERVICE_API_KEY")
      ? (["openrouteservice"] as const)
      : []),
    ...(env("VITE_GRAPHHOPPER_API_KEY")
      ? (["graphhopper"] as const)
      : []),
    "osrm",
    "valhalla",
    "local",
  ];
};

export async function calculateRoute(
  input: GeoPoint[],
  returnToStart = true,
): Promise<RouteResult> {
  if (input.length < 2) throw new Error("Informe ao menos dois pontos.");
  const points = nearestNeighbor(input[0], input.slice(1), returnToStart);
  const key = JSON.stringify({ points, providers: providerOrder() });
  const cached = cache.get(key);
  if (cached) return cached;
  for (const provider of providerOrder()) {
    try {
      const result =
        provider === "openrouteservice"
          ? await routeWithOpenRouteService(points)
          : provider === "graphhopper"
            ? await routeWithGraphHopper(points)
            : provider === "osrm"
              ? await routeWithOsrm(points)
              : provider === "valhalla"
                ? await routeWithValhalla(points)
                : localRoute(points);
      cache.set(key, result);
      return result;
    } catch {
      // Continua automaticamente para o próximo provedor gratuito.
    }
  }
  return localRoute(points);
}
