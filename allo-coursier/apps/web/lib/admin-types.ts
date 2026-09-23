export interface StatsOverview {
  period: { from: string; to: string };
  orders: { created: number; delivered: number; cancelled: number; failed: number; inProgressNow: number; byService: { serviceType: string; delivered: number; deliveryFees: number }[] };
  money: { deliveryRevenue: number; discounts: number; commissions: number; driverEarnings: number; purchasesAdvanced: number; averageBasket: number };
  timings: { averageAcceptMinutes: number | null; averageDeliveryMinutes: number | null };
  people: { newClients: number; driversOnline: number; driversApproved: number; driversPending: number };
  todo: { pendingPayments: number; openComplaints: number; pendingPayouts: number; driversPending: number };
  daily: { day: string; created: number; delivered: number; revenue: number }[];
}

export interface UserRow {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  secretKind: string;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
  roles: { cityId: string | null; role: { id: string; code: string; name: string } }[];
}

