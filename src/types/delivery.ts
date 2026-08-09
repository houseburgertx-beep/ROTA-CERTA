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
  phone: string;
  address: string;
  number: string;
  district: string;
  complement?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  amount: number;
  paymentMethod: string;
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
