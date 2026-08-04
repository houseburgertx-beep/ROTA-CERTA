export type UserRole = "admin" | "driver";
export type DeliveryStatus = "aguardando" | "pronta" | "em_rota" | "entregue" | "falha" | "cancelada";
export type DeliveryPriority = "normal" | "alta" | "urgente";
export interface GeoPoint { latitude:number; longitude:number }
export interface User { id:string; name:string; email:string; phone:string; role:UserRole; companyId:string; active:boolean }
export interface Company { id:string; name:string; phone:string; city:string; state:string; defaultAddress:string; defaultLatitude?:number; defaultLongitude?:number }
export interface Driver { id:string; name:string; phone:string; vehicle:string; plate?:string; userId?:string; active:boolean }
export interface Delivery { id:string; orderNumber:string; customerName:string; customerPhone:string; address:string; district:string; city:string; state:string; postalCode?:string; latitude?:number; longitude?:number; amount:number; deliveryFee:number; paymentMethod:string; priority:DeliveryPriority; status:DeliveryStatus; driverId?:string; source:"manual"|"ocr"|"importação" }
export interface RouteStop { deliveryId:string; position:number; point:GeoPoint }
export interface RoutePlan { id:string; driverId:string; stops:RouteStop[]; totalDistance:number; estimatedDuration:number; optimizationMethod:"openrouteservice"|"vizinho-mais-proximo" }
export interface OCRResult { rawText:string; confidence:number; fields:Partial<Delivery>; warnings:string[] }
export interface GeocodingResult extends GeoPoint { displayName:string }
