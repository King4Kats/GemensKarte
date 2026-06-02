import * as fs from "node:fs";
import { parse } from "csv-parse";
import { Pool } from "pg";
import { getEnv } from "../../config/env";
import {
  departmentFromPostalCode,
  isCovered,
  regionFromDepartment,
} from "../../geo/regions";
import { classify } from "./classifier";

export interface ImportOptions {
  file: string;
  limit?: number;
  geocode?: boolean;
  /** Ne garder que les départements couverts (Bretagne/PdL/Normandie). */
  coveredOnly?: boolean;
  status?: "published" | "pending";
  dryRun?: boolean;
}

export interface ImportReport {
  read: number;
  skipped: number;
  geocoded: number;
  upserted: number;
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

/** Géocode via la Base Adresse Nationale. Renvoie null si indisponible. */
async function geocodeBAN(
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
    if (!f) return null;
    return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  } catch {
    return null;
  }
}

/**
 * Importe un fichier RNA (CSV waldec, séparateur ';') dans la base.
 * - mappe titre→nom, objet→description, construit l'adresse ;
 * - classe en catégorie "confetti" par mots-clés ;
 * - géocode l'adresse (ou utilise des colonnes lat/lng si présentes) ;
 * - upsert par `rna_id` (idempotent).
 */
export async function importRna(opts: ImportOptions): Promise<ImportReport> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const report: ImportReport = { read: 0, skipped: 0, geocoded: 0, upserted: 0 };
  const status = opts.status ?? "published";
  const doGeocode = opts.geocode ?? true;

  const parser = fs
    .createReadStream(opts.file, { encoding: "utf8" })
    .pipe(parse({ columns: true, delimiter: ";", relax_quotes: true, skip_empty_lines: true, trim: true }));

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    if (opts.limit && report.read >= opts.limit) break;
    report.read++;

    const rnaId = pick(row, "id", "id_association", "rna");
    const name = pick(row, "titre", "titre_court", "nom");
    if (!rnaId || !name) {
      report.skipped++;
      continue;
    }

    const objet = pick(row, "objet", "objet_social1");
    const postalCode = pick(row, "adrs_codepostal", "code_postal", "cp");
    const city = pick(row, "adrs_libcommune", "commune", "ville");
    const address = buildAddress(row) || pick(row, "adresse");
    const dept = departmentFromPostalCode(postalCode);

    if (opts.coveredOnly && !isCovered(dept)) {
      report.skipped++;
      continue;
    }

    // Coordonnées : colonnes lat/lng si fournies (échantillon hors-ligne), sinon géocodage.
    let lng: number | null = null;
    let lat: number | null = null;
    const rawLng = pick(row, "lng", "longitude");
    const rawLat = pick(row, "lat", "latitude");
    if (rawLng && rawLat) {
      lng = Number(rawLng);
      lat = Number(rawLat);
    } else if (doGeocode && address && postalCode) {
      const point = await geocodeBAN(env.BAN_GEOCODER_URL, `${address} ${city}`.trim(), postalCode);
      if (point) {
        lng = point.lng;
        lat = point.lat;
        report.geocoded++;
      }
    }

    const category = classify(name, objet);
    const region = regionFromDepartment(dept);
    const website = pick(row, "siteweb", "site_web", "site");
    const phone = pick(row, "telephone", "tel");
    const email = pick(row, "email", "courriel");
    const tags = [pick(row, "nature"), pick(row, "groupement")].filter(Boolean);

    if (opts.dryRun) continue;

    const hasGeo = lng !== null && lat !== null && Number.isFinite(lng) && Number.isFinite(lat);
    const locExpr = hasGeo
      ? `ST_SetSRID(ST_MakePoint($15,$16),4326)`
      : `NULL`;
    const params: unknown[] = [
      rnaId, name, category, objet || null, website || null, phone || null,
      email || null, address || null, postalCode || null, city || null, dept, region,
      tags, status,
    ];
    if (hasGeo) params.push(lng, lat);

    await pool.query(
      `INSERT INTO associations
        (rna_id, name, category_id, description, website, phone, email, address,
         postal_code, city, department, region, tags, status, source, location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'rna',${locExpr})
       ON CONFLICT (rna_id) DO UPDATE SET
         name = EXCLUDED.name, category_id = EXCLUDED.category_id,
         description = EXCLUDED.description, website = EXCLUDED.website,
         phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address,
         postal_code = EXCLUDED.postal_code, city = EXCLUDED.city,
         department = EXCLUDED.department, region = EXCLUDED.region,
         tags = EXCLUDED.tags, location = EXCLUDED.location, updated_at = now()`,
      params,
    );
    report.upserted++;
  }

  await pool.end();
  return report;
}
