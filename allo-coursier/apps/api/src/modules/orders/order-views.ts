import { Prisma, StopKind } from '@prisma/client';
import { STATUS_LABELS } from './order-status';

/** Données chargées pour afficher une commande en détail. */
export const orderDetailInclude = {
  stops: { orderBy: { sequence: 'asc' } },
  items: true,
  statusHistory: { orderBy: { createdAt: 'asc' } },
  proofs: { orderBy: { createdAt: 'asc' } },
  city: { select: { id: true, name: true, timezone: true } },
  client: { select: { id: true, firstName: true, lastName: true, phone: true } },
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      driverProfile: {
        select: {
          vehicleType: true,
          plateNumber: true,
          ratingAvg: true,
          ratingCount: true,
          lastLat: true,
          lastLng: true,
          lastLocationAt: true,
          employmentType: true,
        },
      },
    },
  },
  ratings: true,
  merchant: { select: { id: true, name: true, slug: true, phone: true, logoUrl: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

type SignUrl = (key: string | null | undefined) => string | null;

function stopView(stop: OrderDetail['stops'][number], withContact: boolean) {
  return {
    id: stop.id,
    kind: stop.kind,
    lat: stop.lat,
    lng: stop.lng,
    addressText: stop.addressText,
    landmark: stop.landmark,
    contactName: withContact ? stop.contactName : stop.contactName.split(' ')[0],
    contactPhone: withContact ? stop.contactPhone : undefined,
    arrivedAt: stop.arrivedAt,
    completedAt: stop.completedAt,
  };
}

function common(order: OrderDetail) {
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    serviceType: order.serviceType,
    speed: order.speed,
    vehicleType: order.vehicleType,
    city: { id: order.city.id, name: order.city.name },
    scheduledAt: order.scheduledAt,
    packageDescription: order.packageDescription,
    packageSize: order.packageSize,
    isFragile: order.isFragile,
    note: order.note,
    items: order.items.map((i) => ({ id: i.id, label: i.label, quantity: i.quantity, note: i.note, unitPrice: i.unitPrice, options: i.options })),
    merchant: order.merchant ? { id: order.merchant.id, name: order.merchant.name, slug: order.merchant.slug, phone: order.merchant.phone, logoUrl: order.merchant.logoUrl } : null,
    merchantStatus: order.merchantStatus,
    prepMinutes: order.prepMinutes,
    readyAt: order.readyAt,
    distanceKm: Math.round(order.distanceMeters / 10) / 100,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    pickedUpAt: order.pickedUpAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
  };
}

function money(order: OrderDetail) {
  return {
    deliveryFee: order.deliveryFee,
    waitingFee: order.waitingFee,
    discountAmount: order.discountAmount,
    purchaseBudget: order.purchaseBudget,
    purchaseActualAmount: order.purchaseActualAmount,
    itemsSubtotal: order.itemsSubtotal,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    cashCollectAt: order.cashCollectAt,
  };
}

function driverPublic(order: OrderDetail, withPhone: boolean) {
  if (!order.driver) return null;
  const p = order.driver.driverProfile;
  return {
    id: order.driver.id,
    firstName: order.driver.firstName,
    lastName: withPhone ? order.driver.lastName : `${order.driver.lastName.charAt(0)}.`,
    phone: withPhone ? order.driver.phone : undefined,
    avatarUrl: order.driver.avatarUrl,
    vehicleType: p?.vehicleType,
    plateNumber: p?.plateNumber,
    rating: p && p.ratingCount > 0 ? Math.round(p.ratingAvg * 10) / 10 : null,
    location: p?.lastLat != null && p.lastLng != null ? { lat: p.lastLat, lng: p.lastLng, at: p.lastLocationAt } : null,
  };
}

function history(order: OrderDetail) {
  return order.statusHistory.map((h) => ({ status: h.toStatus, label: STATUS_LABELS[h.toStatus], at: h.createdAt, note: h.note }));
}

/** Montant que le livreur doit encaisser à un arrêt (espèces). */
export function amountToCollectAt(order: Pick<OrderDetail, 'paymentMethod' | 'cashCollectAt' | 'deliveryFee' | 'waitingFee' | 'discountAmount' | 'purchaseActualAmount' | 'itemsSubtotal'>, kind: StopKind): number {
  if (order.paymentMethod !== 'CASH') return 0;
  const deliveryNet = Math.max(0, order.deliveryFee + order.waitingFee - order.discountAmount);
  // Achats avancés par le livreur et articles d'un commerçant : toujours payés à la livraison.
  const purchases = kind === StopKind.DROPOFF ? (order.purchaseActualAmount ?? 0) + order.itemsSubtotal : 0;
  const fee = (order.cashCollectAt ?? StopKind.DROPOFF) === kind ? deliveryNet : 0;
  return fee + purchases;
}

export function clientView(order: OrderDetail, sign: SignUrl) {
  const active = !['DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(order.status);
  return {
    ...common(order),
    ...money(order),
    priceBreakdown: order.priceBreakdown,
    stops: order.stops.map((s) => stopView(s, true)),
    driver: driverPublic(order, active),
    deliveryCode: active ? order.deliveryCode : null,
    trackingToken: order.trackingToken,
    history: history(order),
    proofs: order.proofs.map((p) => ({ type: p.type, url: sign(p.fileKey), at: p.createdAt })),
    myRating: order.ratings.find((r) => r.raterId === order.clientId) ?? null,
  };
}

export function driverView(order: OrderDetail, sign: SignUrl) {
  return {
    ...common(order),
    ...money(order),
    commissionAmount: order.commissionAmount,
    driverEarning: order.driverEarning,
    stops: order.stops.map((s) => ({ ...stopView(s, true), amountToCollect: amountToCollectAt(order, s.kind) })),
    client: { firstName: order.client.firstName, phone: order.client.phone },
    history: history(order),
    proofs: order.proofs.map((p) => ({ type: p.type, url: sign(p.fileKey), at: p.createdAt })),
    myRating: order.ratings.find((r) => r.raterId === order.driverId) ?? null,
  };
}

export function adminView(order: OrderDetail, sign: SignUrl) {
  return {
    ...common(order),
    ...money(order),
    priceBreakdown: order.priceBreakdown,
    commissionAmount: order.commissionAmount,
    driverEarning: order.driverEarning,
    merchantCommissionAmount: order.merchantCommissionAmount,
    merchantEarning: order.merchantEarning,
    dispatchAttempts: order.dispatchAttempts,
    stops: order.stops.map((s) => ({ ...stopView(s, true), waitingSeconds: s.waitingSeconds })),
    client: order.client,
    driver: driverPublic(order, true),
    deliveryCode: order.deliveryCode,
    trackingToken: order.trackingToken,
    history: order.statusHistory.map((h) => ({
      status: h.toStatus,
      label: STATUS_LABELS[h.toStatus],
      at: h.createdAt,
      note: h.note,
      actorId: h.actorId,
      actorRole: h.actorRole,
    })),
    proofs: order.proofs.map((p) => ({ type: p.type, url: sign(p.fileKey), verified: p.verified, at: p.createdAt })),
    ratings: order.ratings,
  };
}

/** Suivi public par lien : aucune donnée personnelle hormis le prénom du livreur et du destinataire. */
export function publicTrackingView(order: OrderDetail) {
  const active = ['DRIVER_ASSIGNED', 'DRIVER_AT_PICKUP', 'PURCHASING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_DROPOFF'].includes(order.status);
  const driver = driverPublic(order, false);
  return {
    reference: order.reference,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    city: order.city.name,
    stops: order.stops.map((s) => ({ kind: s.kind, lat: s.lat, lng: s.lng, landmark: s.landmark, contactName: s.contactName.split(' ')[0] })),
    driver: driver && { firstName: driver.firstName, vehicleType: driver.vehicleType, location: active ? driver.location : null },
    history: history(order),
    deliveredAt: order.deliveredAt,
  };
}
