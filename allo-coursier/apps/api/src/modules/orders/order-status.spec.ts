import { OrderStatus as S, ServiceType } from '@prisma/client';
import { canAdminForce, resolveDriverAction } from './order-status';

describe('resolveDriverAction', () => {
  it('suit le parcours d’un colis', () => {
    expect(resolveDriverAction('ARRIVED_PICKUP', S.DRIVER_ASSIGNED, ServiceType.PARCEL)).toEqual({ to: S.DRIVER_AT_PICKUP });
    expect(resolveDriverAction('PICKED_UP', S.DRIVER_AT_PICKUP, ServiceType.PARCEL)).toEqual({ to: S.IN_TRANSIT });
    expect(resolveDriverAction('ARRIVED_DROPOFF', S.IN_TRANSIT, ServiceType.PARCEL)).toEqual({ to: S.ARRIVED_AT_DROPOFF });
    expect(resolveDriverAction('DELIVER', S.ARRIVED_AT_DROPOFF, ServiceType.PARCEL)).toEqual({ to: S.DELIVERED });
  });

  it('impose l’étape achats pour les courses', () => {
    expect(resolveDriverAction('PICKED_UP', S.DRIVER_AT_PICKUP, ServiceType.ERRAND)).toHaveProperty('error');
    expect(resolveDriverAction('START_PURCHASE', S.DRIVER_AT_PICKUP, ServiceType.ERRAND)).toEqual({ to: S.PURCHASING });
    expect(resolveDriverAction('PICKED_UP', S.PURCHASING, ServiceType.ERRAND)).toEqual({ to: S.IN_TRANSIT });
    expect(resolveDriverAction('START_PURCHASE', S.DRIVER_AT_PICKUP, ServiceType.PARCEL)).toHaveProperty('error');
  });

  it('refuse les sauts d’étape', () => {
    expect(resolveDriverAction('DELIVER', S.IN_TRANSIT, ServiceType.PARCEL)).toHaveProperty('error');
    expect(resolveDriverAction('ARRIVED_PICKUP', S.SEARCHING_DRIVER, ServiceType.PARCEL)).toHaveProperty('error');
    expect(resolveDriverAction('RETURN', S.IN_TRANSIT, ServiceType.PARCEL)).toHaveProperty('error');
  });

  it('gère l’échec puis le retour', () => {
    expect(resolveDriverAction('FAIL', S.ARRIVED_AT_DROPOFF, ServiceType.PARCEL)).toEqual({ to: S.FAILED });
    expect(resolveDriverAction('RETURN', S.FAILED, ServiceType.PARCEL)).toEqual({ to: S.RETURNED });
  });
});

describe('canAdminForce', () => {
  it('autorise les corrections cohérentes seulement', () => {
    expect(canAdminForce(S.IN_TRANSIT, S.DELIVERED)).toBe(true);
    expect(canAdminForce(S.SEARCHING_DRIVER, S.DELIVERED)).toBe(false);
    expect(canAdminForce(S.SEARCHING_DRIVER, S.CANCELLED)).toBe(true);
    expect(canAdminForce(S.DELIVERED, S.CANCELLED)).toBe(false);
    expect(canAdminForce(S.FAILED, S.RETURNED)).toBe(true);
    expect(canAdminForce(S.IN_TRANSIT, S.SEARCHING_DRIVER)).toBe(false);
  });
});
