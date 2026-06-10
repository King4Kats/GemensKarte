// Service de géocodage : prend une adresse écrite en texte (ex: "12 rue des Lilas, Nantes")
// et la transforme en coordonnées GPS (longitude/latitude) pour pouvoir la placer sur la carte.
// Il interroge pour cela un service public gratuit de l'État (la Base Adresse Nationale).
import { Injectable, Logger } from "@nestjs/common";
import { getEnv } from "../config/env";

// Forme du résultat renvoyé : un point sur la carte (longitude, latitude) + un score de fiabilité.
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
    if (!q) return null; // Adresse vide : rien à chercher.

    // On construit l'adresse web (URL) de l'API avec l'adresse à chercher en paramètre.
    // "limit=1" = on ne veut que le meilleur résultat ; "postcode" affine la recherche si fourni.
    const url = new URL("/search/", this.baseUrl);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");
    if (postalCode) url.searchParams.set("postcode", postalCode);

    try {
      // On appelle l'API. AbortSignal.timeout(8000) = on abandonne au bout de 8 secondes
      // pour ne pas bloquer l'application si le service ne répond pas.
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        this.logger.warn(`BAN ${res.status} pour "${q}"`);
        return null;
      }
      const data = (await res.json()) as {
        features?: Array<{ geometry: { coordinates: [number, number] }; properties: { score: number } }>;
      };
      // L'API renvoie une liste de résultats ("features") ; on prend le premier (le meilleur).
      const f = data.features?.[0];
      if (!f) return null; // Aucune adresse trouvée.
      const [lng, lat] = f.geometry.coordinates;
      return { lng, lat, score: f.properties.score };
    } catch (err) {
      this.logger.warn(`Géocodage indisponible pour "${q}": ${(err as Error).message}`);
      return null;
    }
  }
}
