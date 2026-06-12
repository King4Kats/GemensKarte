/**
 * Extraction FIABLE de l'adresse IP du visiteur derrière nos proxys.
 *
 * Pourquoi c'est sensible : l'en-tête `x-forwarded-for` est une LISTE où chaque
 * proxy AJOUTE l'adresse qu'il voit à la FIN. Le début de la liste est fourni par
 * le client lui-même : il peut y écrire n'importe quoi. Prendre la première
 * entrée permettrait donc de contourner tous nos rate-limits en forgeant une
 * fausse IP à chaque requête.
 *
 * Notre chaîne réelle : visiteur -> Cloudflare (tunnel) -> nginx -> API.
 * - `cf-connecting-ip` est posé par Cloudflare et écrase toute valeur envoyée
 *   par le client : c'est la source la plus sûre quand on passe par le tunnel.
 * - À défaut, on prend la DERNIÈRE entrée de `x-forwarded-for` (celle ajoutée
 *   par notre propre proxy, non forgeable), jamais la première.
 */
export function clientIp(req: {
  headers: Record<string, unknown>;
  ip?: string;
}): string {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd.join(",") : typeof fwd === "string" ? fwd : "";
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length) return parts[parts.length - 1];
  return String(req.ip ?? "?");
}
