/**
 * Service "Stats" : c'est ici qu'on calcule les chiffres affichés sur la carte
 * (combien d'associations au total, combien sont géolocalisées, ont un site web,
 * un Facebook, etc.). Il interroge la base PostgreSQL avec une seule requête SQL,
 * puis transforme le résultat en nombres + pourcentages prêts à afficher.
 */
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DB, type Db } from "../db/db.module";

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes en millisecondes

@Injectable()
export class StatsService implements OnModuleInit {
  private cacheStats: { data: any; exp: number } | null = null;
  private cacheProgress: { data: any; exp: number } | null = null;
  private cacheTerritory: { data: any; exp: number } | null = null;

  // On reçoit ici l'accès à la base de données (db), fourni automatiquement par NestJS.
  constructor(@Inject(DB) private readonly db: Db) {}

  // Pré-calcule les stats en arrière-plan au démarrage du serveur
  onModuleInit() {
    this.warmupCaches();
    setInterval(() => this.warmupCaches(), 1000 * 60 * 4);
  }

  private async warmupCaches() {
    try {
      await Promise.all([
        this.getStats(),
        this.getProgress(),
        this.getByTerritory()
      ]);
    } catch (err) {
      console.error("Erreur lors du pré-calcul des stats:", err);
    }
  }

  private pendingStats: Promise<any> | null = null;
  async getStats() {
    if (this.cacheStats && Date.now() < this.cacheStats.exp) return this.cacheStats.data;
    if (this.pendingStats) return this.pendingStats;
    this.pendingStats = this.forceGetStats().finally(() => { this.pendingStats = null; });
    return this.pendingStats;
  }

  private async forceGetStats() {
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
    const res = {
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
    this.cacheStats = { data: res, exp: Date.now() + CACHE_TTL };
    return res;
  }

  /** Enregistre un hit de fréquentation anonyme (kind='page'|'region'). */
  async track(visitor: string, kind: string, pathStr: string | null, dept: string | null) {
    await this.db.execute(sql`
      INSERT INTO visits (kind, path, dept, visitor)
      VALUES (${kind}, ${pathStr}, ${dept}, ${visitor})
    `);
  }

  // Reliquat de travail ("fiches à faire", mêmes conditions que target_dept.py /
  // discover_targeted.py) PAR département, en UNE requête groupée.
  private async deptWorkload(): Promise<Map<string, number>> {
    const codes = DEPT_ORDER.map(([c]) => `'${c}'`).join(", ");
    const rows = await this.db.execute<{ department: string; inwork: number }>(
      sql.raw(`
        SELECT department, count(*)::int AS inwork
        FROM associations
        WHERE department IN (${codes}) AND location IS NOT NULL AND (
          (meta->'discovery') IS NULL
          OR ((meta->>'fbTargetedAt') IS NULL AND NOT (COALESCE(social,'{}'::jsonb) ? 'facebook')
              AND NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"facebook"}]'::jsonb))
          OR ((meta->>'igTargetedAt') IS NULL AND NOT (COALESCE(social,'{}'::jsonb) ? 'instagram')
              AND NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"instagram"}]'::jsonb))
          OR ((meta->>'webTargetedAt') IS NULL AND NOT (COALESCE(social,'{}'::jsonb) ? 'website'))
          OR ((meta->>'helloassoCheckedAt') IS NULL AND NOT (COALESCE(social,'{}'::jsonb) ? 'helloasso')
              AND NOT (COALESCE(meta->'discovery'->'socialCandidates','[]'::jsonb) @> '[{"platform":"helloasso"}]'::jsonb))
        )
        GROUP BY department
      `),
    );
    const m = new Map<string, number>();
    for (const r of rows.rows) m.set(r.department, r.inwork);
    return m;
  }

  // Territoire « en cours » + liste des terminés, calculés PAR département (robuste).
  // Un département compte comme "terminé" (carte: vert) dès que son reliquat passe SOUS
  // le seuil de tolérance. Pourquoi un seuil : certaines fiches restent bloquées "à faire"
  // à vie (recherche DDG qui a échoué sans poser son marqueur) ; sans tolérance, un tel
  // résidu en tête de liste masquerait tous les départements suivants déjà finis et
  // figerait le "territoire en cours" sur un département quasi terminé.
  private async activeDept(): Promise<{ code: string; nom: string; next: string; done: string[] }> {
    const work = await this.deptWorkload();
    const remaining = (c: string) => work.get(c) ?? 0;
    // Terminés = TOUS les dépts sous le seuil (indépendamment de leur position dans l'ordre).
    const done = DEPT_ORDER.filter(([c]) => remaining(c) <= RESIDU_TOLERE).map(([c]) => c);
    // Actif = 1er dépt de l'ordre avec un VRAI reste de travail (> seuil) = le front réel.
    const idx = DEPT_ORDER.findIndex(([c]) => remaining(c) > RESIDU_TOLERE);
    if (idx === -1) {
      const last = DEPT_ORDER[DEPT_ORDER.length - 1];
      return { code: last[0], nom: last[1], next: "—", done: DEPT_ORDER.slice(0, -1).map((d) => d[0]) };
    }
    const [code, nom] = DEPT_ORDER[idx];
    const nextEntry = DEPT_ORDER.find(([c], i) => i > idx && remaining(c) > RESIDU_TOLERE);
    return { code, nom, next: nextEntry?.[1] ?? "—", done };
  }

  // Avancement des passes ciblées par plateforme (même calcul que progress.py) :
  // scannées / restantes / validées / %, pour l'afficher en direct sur l'accueil.
  private pendingProgress: Promise<any> | null = null;
  async getProgress() {
    if (this.cacheProgress && Date.now() < this.cacheProgress.exp) return this.cacheProgress.data;
    if (this.pendingProgress) return this.pendingProgress;
    this.pendingProgress = this.forceGetProgress().finally(() => { this.pendingProgress = null; });
    return this.pendingProgress;
  }

  private async forceGetProgress() {
    const active = await this.activeDept();
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
    parts.push(`count(*) FILTER (WHERE (meta->'discovery') IS NOT NULL)::int AS ai_total`);
    parts.push(`count(*) FILTER (WHERE (meta->>'verifiedAt') IS NOT NULL)::int AS ai_verified`);
    parts.push("count(*)::int AS total");
    // Scopé au département ACTIF (calculé dynamiquement) : le suivi suit le pipeline.
    const rows = await this.db.execute<Record<string, number>>(
      sql.raw(`SELECT ${parts.join(", ")} FROM associations WHERE department = '${active.code}'`),
    );
    const d = rows.rows[0]!;
    const res = {
      territory: active.nom,
      territoryCode: active.code,
      done: active.done,        // codes des départements déjà terminés (carte: vert)
      next: active.next,
      total: d.total,
      aiVerification: {
        total: d.ai_total,
        verified: d.ai_verified,
        pct: d.ai_total ? Math.round((d.ai_verified / d.ai_total) * 1000) / 10 : 100,
      },
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
    this.cacheProgress = { data: res, exp: Date.now() + CACHE_TTL };
    return res;
  }

  // Stats par DÉPARTEMENT (pour le "détail par territoire") : total + couverture des
  // liens. Le front regroupe ensuite par région via la table COVERED (nom + région).
  private pendingTerritory: Promise<any> | null = null;
  async getByTerritory() {
    if (this.cacheTerritory && Date.now() < this.cacheTerritory.exp) return this.cacheTerritory.data;
    if (this.pendingTerritory) return this.pendingTerritory;
    this.pendingTerritory = this.forceGetByTerritory().finally(() => { this.pendingTerritory = null; });
    return this.pendingTerritory;
  }

  private async forceGetByTerritory() {
    const rows = await this.db.execute<{
      department: string; total: number; geo: number;
      web: number; fb: number; ig: number; soc: number;
    }>(sql`
      SELECT department,
        count(*)::int                                       AS total,
        count(*) FILTER (WHERE location IS NOT NULL)::int    AS geo,
        count(*) FILTER (WHERE social ? 'website')::int      AS web,
        count(*) FILTER (WHERE social ? 'facebook')::int     AS fb,
        count(*) FILTER (WHERE social ? 'instagram')::int    AS ig,
        count(*) FILTER (WHERE social <> '{}'::jsonb)::int   AS soc
      FROM associations
      WHERE status = 'published' AND department IS NOT NULL
      GROUP BY department
      ORDER BY count(*) DESC
    `);
    const res = rows.rows.map((r) => ({
      department: r.department,
      total: r.total,
      geolocalisees: r.geo,
      avecWebsite: r.web,
      avecFacebook: r.fb,
      avecInstagram: r.ig,
      avecSocial: r.soc,
    }));
    this.cacheTerritory = { data: res, exp: Date.now() + CACHE_TTL };
    return res;
  }
}

// Ordre d'enrichissement (DOIT refléter .targets des VPS). Le territoire « en cours »
// est calculé DYNAMIQUEMENT (premier dépt de la liste qui a encore du travail, même
// logique que target_dept.py) -> le site et le mail suivent le pipeline tout seuls,
// sans rien changer à la main quand on bascule de département.
const DEPT_ORDER: [string, string][] = [
  ["85", "Vendée"], ["46", "Lot"], ["12", "Aveyron"], ["09", "Ariège"], ["11", "Aude"],
  ["30", "Gard"], ["31", "Haute-Garonne"], ["32", "Gers"], ["48", "Lozère"],
  ["65", "Hautes-Pyrénées"], ["66", "Pyrénées-Orientales"], ["81", "Tarn"], ["82", "Tarn-et-Garonne"],
  // Pays de la Loire (Vendée 85 déjà traitée, en tête de liste)
  ["44", "Loire-Atlantique"], ["49", "Maine-et-Loire"], ["53", "Mayenne"], ["72", "Sarthe"],
  // Normandie
  ["14", "Calvados"], ["27", "Eure"], ["50", "Manche"], ["61", "Orne"], ["76", "Seine-Maritime"],
  // Île-de-France
  ["75", "Paris"], ["77", "Seine-et-Marne"], ["78", "Yvelines"], ["91", "Essonne"],
  ["92", "Hauts-de-Seine"], ["93", "Seine-Saint-Denis"], ["94", "Val-de-Marne"], ["95", "Val-d'Oise"],
];
// Seuil de tolérance des résidus : un département dont le reliquat de "fiches à faire"
// est <= à ce nombre est considéré terminé (vert). Couvre les fiches bloquées à vie
// (recherche DDG échouée sans marqueur) sans figer l'affichage. Un département réellement
// en cours a des centaines/milliers de fiches restantes, très au-dessus de ce seuil.
const RESIDU_TOLERE = 50;

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
