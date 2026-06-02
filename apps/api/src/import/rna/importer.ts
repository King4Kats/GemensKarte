import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import { Pool } from "pg";
import { getEnv } from "../../config/env";
import {
  departmentFromPostalCode,
  isCovered,
  regionFromDepartment,
} from "../../geo/regions";
import { classify } from "./classifier";

export type GeocodeMode = "bulk" | "single" | "none";

export interface ImportOptions {
  file: string;
  limit?: number;
  geocode?: GeocodeMode;
  /** Ne garder que les départements couverts (Bretagne/PdL/Normandie). */
  coveredOnly?: boolean;
  status?: "published" | "pending";
  /** Encodage du fichier RNA ("utf8" pour l'agrégé data.gouv, "latin1" pour les dumps). */
  encoding?: BufferEncoding;
  /** Taille des lots (géocodage en masse + upsert). */
  batchSize?: number;
  dryRun?: boolean;
}

export interface ImportReport {
  read: number;
  skipped: number;
  geocoded: number;
  upserted: number;
}

/** Association mappée, prête à être géocodée puis insérée. */
interface MappedRow {
  seq: number;
  rnaId: string;
  name: string;
  category: string;
  description: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  department: string | null;
  region: string | null;
  tags: string[];
  lng: number | null;
  lat: number | null;
}

/** Récupère la 1re valeur non vide parmi plusieurs noms de colonnes possibles. */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function buildAddress(row: Record<string, string>): string {
  return [
    pick(row, "adrs_numvoie"),
    pick(row, "adrs_typevoie"),
    pick(row, "adrs_libvoie", "adrs_voie"),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Une association est dissoute si une date de dissolution réelle est renseignée.
 * Le RNA utilise la sentinelle `0001-01-01` (année 1) pour "non dissoute".
 */
function isDissolved(row: Record<string, string>): boolean {
  const m = pick(row, "date_disso").match(/^(\d{4})-\d{2}-\d{2}/);
  return !!m && Number(m[1]) > 1900;
}

function csvField(value: string): string {
  const v = value.replace(/[\r\n]+/g, " ");
  return `"${v.replace(/"/g, '""')}"`;
}

/** Géocodage unitaire (Base Adresse Nationale). */
async function geocodeOne(
  baseUrl: string,
  query: string,
  postalCode: string,
): Promise<{ lng: number; lat: number } | null> {
  if (!query) return null;
  const url = new URL("/search/", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  if (postalCode) url.searchParams.set("postcode", postalCode);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ geometry: { coordinates: [number, number] } }>;
    };
    const f = data.features?.[0];
    return f ? { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : null;
  } catch {
    return null;
  }
}

/**
 * Géocodage en masse via l'endpoint CSV de la BAN (/search/csv/).
 * Géocode tout un lot en une requête. Renvoie une Map seq → coordonnées.
 */
async function geocodeBatch(
  baseUrl: string,
  rows: MappedRow[],
): Promise<Map<number, { lng: number; lat: number }>> {
  const out = new Map<number, { lng: number; lat: number }>();
  const todo = rows.filter((r) => r.address && r.postalCode);
  if (todo.length === 0) return out;

  const header = "seq,address,postcode,city";
  const body = todo
    .map((r) =>
      [r.seq, csvField(r.address ?? ""), csvField(r.postalCode ?? ""), csvField(r.city ?? "")].join(
        ",",
      ),
    )
    .join("\n");
  const csv = `${header}\n${body}\n`;

  const form = new FormData();
  form.append("data", new Blob([csv], { type: "text/csv" }), "in.csv");
  form.append("columns", "address");
  form.append("columns", "city");
  form.append("postcode", "postcode");
  form.append("result_columns", "latitude");
  form.append("result_columns", "longitude");

  try {
    const res = await fetch(new URL("/search/csv/", baseUrl), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) return out;
    const text = await res.text();
    const recs = parseSync(text, {
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }) as Array<Record<string, string>>;
    for (const rec of recs) {
      const lat = Number(rec.latitude);
      const lng = Number(rec.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        out.set(Number(rec.seq), { lng, lat });
      }
    }
  } catch {
    /* BAN indisponible : on renvoie ce qu'on a (rien). */
  }
  return out;
}

/**
 * Importe un fichier RNA (CSV waldec, séparateur ';') dans la base.
 *
 * - mappe titre→nom, objet→description, construit l'adresse ;
 * - écarte les associations dissoutes ;
 * - classe en catégorie "confetti" par mots-clés ;
 * - géocode (en masse via la BAN, ou unitaire, ou pas du tout) ;
 * - upsert par `rna_id` (idempotent), par lots pour borner la mémoire.
 */
export async function importRna(opts: ImportOptions): Promise<ImportReport> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const report: ImportReport = { read: 0, skipped: 0, geocoded: 0, upserted: 0 };
  const status = opts.status ?? "published";
  const mode: GeocodeMode = opts.geocode ?? "bulk";
  const encoding = opts.encoding ?? "utf8";
  const batchSize = opts.batchSize ?? 2000;
  let seq = 0;

  const flush = async (batch: MappedRow[]): Promise<void> => {
    if (batch.length === 0) return;

    // Géocodage des lignes sans coordonnées (le RNA n'en fournit pas).
    const need = batch.filter((r) => r.lng === null && r.address && r.postalCode);
    if (mode === "bulk" && need.length > 0) {
      const geo = await geocodeBatch(env.BAN_GEOCODER_URL, need);
      for (const r of need) {
        const p = geo.get(r.seq);
        if (p) {
          r.lng = p.lng;
          r.lat = p.lat;
          report.geocoded++;
        }
      }
    } else if (mode === "single") {
      for (const r of need) {
        const p = await geocodeOne(env.BAN_GEOCODER_URL, `${r.address} ${r.city ?? ""}`.trim(), r.postalCode ?? "");
        if (p) {
          r.lng = p.lng;
          r.lat = p.lat;
          report.geocoded++;
        }
      }
    }

    if (opts.dryRun) return;

    for (const r of batch) {
      const hasGeo = r.lng !== null && r.lat !== null;
      const params: unknown[] = [
        r.rnaId, r.name, r.category, r.description, r.website, r.phone, r.email,
        r.address, r.postalCode, r.city, r.department, r.region, r.tags, status,
      ];
      if (hasGeo) params.push(r.lng, r.lat);
      const location = hasGeo ? "ST_SetSRID(ST_MakePoint($15,$16),4326)" : "NULL";

      await pool.query(
        `INSERT INTO associations
          (rna_id, name, category_id, description, website, phone, email, address,
           postal_code, city, department, region, tags, status, source, location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14,'rna',${location})
         ON CONFLICT (rna_id) DO UPDATE SET
           name = EXCLUDED.name, category_id = EXCLUDED.category_id,
           description = EXCLUDED.description, website = EXCLUDED.website,
           phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address,
           postal_code = EXCLUDED.postal_code, city = EXCLUDED.city,
           department = EXCLUDED.department, region = EXCLUDED.region,
           tags = EXCLUDED.tags, location = COALESCE(EXCLUDED.location, associations.location),
           updated_at = now()`,
        params,
      );
      report.upserted++;
    }
  };

  // Lit le CSV (ou .csv.gz) ; csv-parse décode les octets selon `encoding`.
  const fileStream = fs.createReadStream(opts.file);
  const input = opts.file.endsWith(".gz") ? fileStream.pipe(zlib.createGunzip()) : fileStream;
  const parser = input.pipe(
    parse({
      columns: true,
      delimiter: ";",
      encoding,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }),
  );

  let batch: MappedRow[] = [];
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    if (opts.limit && report.read >= opts.limit) break;
    report.read++;

    const rnaId = pick(row, "id", "id_association", "rna");
    const name = pick(row, "titre", "titre_court", "nom");
    if (!rnaId || !name || isDissolved(row)) {
      report.skipped++;
      continue;
    }

    const postalCode = pick(row, "adrs_codepostal", "code_postal", "cp");
    const dept = departmentFromPostalCode(postalCode);
    if (opts.coveredOnly && !isCovered(dept)) {
      report.skipped++;
      continue;
    }

    const objet = pick(row, "objet", "objet_social1");
    // Coordonnées : colonnes lat/lng si présentes (échantillon hors-ligne), sinon géocodage.
    const rawLng = pick(row, "lng", "longitude");
    const rawLat = pick(row, "lat", "latitude");
    const hasInline = !!rawLng && !!rawLat;

    batch.push({
      seq: seq++,
      rnaId,
      name,
      category: classify(name, objet),
      description: objet || null,
      website: pick(row, "siteweb", "site_web", "site") || null,
      phone: pick(row, "telephone", "tel") || null,
      email: pick(row, "email", "courriel") || null,
      address: buildAddress(row) || pick(row, "adresse") || null,
      postalCode: postalCode || null,
      city: pick(row, "adrs_libcommune", "commune", "ville") || null,
      department: dept,
      region: regionFromDepartment(dept),
      tags: [pick(row, "nature"), pick(row, "groupement")].filter(Boolean),
      lng: hasInline ? Number(rawLng) : null,
      lat: hasInline ? Number(rawLat) : null,
    });

    if (batch.length >= batchSize) {
      await flush(batch);
      batch = [];
    }
  }
  await flush(batch);

  await pool.end();
  return report;
}
