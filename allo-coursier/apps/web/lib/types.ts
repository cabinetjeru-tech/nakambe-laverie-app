export interface User {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  cityScopes: { roleCode: string; cityId: string }[];
  driver: { status: string; cityId: string; vehicleType: string; employmentType: string } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  centerLat: number;
  centerLng: number;
  serviceRadiusKm: number;
  isActive: boolean;
}

export interface PriceLine {
  code: string;
  label: string;
  amount: number;
}

export interface QuoteOption {
  distanceKm: number;
  speed: 'STANDARD' | 'EXPRESS';
  lines: PriceLine[];
  deliveryFee: number;
  commissionAmount: number;
  driverEarning: number;
  purchaseAmount: number;
  totalToPay: number;
  isNight: boolean;
}

export interface Quote {
  city: { id: string; name: string };
  zone: { id: string; name: string } | null;
  distanceKm: number;
  standard: QuoteOption;
  express: QuoteOption;
}

export interface Stop {
  id: string;
  kind: 'PICKUP' | 'DROPOFF';
  lat: number;
  lng: number;
  addressText: string | null;
  landmark: string;
  contactName: string;
  contactPhone?: string;
  arrivedAt: string | null;
  completedAt: string | null;
  amountToCollect?: number;
}

export interface OrderDetail {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  serviceType: string;
  speed: string;
  vehicleType: string;
  city: { id: string; name: string };
  scheduledAt: string | null;
  packageDescription: string | null;
  packageSize: string | null;
  isFragile: boolean;
  note: string | null;
  items: { id: string; label: string; quantity: number; note: string | null; unitPrice?: number | null; options?: { groupName: string; name: string; extraPrice: number }[] | null }[];
  merchant?: { id: string; name: string; slug: string; phone: string; logoUrl: string | null } | null;
  merchantStatus?: 'PENDING' | 'ACCEPTED' | 'READY' | 'REJECTED' | null;
  prepMinutes?: number | null;
  readyAt?: string | null;
  itemsSubtotal?: number;
  distanceKm: number;
  createdAt: string;
  deliveredAt: string | null;
  cancelReason: string | null;
  deliveryFee: number;
  waitingFee: number;
  discountAmount: number;
  purchaseBudget: number | null;
  purchaseActualAmount: number | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  cashCollectAt: 'PICKUP' | 'DROPOFF' | null;
  priceBreakdown?: { lines: PriceLine[] };
  stops: Stop[];
  driver?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    vehicleType?: string;
    plateNumber?: string | null;
    rating: number | null;
    location: { lat: number; lng: number; at: string } | null;
  } | null;
  deliveryCode?: string | null;
  trackingToken?: string;
  history: { status: string; label: string; at: string; note: string | null }[];
  proofs: { type: string; url: string | null; at: string }[];
  myRating?: { score: number } | null;
  payments?: { id: string; provider: string; operator: string | null; amount: number; status: string; providerReference: string | null; failureReason: string | null; createdAt: string }[];
  // Livreur
  client?: { firstName: string; phone: string };
  driverEarning?: number;
  commissionAmount?: number;
  liveWaitingFee?: number;
}

export interface Offer {
  offerId: string;
  orderId: string;
  reference: string;
  serviceType: string;
  speed: string;
  expiresAt: string;
  distanceToPickupKm: number;
  tripDistanceKm: number;
  pickup: { landmark: string; lat: number; lng: number };
  dropoff: { landmark: string; lat: number; lng: number };
  driverEarning: number;
  amountToCollect: number;
  purchaseBudget: number | null;
}

export interface Message {
  id: string;
  senderId: string | null;
  clientMessageId: string | null;
  type: 'TEXT' | 'QUICK_REPLY' | 'LOCATION' | 'IMAGE' | 'SYSTEM';
  body: string | null;
  attachmentUrl: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
  pending?: boolean;
}

export interface WalletView {
  id: string;
  balance: number;
  entries: { id: string; amount: number; balanceAfter: number; createdAt: string; transaction: { type: string; description: string; orderId: string | null } }[];
}
