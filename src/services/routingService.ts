import type { GeoPoint } from "../types";
const cache = new Map<string, unknown>();
const distance = (a:GeoPoint,b:GeoPoint) => Math.hypot(a.latitude-b.latitude,a.longitude-b.longitude);
export function nearestNeighbor(start:GeoPoint, points:GeoPoint[], returnToStart=false){
  const pending=[...points], ordered:GeoPoint[]=[]; let current=start;
  while(pending.length){ let best=0; for(let i=1;i<pending.length;i++) if(distance(current,pending[i])<distance(current,pending[best])) best=i; current=pending.splice(best,1)[0]; ordered.push(current); }
  return returnToStart?[...ordered,start]:ordered;
}
export async function calculateRoute(points:GeoPoint[]){
  const key=JSON.stringify(points); if(cache.has(key)) return cache.get(key);
  const apiKey=process.env.VITE_OPENROUTESERVICE_API_KEY;
  if(!apiKey) return {points:nearestNeighbor(points[0],points.slice(1)),method:"vizinho-mais-proximo" as const};
  const response=await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson",{method:"POST",headers:{Authorization:apiKey,"Content-Type":"application/json"},body:JSON.stringify({coordinates:points.map(p=>[p.longitude,p.latitude])})});
  if(!response.ok) throw new Error("Não foi possível calcular a rota."); const result=await response.json(); cache.set(key,result); return result;
}
