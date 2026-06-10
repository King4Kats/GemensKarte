/**
 * Garde "anti-spam" : limite le nombre de requêtes par adresse IP sur une courte
 * fenêtre de temps. On la pose sur les formulaires publics (référencement, contact)
 * pour empêcher un envoi en masse (robot qui spamme). Mémoire simple en RAM,
 * suffisante pour un petit service auto-hébergé.
 */
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";

const WINDOW_MS = 60_000; // fenêtre glissante d'une minute
const MAX_HITS = 6; // au-delà de 6 envois/minute pour une même IP -> refusé
// IP -> horodatages récents. Déclaré au niveau du fichier pour être partagé
// par toutes les routes qui utilisent cette garde (état commun en mémoire).
const hits = new Map<string, number[]>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    // Derrière un proxy (nginx/Cloudflare), la vraie IP du visiteur est dans
    // l'en-tête `x-forwarded-for` ; sinon on prend l'IP vue directement.
    const fwd = req.headers["x-forwarded-for"];
    const ip = String((Array.isArray(fwd) ? fwd[0] : fwd) || req.ip || "?").split(",")[0].trim();

    const now = Date.now();
    // On ne garde que les envois encore dans la fenêtre d'une minute.
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_HITS) {
      throw new HttpException("Trop de requêtes, réessayez dans une minute.", HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) hits.clear(); // garde-fou : évite que la mémoire gonfle à l'infini
    return true;
  }
}
