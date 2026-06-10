/**
 * Garde "admin" : protège les routes d'administration (revue des liens, changement
 * de catégorie...). Elle vérifie que la requête porte le bon jeton secret dans
 * l'en-tête HTTP `x-admin-token`. Sans jeton valide -> 401 (accès refusé).
 *
 * Le jeton attendu vient de la variable d'environnement ADMIN_TOKEN (jamais écrit
 * dans le code). Sécurité "par défaut fermée" : si ADMIN_TOKEN n'est pas configuré,
 * on bloque TOUTES ces routes (mieux vaut tout fermer que tout ouvrir par erreur).
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "../config/env";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = getEnv().ADMIN_TOKEN;
    if (!expected) throw new UnauthorizedException("Administration désactivée");
    const req = ctx.switchToHttp().getRequest();
    const provided = String(req.headers["x-admin-token"] ?? "");
    if (!safeEqual(provided, expected)) throw new UnauthorizedException("Jeton admin invalide");
    return true;
  }
}

/**
 * Comparaison à "temps constant" : compare deux chaînes sans que la durée révèle
 * combien de caractères sont corrects. Ça évite qu'un attaquant devine le jeton
 * petit à petit en mesurant le temps de réponse (attaque dite "par timing").
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
