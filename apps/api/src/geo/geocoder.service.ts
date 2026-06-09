import { Injectable, Logger } from "@nestjs/common";
import { getEnv } from "../config/env";

export interface GeoPoint {
  lng: number;
  lat: number;
  /** Indice de confiance BAN (0..1). */
  score?: number;
}

/**
 * Géocodeur basé sur la Base Adresse Nationale (open data, gratuit).
 * https://api-adresse.data.gouv.fr — transforme une adresse en coordonnées.
 */
@Injectable()
export class GeocoderService {
  private readonly logger = new Logger(GeocoderService.name);
  private readonly baseUrl = getEnv().BAN_GEOCODER_URL;

  /** Géocode une adresse libre, optionnellement contrainte par code postal. */
  async geocode(query: string, postalCode?: string): Promise<GeoPoint | null> {
    const q = query.trim();
    if (!q) return null;

    const url = new URL("/search/", this.baseUrl);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");
    if (postalCode) url.searchParams.set("postcode", postalCode);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        this.logger.warn(`BAN ${res.status} pour "${q}"`);
        return null;
      }
      const data = (await res.json()) as {
        features?: Array<{ geometry: { coordinates: [number, number] }; properties: { score: number } }>;
      };
      const f = data.features?.[0];
      if (!f) return null;
      const [lng, lat] = f.geometry.coordinates;
      return { lng, lat, score: f.properties.score };
    } catch (err) {
      this.logger.warn(`Géocodage indisponible pour "${q}": ${(err as Error).message}`);
      return null;
    }
  }
}
