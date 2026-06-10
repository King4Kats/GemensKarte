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
}

// Calcule un pourcentage arrondi à un chiffre après la virgule (ex: 42.7).
// Protège contre la division par zéro (si aucune association, on renvoie 0).
function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
}
