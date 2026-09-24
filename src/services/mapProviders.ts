export type MapTileProvider = "osm" | "esri" | "topographic" | "carto";

export const MAP_TILE_PROVIDERS = {
  osm: {
    name: "OpenStreetMap (Oficial)",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
  esri: {
    name: "Esri Ruas (Alta Definição)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, HERE, Garmin",
    maxZoom: 19,
  },
  topographic: {
    name: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap",
    maxZoom: 17,
  },
  carto: {
    // Redireciona CARTO para OpenStreetMap para nunca mais pedir API Key
    name: "OpenStreetMap Rápido",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
} satisfies Record<
  MapTileProvider,
  { name: string; url: string; attribution: string; maxZoom: number }
>;
