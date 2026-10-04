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

export function decodeValhallaPolyline(str: string, precision = 6): GeoPoint[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: GeoPoint[] = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return coordinates;
}

const routeWithValhalla = async (points: GeoPoint[]): Promise<RouteResult> => {
  const isMultiStop = points.length > 2;
  const endpoint = isMultiStop ? "optimized_route" : "route";
  const payload = encodeURIComponent(
    JSON.stringify({
      locations: points.map((point) => ({
        lat: point.latitude,
        lon: point.longitude,
      })),
      costing: "motorcycle",
      units: "kilometers",
    }),
  );
  const response = await fetch(
    `https://valhalla1.openstreetmap.de/${endpoint}?json=${payload}`,
  );
  if (!response.ok) throw new Error("Valhalla indisponível");
  const result = await response.json();
  const summary = result.trip?.summary;
  if (!summary) throw new Error("Valhalla não encontrou uma rota");

  let orderedPoints = points;
  if (isMultiStop && Array.isArray(result.trip?.locations)) {
    const reordered: GeoPoint[] = [];
    for (const loc of result.trip.locations) {
      if (typeof loc.original_index === "number" && points[loc.original_index]) {
        reordered.push(points[loc.original_index]);
      }
    }
    if (reordered.length === points.length) {
      orderedPoints = reordered;
    }
  }

  const geometry: GeoPoint[] = [];
  if (Array.isArray(result.trip?.legs)) {
    for (const leg of result.trip.legs) {
      if (leg.shape) {
        const decoded = decodeValhallaPolyline(leg.shape);
        if (geometry.length > 0 && decoded.length > 0) {
          geometry.push(...decoded.slice(1));
        } else {
          geometry.push(...decoded);
        }
      }
    }
  }

  return {
    provider: "valhalla",
    orderedPoints,
    geometry: geometry.length > 0 ? geometry : orderedPoints,
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

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function optimizeDeliverySequence<T extends { id: string; latitude?: number; longitude?: number }>(
  deliveries: T[],
  startPoint: GeoPoint,
): {
  ordered: T[];
  distancesMeters: Record<string, number>;
} {
  const withCoords: T[] = [];
  const withoutCoords: T[] = [];

  for (const d of deliveries) {
    if (
      typeof d.latitude === "number" &&
      typeof d.longitude === "number" &&
      !isNaN(d.latitude) &&
      !isNaN(d.longitude)
    ) {
      withCoords.push(d);
    } else {
      withoutCoords.push(d);
    }
  }

  const ordered: T[] = [];
  const distancesMeters: Record<string, number> = {};
  const pending = [...withCoords];
  let current: GeoPoint = startPoint;

  while (pending.length > 0) {
    let bestIdx = 0;
    let minDistance = haversine(current, {
      latitude: pending[0].latitude!,
      longitude: pending[0].longitude!,
    });

    for (let i = 1; i < pending.length; i++) {
      const dist = haversine(current, {
        latitude: pending[i].latitude!,
        longitude: pending[i].longitude!,
      });
      if (dist < minDistance) {
        minDistance = dist;
        bestIdx = i;
      }
    }

    const chosen = pending.splice(bestIdx, 1)[0];
    distancesMeters[chosen.id] = Math.round(minDistance);
    ordered.push(chosen);
    current = { latitude: chosen.latitude!, longitude: chosen.longitude! };
  }

  return {
    ordered: [...ordered, ...withoutCoords],
    distancesMeters,
  };
}

export interface ValhallaOptimizedSequenceResult<T> {
  ordered: T[];
  distancesMeters: Record<string, number>;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  geometry: GeoPoint[];
  provider: "valhalla-vrp" | "local";
}

export async function optimizeDeliverySequenceValhalla<
  T extends { id: string; latitude?: number; longitude?: number }
>(
  deliveries: T[],
  startPoint: GeoPoint,
  returnToStart = true,
): Promise<ValhallaOptimizedSequenceResult<T>> {
  const withCoords: T[] = [];
  const withoutCoords: T[] = [];

  for (const d of deliveries) {
    if (
      typeof d.latitude === "number" &&
      typeof d.longitude === "number" &&
      !isNaN(d.latitude) &&
      !isNaN(d.longitude)
    ) {
      withCoords.push(d);
    } else {
      withoutCoords.push(d);
    }
  }

  // Fallback rápido se não houver paradas suficientes para roteirizar
  if (withCoords.length === 0) {
    return {
      ordered: withoutCoords,
      distancesMeters: {},
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      geometry: [],
      provider: "local",
    };
  }

  if (withCoords.length === 1) {
    const single = withCoords[0];
    const dist = Math.round(
      haversine(startPoint, {
        latitude: single.latitude!,
        longitude: single.longitude!,
      }),
    );
    return {
      ordered: [single, ...withoutCoords],
      distancesMeters: { [single.id]: dist },
      totalDistanceMeters: dist * (returnToStart ? 2 : 1),
      totalDurationSeconds: Math.round(dist / 8.33 + 180),
      geometry: returnToStart
        ? [startPoint, { latitude: single.latitude!, longitude: single.longitude! }, startPoint]
        : [startPoint, { latitude: single.latitude!, longitude: single.longitude! }],
      provider: "local",
    };
  }

  // Tenta resolver o VRP / Caixeiro Viajante com Valhalla /optimized_route
  try {
    const locations = [
      { lat: startPoint.latitude, lon: startPoint.longitude },
      ...withCoords.map((d) => ({ lat: d.latitude!, lon: d.longitude! })),
      ...(returnToStart ? [{ lat: startPoint.latitude, lon: startPoint.longitude }] : []),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const payload = encodeURIComponent(
      JSON.stringify({
        locations,
        costing: "motorcycle",
        costing_options: {
          motorcycle: {
            use_highways: 0.8,
            use_trails: 0.1,
          },
        },
        units: "kilometers",
      }),
    );

    const response = await fetch(
      `https://valhalla1.openstreetmap.de/optimized_route?json=${payload}`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) throw new Error(`Valhalla VRP status: ${response.status}`);
    const data = await response.json();
    const tripLocations = data.trip?.locations;

    if (!Array.isArray(tripLocations) || tripLocations.length < 2) {
      throw new Error("Resposta de locais inválida do Valhalla");
    }

    const orderedDeliveries: T[] = [];
    const distancesMeters: Record<string, number> = {};
    const seenIndices = new Set<number>();

    for (let i = 1; i < tripLocations.length; i++) {
      const origIdx = tripLocations[i].original_index;
      if (origIdx > 0 && origIdx <= withCoords.length && !seenIndices.has(origIdx)) {
        seenIndices.add(origIdx);
        const item = withCoords[origIdx - 1];
        orderedDeliveries.push(item);
      }
    }

    // Caso algum ponto com coordenadas tenha ficado de fora, adiciona no final
    for (let i = 0; i < withCoords.length; i++) {
      const idx = i + 1;
      if (!seenIndices.has(idx)) {
        orderedDeliveries.push(withCoords[i]);
      }
    }

    // Extrai distâncias de cada trecho (legs) e decodifica a geometria viária real
    const legs = data.trip?.legs;
    const fullGeometry: GeoPoint[] = [];

    if (Array.isArray(legs)) {
      for (let legIdx = 0; legIdx < legs.length; legIdx++) {
        const leg = legs[legIdx];
        if (leg.shape) {
          const legCoords = decodeValhallaPolyline(leg.shape);
          if (fullGeometry.length > 0 && legCoords.length > 0) {
            fullGeometry.push(...legCoords.slice(1));
          } else {
            fullGeometry.push(...legCoords);
          }
        }
        // Atribui distância para a parada correspondente
        if (legIdx < orderedDeliveries.length) {
          const deliveryId = orderedDeliveries[legIdx].id;
          const legDistMeters = Math.round(Number(leg.summary?.length || 0) * 1000);
          distancesMeters[deliveryId] = legDistMeters;
        }
      }
    }

    const totalDistMeters = Math.round(Number(data.trip?.summary?.length || 0) * 1000);
    const totalDuration = Math.round(Number(data.trip?.summary?.time || 0));

    return {
      ordered: [...orderedDeliveries, ...withoutCoords],
      distancesMeters,
      totalDistanceMeters: totalDistMeters,
      totalDurationSeconds: totalDuration,
      geometry: fullGeometry,
      provider: "valhalla-vrp",
    };
  } catch (err) {
    // Fallback gracioso para o algoritmo local (Nearest Neighbor com haversine)
    console.warn("Valhalla VRP indisponível ou falhou, usando fallback local:", err);
    const localRes = optimizeDeliverySequence(deliveries, startPoint);
    const totalMeters = Object.values(localRes.distancesMeters).reduce((a, b) => a + b, 0);

    return {
      ordered: localRes.ordered,
      distancesMeters: localRes.distancesMeters,
      totalDistanceMeters: totalMeters,
      totalDurationSeconds: Math.round(totalMeters / 8.33 + localRes.ordered.length * 180),
      geometry: [
        startPoint,
        ...localRes.ordered
          .filter((d) => typeof d.latitude === "number" && typeof d.longitude === "number")
          .map((d) => ({ latitude: d.latitude!, longitude: d.longitude! })),
        ...(returnToStart ? [startPoint] : []),
      ],
      provider: "local",
    };
  }
}

