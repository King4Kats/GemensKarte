/**
 * Garde "anti-rafale" pour le tri collaboratif PUBLIC de la quarantaine.
 * Plus permissive que RateLimitGuard (le tri légitime enchaîne plusieurs liens),
 * mais coupe net celui qui mitraille : au-delà de MAX_HITS arbitrages/minute pour
 * une même IP, on renvoie 429 (« time out ») le temps que la fenêtre se vide.
 * État en mémoire (Map au niveau du fichier), suffisant pour un petit service.
 */
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { clientIp } from "./client-ip";

const WINDOW_MS = 60_000; // fenêtre glissante d'une minute
const MAX_HITS = 30; // au-delà de 30 arbitrages/minute pour une même IP -> pause forcée
const hits = new Map<string, number[]>();

@Injectable()
export class TriageRateLimitGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    // IP extraite de façon NON forgeable (cf-connecting-ip / dernière entrée XFF).
    const ip = clientIp(req);

    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_HITS) {
      throw new HttpException(
        "Vous triez trop vite, petite pause d'une minute.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 10_000) hits.clear(); // garde-fou mémoire
    return true;
  }
}
