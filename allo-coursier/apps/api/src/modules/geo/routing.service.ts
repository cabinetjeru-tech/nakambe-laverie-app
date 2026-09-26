import { Inject, Injectable } from '@nestjs/common';
import { haversineKm, LatLng } from '../../common/utils/geo';
import { SettingsService } from '../settings/settings.service';

export interface RouteEstimate {
  distanceKm: number;
  /** Méthode utilisée, conservée dans le détail du prix pour traçabilité. */
  method: string;
}

/**
 * Calcul de la distance entre deux points.
 * Implémentation par défaut gratuite (vol d'oiseau × coefficient routier) ;
 * un fournisseur d'itinéraire réel (ex. OSRM auto-hébergé) pourra la remplacer.
 */
export interface RoutingProvider {
  estimate(from: LatLng, to: LatLng): Promise<RouteEstimate>;
}

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

@Injectable()
export class StraightLineRoutingProvider implements RoutingProvider {
  constructor(private settings: SettingsService) {}

  async estimate(from: LatLng, to: LatLng): Promise<RouteEstimate> {
    const coefficient = await this.settings.get('routing.roadCoefficient');
    const distanceKm = Math.round(haversineKm(from, to) * coefficient * 100) / 100;
    return { distanceKm, method: `vol d'oiseau × ${coefficient}` };
  }
}

export const STRAIGHT_LINE_ROUTING = { provide: ROUTING_PROVIDER, useClass: StraightLineRoutingProvider };

@Injectable()
export class RoutingService {
  constructor(@Inject(ROUTING_PROVIDER) private provider: RoutingProvider) {}

  /** Distance totale d'un trajet passant par plusieurs points, dans l'ordre. */
  async estimatePath(points: LatLng[]): Promise<RouteEstimate> {
    let distanceKm = 0;
    let method = '';
    for (let i = 1; i < points.length; i++) {
      const leg = await this.provider.estimate(points[i - 1], points[i]);
      distanceKm += leg.distanceKm;
      method = leg.method;
    }
    return { distanceKm: Math.round(distanceKm * 100) / 100, method };
  }
}
