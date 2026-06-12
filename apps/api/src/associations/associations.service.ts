/**
 * Service "Associations" : le cœur métier du module.
 * C'est lui qui parle à la base PostgreSQL/PostGIS (PostGIS = extension qui gère
 * les données géographiques : points, distances...), géocode les adresses
 * (transforme une adresse en coordonnées lat/lng) et tient à jour le moteur de
 * recherche Meilisearch. Le contrôleur appelle ces méthodes.
 */
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  type Association,
  type CreateAssociationInput,
  type ListAssociationsQuery,
  type Paginated,
  type PatchCategoryInput,
  type QuarantineAssoc,
  type ResolveQuarantineInput,
} from "@gemenskarte/shared";
import { sql, type SQL } from "drizzle-orm";
import type { Pool } from "pg";
import { DB, PG_POOL, type Db } from "../db/db.module";
import { GeocoderService } from "../geo/geocoder.service";
import { departmentFromPostalCode, regionFromDepartment } from "../geo/regions";
import { SearchService, toSearchDoc } from "../search/search.service";

/** Ligne brute renvoyée par PostgreSQL (type littéral → compatible Record). */
type Row = {
  id: string;
  rna_id: string | null;
  name: string;
  slug: string | null;
  category_id: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  department: string | null;
  region: string | null;
  lng: number | null;
  lat: number | null;
  social: Record<string, string> | null;
  meta: Record<string, unknown> | null;
  tags: string[] | null;
  status: Association["status"];
  source: "manual" | "rna";
  distance_m: number | null;
};

/** Colonnes publiques (lat/lng extraits de la géométrie PostGIS). */
const COLS = sql`
  id, rna_id, name, slug, category_id, description, email, phone, website,
  address, postal_code, city, department, region,
  ST_X(location) AS lng, ST_Y(location) AS lat,
  social, meta, tags, status, source`;

/**
 * Convertit une ligne brute de la base (noms en snake_case) vers l'objet
 * Association utilisé par le reste de l'app (noms en camelCase).
 * Au passage, on range les champs "fourre-tout" stockés dans meta (jsonb =
 * colonne JSON souple) dans des propriétés propres et lisibles.
 */
function mapRow(r: Row): Association {
  const meta = (r.meta ?? {}) as {
    blurb?: string; members?: number; founded?: number; needs?: string; action?: string;
    geoApprox?: boolean;
    qualityScore?: { score: number; tier: "A" | "B" | "C" | "D"; flags?: string[] };
    events?: Array<{ title?: string; start?: string; end?: string; dateLabel?: string;
      city?: string; place?: string; url?: string; image?: string; matchedAsso?: boolean; distKm?: number }>;
  };
  // n'expose que les événements ENCORE à venir (start >= maintenant).
  const nowIso = new Date().toISOString();
  const upcoming = (meta.events ?? []).filter((e) => (e.start ?? "") >= nowIso);
  return {
    id: r.id,
    rnaId: r.rna_id,
    name: r.name,
    slug: r.slug,
    categoryId: r.category_id as Association["categoryId"],
    description: r.description,
    email: r.email,
    phone: r.phone,
    address: r.address,
    postalCode: r.postal_code,
    city: r.city,
    department: r.department,
    region: r.region,
    lat: r.lat,
    lng: r.lng,
    social: { ...(r.social ?? {}), ...(r.website ? { website: r.website } : {}) },
    tags: r.tags ?? [],
    blurb: meta.blurb ?? null,
    members: meta.members ?? null,
    founded: meta.founded ?? null,
    needs: meta.needs ?? null,
    action: meta.action ?? null,
    qualityScore: meta.qualityScore ?? null,
    events: upcoming,
    status: r.status,
    source: r.source,
    distanceM: r.distance_m ?? null,
    geoApprox: meta.geoApprox === true,
  };
}

@Injectable()
export class AssociationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly geocoder: GeocoderService,
    private readonly search: SearchService,
  ) {}

  /** Construit la clause WHERE commune (filtres catégorie / dept / texte / bbox). */
  private buildWhere(q: ListAssociationsQuery): SQL {
    const conds: SQL[] = [sql`status = 'published'`];
    if (q.categories && q.categories.length > 0) {
      conds.push(sql`category_id IN (${sql.join(q.categories.map((id) => sql`${id}`), sql`, `)})`);
    } else if (q.category) {
      conds.push(sql`category_id = ${q.category}`);
    }
    if (q.department) conds.push(sql`department = ${q.department}`);
    if (q.q) {
      const like = `%${q.q}%`;
      conds.push(sql`(name ILIKE ${like} OR city ILIKE ${like})`);
    }
    if (q.bbox) {
      const { minLng, minLat, maxLng, maxLat } = q.bbox;
      conds.push(
        sql`location && ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)`,
      );
    }
    if (q.located) conds.push(sql`location IS NOT NULL`);
    return sql.join(conds, sql` AND `);
  }

  /**
   * Liste paginée des associations publiées.
   * Si une position "near" est fournie, on calcule la distance de chaque asso à
   * ce point et on trie du plus proche au plus loin ; sinon on trie par nom (ou
   * par score qualité si demandé). Renvoie aussi le total pour la pagination.
   */
  async list(q: ListAssociationsQuery): Promise<Paginated<Association>> {
    const where = this.buildWhere(q);
    const offset = (q.page - 1) * q.limit;

    // distance en mètres jusqu'au point "near" (ou NULL si aucune position donnée).
    const distance = q.near
      ? sql`ST_DistanceSphere(location, ST_SetSRID(ST_MakePoint(${q.near.lng}, ${q.near.lat}), 4326))`
      : sql`NULL::float8`;
    const order = q.near
      ? sql`ORDER BY distance_m ASC NULLS LAST, name ASC`
      : q.sort === "quality"
        ? sql`ORDER BY (meta->'qualityScore'->>'score')::int DESC NULLS LAST, name ASC`
        : sql`ORDER BY name ASC`;

    const items = await this.db.execute<Row>(sql`
      SELECT ${COLS}, ${distance} AS distance_m
      FROM associations
      WHERE ${where}
      ${order}
      LIMIT ${q.limit} OFFSET ${offset}
    `);

    const totalRes = await this.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM associations WHERE ${where}`,
    );

    return {
      items: items.rows.map(mapRow),
      page: q.page,
      limit: q.limit,
      total: totalRes.rows[0]?.n ?? 0,
    };
  }

  /** FeatureCollection GeoJSON allégé pour alimenter les pins de la carte. */
  async geojson(q: ListAssociationsQuery): Promise<{
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: { id: string; name: string; categoryId: string; city: string | null; approx: boolean };
    }>;
  }> {
    const where = this.buildWhere(q);
    const rows = await this.db.execute<{
      id: string;
      name: string;
      category_id: string;
      city: string | null;
      lng: number;
      lat: number;
      geo_approx: boolean;
    }>(sql`
      SELECT id, name, category_id, city, ST_X(location) AS lng, ST_Y(location) AS lat,
             (meta->>'geoApprox') = 'true' AS geo_approx
      FROM associations
      WHERE ${where} AND location IS NOT NULL
        -- Exclut les points (0,0) : échecs de géocodage stockés à tort en Point(0,0)
        -- (ils apparaissaient au large de l'Afrique, golfe de Guinée). Aucune asso
        -- française n'a une latitude proche de 0, donc ce filtre ne retire qu'eux.
        AND NOT (ST_X(location) BETWEEN -1 AND 1 AND ST_Y(location) BETWEEN -1 AND 1)
      LIMIT 20000
    `);

    return {
      type: "FeatureCollection",
      features: rows.rows.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
        properties: { id: r.id, name: r.name, categoryId: r.category_id, city: r.city, approx: !!r.geo_approx },
      })),
    };
  }

  /** Récupère une seule association par son id ; erreur 404 si elle n'existe pas. */
  async findOne(id: string): Promise<Association> {
    const res = await this.db.execute<Row>(sql`
      SELECT ${COLS}, NULL::float8 AS distance_m
      FROM associations WHERE id = ${id} LIMIT 1
    `);
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`Association ${id} introuvable`);
    return mapRow(row);
  }

  /** Référencement public : crée une fiche en attente de modération. */
  async create(input: CreateAssociationInput): Promise<Association> {
    // Si on a une adresse, on tente de trouver ses coordonnées (géocodage) pour
    // pouvoir placer un point sur la carte. Si ça échoue, la fiche reste sans position.
    let lng: number | null = null;
    let lat: number | null = null;
    if (input.address && input.postalCode) {
      const point = await this.geocoder.geocode(
        `${input.address} ${input.city ?? ""}`.trim(),
        input.postalCode,
      );
      if (point) {
        lng = point.lng;
        lat = point.lat;
      }
    }

    const dept = departmentFromPostalCode(input.postalCode);
    const region = regionFromDepartment(dept);
    const hasGeo = lng !== null && lat !== null;
    // pg sérialise correctement les tableaux JS → text[] (contrairement à sql`` de drizzle).
    const params: unknown[] = [
      input.name, input.categoryId, input.description ?? null, input.email ?? null,
      input.phone ?? null, input.social?.website ?? null, input.address ?? null,
      input.postalCode ?? null, input.city ?? null, dept, region,
      JSON.stringify(input.social ?? {}), input.tags ?? [], "pending",
    ];
    if (hasGeo) params.push(lng, lat);
    const location = hasGeo ? "ST_SetSRID(ST_MakePoint($15,$16),4326)" : "NULL";

    const res = await this.pool.query<Row>(
      `INSERT INTO associations
        (name, category_id, description, email, phone, website, address,
         postal_code, city, department, region, social, tags, status, source, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::text[],$14,'manual',${location})
       RETURNING id, rna_id, name, slug, category_id, description, email, phone, website,
         address, postal_code, city, department, region,
         ST_X(location) AS lng, ST_Y(location) AS lat,
         social, tags, status, source, NULL::float8 AS distance_m`,
      params,
    );

    const created = mapRow(res.rows[0]!);
    await this.search.indexDocuments([toSearchDoc(created)]);
    return created;
  }

  /** Change la catégorie d'une fiche, puis réindexe dans Meilisearch pour la recherche. */
  async patchCategory(id: string, input: PatchCategoryInput): Promise<Association> {
    await this.db.execute(sql`
      UPDATE associations SET category_id = ${input.categoryId} WHERE id = ${id}
    `);
    const updated = await this.findOne(id);
    await this.search.indexDocuments([toSearchDoc(updated)]);
    return updated;
  }

  /** Liste les fiches ayant au moins un lien en quarantaine (revue manuelle). */
  async listQuarantine(page: number, limit: number): Promise<Paginated<QuarantineAssoc>> {
    const offset = (page - 1) * limit;
    const where = sql`meta -> 'quarantine' IS NOT NULL AND meta -> 'quarantine' <> '{}'::jsonb`;
    const countRes = await this.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM associations WHERE ${where}`,
    );
    const res = await this.db.execute<{
      id: string; name: string; city: string | null; department: string | null;
      description: string | null; social: Record<string, string> | null;
      quarantine: Record<string, { url: string; score: number; reason: string }> | null;
    }>(sql`
      SELECT id, name, city, department, description,
             social, meta -> 'quarantine' AS quarantine
      FROM associations WHERE ${where}
      ORDER BY name LIMIT ${limit} OFFSET ${offset}
    `);
    return {
      items: res.rows.map((r) => ({
        id: r.id, name: r.name, city: r.city, department: r.department,
        description: r.description, social: r.social ?? {}, quarantine: r.quarantine ?? {},
      })),
      page, limit, total: countRes.rows[0]?.n ?? 0,
    };
  }

  /** Arbitre un lien en quarantaine : keep -> social ; drop -> meta.dropped. Idempotent. */
  async resolveQuarantine(id: string, input: ResolveQuarantineInput): Promise<void> {
    const { platform, action } = input;
    if (action === "keep") {
      // déplace meta.quarantine[platform].url vers social[platform], retire de la quarantaine.
      await this.db.execute(sql`
        UPDATE associations SET
          social = COALESCE(social, '{}'::jsonb) || jsonb_build_object(${platform}::text, meta->'quarantine'->${platform}->>'url'),
          meta = jsonb_set(meta, '{quarantine}', (meta->'quarantine') - ${platform}::text)
        WHERE id = ${id} AND meta->'quarantine' ? ${platform}
      `);
    } else {
      // trace dans meta.dropped puis retire de la quarantaine.
      await this.db.execute(sql`
        UPDATE associations SET
          meta = jsonb_set(
            jsonb_set(meta, '{dropped}', COALESCE(meta->'dropped','[]'::jsonb)
              || jsonb_build_array(jsonb_build_object('platform', ${platform}::text,
                   'manualDrop', true) || (meta->'quarantine'->${platform}))),
            '{quarantine}', (meta->'quarantine') - ${platform}::text)
        WHERE id = ${id} AND meta->'quarantine' ? ${platform}
      `);
    }
  }
}
