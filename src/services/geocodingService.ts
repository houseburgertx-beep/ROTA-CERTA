import type { GeocodingResult } from "../types";
let lastRequest=0;
export async function geocode(address:string):Promise<GeocodingResult|null>{
  const wait=Math.max(0,1100-(Date.now()-lastRequest)); if(wait) await new Promise(r=>setTimeout(r,wait)); lastRequest=Date.now();
  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`,{headers:{"Accept-Language":"pt-BR"}});
  if(!r.ok) throw new Error("Serviço de endereços indisponível."); const [item]=await r.json(); return item?{latitude:Number(item.lat),longitude:Number(item.lon),displayName:item.display_name}:null;
}
