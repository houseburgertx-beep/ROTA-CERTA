export type DeliveryRecordStatus =
  | "pending"
  | "assigned"
  | "on_route"
  | "arrived"
  | "delivered"
  | "problem"
  | "cancelled";

export type DeliveryRecord = {
  id: string;
  companyId: string;
  customerId?: string;
  customerName: string;
  orderNumber: string;
  phone: string;
  address: string;
  number: string;
  district: string;
  city?: string;
  postalCode?: string;
  complement?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  amount: number;
  deliveryFee: number;
  paymentMethod: string;
  priority?: "normal" | "high" | "urgent";
  source?: "manual" | "ocr";
  notes?: string;
  status: DeliveryRecordStatus;
  driverId?: string;
  routeId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  deliveredAt?: unknown;
};

export type NewDeliveryRecord = Omit<
  DeliveryRecord,
  "id" | "createdAt" | "updatedAt" | "deliveredAt"
>;
