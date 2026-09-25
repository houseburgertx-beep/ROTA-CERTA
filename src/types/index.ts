export type UserRole = "admin" | "driver";
export type DeliveryStatus =
  | "Aguardando"
  | "Pronta para sair"
  | "Em rota"
  | "Entregue"
  | "Problema"
  | "aguardando"
  | "pronta"
  | "em_rota"
  | "entregue"
  | "falha"
  | "cancelada";

export type DeliveryPriority =
  | "Normal"
  | "Alta"
  | "Urgente"
  | "normal"
  | "alta"
  | "urgente";

export interface GeoPoint { latitude:number; longitude:number }
export interface User { id:string; name:string; email:string; phone:string; role:UserRole; companyId:string; active:boolean; takeatId?: number | string }
export interface Company { id:string; name:string; phone:string; city:string; state:string; defaultAddress:string; defaultLatitude?:number; defaultLongitude?:number }
export interface Driver {
  id: string;
  name: string;
  email?: string;
  phone: string;
  vehicle: string;
  plate?: string;
  defaultFee?: number;
  active: boolean;
  companyId?: string;
  createdAt?: string;
  takeatId?: number | string;
}
export interface OrderItem {
  id?: string | number;
  name: string;
  amount: number;
  price: number;
  totalPrice?: number;
  details?: string;
  complements?: string[];
}

export interface Delivery {
  id: string;
  order: string;
  orderNumber?: string;
  customer: string;
  customerName?: string;
  phone: string;
  customerPhone?: string;
  address: string;
  district: string;
  city?: string;
  state?: string;
  postalCode?: string;
  complement?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  amount: number;
  deliveryFee: number;
  payment: string;
  paymentMethod?: string;
  priority: DeliveryPriority;
  status: DeliveryStatus;
  driver?: string;
  driverId?: string;
  driverPhone?: string;
  time?: string;
  source?: "manual" | "ocr" | "importação" | "takeat";
  platform?: "ifood" | "takeat" | "other";
  platformOrderId?: string;
  pickupCode?: string;
  ifoodLocalizer?: string;
  ifoodConfirmed?: boolean;
  ifoodConfirmedAt?: string;
  items?: OrderItem[];
  itemsSummary?: string;
  notes?: string;
  createdAt?: string;
  deliveredAt?: string;
  driverLocation?: {
    latitude: number;
    longitude: number;
    updatedAt?: string;
    heading?: number;
  };
}
export interface RouteStop { deliveryId:string; position:number; point:GeoPoint }
export type RoutingProvider = "openrouteservice"|"graphhopper"|"osrm"|"valhalla"|"local";
export interface RouteResult { provider:RoutingProvider; orderedPoints:GeoPoint[]; geometry:GeoPoint[]; distanceMeters:number; durationSeconds:number }
export interface RoutePlan { id:string; driverId:string; stops:RouteStop[]; totalDistance:number; estimatedDuration:number; optimizationMethod:RoutingProvider }
export interface OCRResult { rawText:string; confidence:number; fields:Partial<Delivery>; warnings:string[] }
export interface GeocodingResult extends GeoPoint { displayName:string; provider?:string }
export interface DriverLocation extends GeoPoint { id:string;driverId:string;companyId:string;routeId?:string;nextStopId?:string;accuracy?:number|null;heading?:number|null;speed?:number|null;active?:boolean;updatedAt?:unknown }

export interface FinancialStats {
  nightTotal: number;
  nightCount: number;
  monthTotal: number;
  monthCount: number;
  avgFee: number;
}

export interface DriverEarningsSummary {
  driverId: string;
  driverName: string;
  email?: string;
  phone: string;
  vehicle: string;
  takeatId?: number | string;
  nightTotal: number;
  nightCount: number;
  monthTotal: number;
  monthCount: number;
}

