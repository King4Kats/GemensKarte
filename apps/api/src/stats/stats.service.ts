/**
 * Service "Stats" : c'est ici qu'on calcule les chiffres affichés sur la carte
 * (combien d'associations au total, combien sont géolocalisées, ont un site web,
 * un Facebook, etc.). Il interroge la base PostgreSQL avec une seule requête SQL,
 * puis transforme le résultat en nombres + pourcentages prêts à afficher.
 */
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";

@Injectable()
export class StatsService {
  // On reçoit ici l'accès à la base de données (db), fourni automatiquement par NestJS.
  constructor(@Inject(DB) private readonly db: Db) {}

  // Récupère toutes les statistiques en une seule requête, puis les met en forme.
  async getStats() {
    const rows = await this.db.execute<{
      total: number;
      geolocalisees: number;
      avec_description: number;
      avec_website: number;
      avec_facebook: number;
      avec_linkedin: number;
      avec_instagram: number;
      avec_social: number;
      enrichies: number;
    }>(sql`
      -- count(*) FILTER (WHERE ...) = compte seulement les lignes qui remplissent une condition.
      -- L'opérateur "?" teste si une clé existe dans la colonne "social" (un champ jsonb = du JSON
      -- stocké en base). On ne compte que les associations "published" (publiées, donc visibles).
      SELECT
        count(*)::int                                                          AS total,
        count(*) FILTER (WHERE location IS NOT NULL)::int                     AS geolocalisees,
        count(*) FILTER (WHERE description IS NOT NULL)::int                  AS avec_description,
        count(*) FILTER (WHERE social ? 'website')::int                       AS avec_website,
        count(*) FILTER (WHERE social ? 'facebook')::int                      AS avec_facebook,
        count(*) FILTER (WHERE social ? 'linkedin')::int                      AS avec_linkedin,
        count(*) FILTER (WHERE social ? 'instagram')::int                     AS avec_instagram,
        count(*) FILTER (WHERE social != '{}'::jsonb)::int                    AS avec_social,
        count(*) FILTER (WHERE meta ? 'enrichedAt')::int                      AS enrichies
      FROM associations
      WHERE status = 'published'
    `);

    // La requête ne renvoie qu'une seule ligne de totaux : on la récupère ici.
    const r = rows.rows[0]!;
    const total = r.total;

    // Pour chaque indicateur on renvoie n (le nombre brut) et pct (le pourcentage par rapport au total).
    return {
      total,
      geolocalisees:    { n: r.geolocalisees,    pct: pct(r.geolocalisees, total) },
      avecDescription:  { n: r.avec_description, pct: pct(r.avec_description, total) },
      avecWebsite:      { n: r.avec_website,      pct: pct(r.avec_website, total) },
      avecFacebook:     { n: r.avec_facebook,     pct: pct(r.avec_facebook, total) },
      avecLinkedin:     { n: r.avec_linkedin,      pct: pct(r.avec_linkedin, total) },
      avecInstagram:    { n: r.avec_instagram,    pct: pct(r.avec_instagram, total) },
      avecSocial:       { n: r.avec_social,       pct: pct(r.avec_social, total) },
      enrichies:        { n: r.enrichies,         pct: pct(r.enrichies, total) },
      ficheVide:        { n: total - r.avec_social, pct: pct(total - r.avec_social, total) },
    };
  }

  // Avancement des passes ciblées par plateforme (même calcul que progress.py) :
  // scannées / restantes / validées / %, pour l'afficher en direct sur l'accueil.
  async getProgress() {
    const parts: string[] = [];
    for (const p of PLATEFORMES) {
      // "restantes" = exactement les conditions de fetch_pending de discover_targeted.py.
      const rest = [
        "location IS NOT NULL",
        `NOT (COALESCE(social,'{}'::jsonb) ? '${p.col}')`,
        `(meta ? '${p.marker}') IS NOT TRUE`,
      ];
      if (p.social) {
        rest.push(`NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"${p.key}"}]'::jsonb)`);
      }
      parts.push(`count(*) FILTER (WHERE meta ? '${p.marker}')::int AS ${p.key}_scan`);
      parts.push(`count(*) FILTER (WHERE ${rest.join(" AND ")})::int AS ${p.key}_rest`);
      parts.push(`count(*) FILTER (WHERE social ? '${p.col}')::int AS ${p.key}_val`);
    }
    parts.push("count(*)::int AS total");
    const rows = await this.db.execute<Record<string, number>>(
      sql.raw(`SELECT ${parts.join(", ")} FROM associations`),
    );
    const d = rows.rows[0]!;
    return {
      territory: TERRITOIRE_EN_COURS,
      next: PROCHAIN_TERRITOIRE,
      total: d.total,
      platforms: PLATEFORMES.map((p) => {
        const scanned = d[`${p.key}_scan`];
        const remaining = d[`${p.key}_rest`];
        const denom = scanned + remaining;
        return {
          key: p.key,
          label: p.label,
          scanned,
          remaining,
          validated: d[`${p.key}_val`],
          pct: denom ? Math.round((scanned / denom) * 1000) / 10 : 100,
        };
      }),
    };
  }
}

// Territoire en cours d'enrichissement + prochain prévu (affichés sur l'accueil).
// À changer ici quand on bascule de territoire.
const TERRITOIRE_EN_COURS = "Vendée";
const PROCHAIN_TERRITOIRE = "Lot";

// Plateformes suivies par les passes ciblées (mêmes marqueurs/conditions que
// discover_targeted.py et progress.py). `social: true` = passe réseau social.
const PLATEFORMES = [
  { key: "instagram", label: "Instagram", col: "instagram", marker: "igTargetedAt", social: true },
  { key: "facebook", label: "Facebook", col: "facebook", marker: "fbTargetedAt", social: true },
  { key: "helloasso", label: "HelloAsso", col: "helloasso", marker: "helloassoCheckedAt", social: true },
  { key: "website", label: "Site web", col: "website", marker: "webTargetedAt", social: false },
] as const;

// Calcule un pourcentage arrondi à un chiffre après la virgule (ex: 42.7).
// Protège contre la division par zéro (si aucune association, on renvoie 0).
function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}
