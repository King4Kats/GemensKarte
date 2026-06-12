/**
 * Rattrapage des associations non géolocalisées.
 *
 * Beaucoup d'assos du RNA n'ont pas d'adresse précise géocodable, mais TOUTES ont un
 * code postal / une commune. Ce script les repose sur le CENTRE de leur commune
 * (géocodage BAN niveau "municipality"), avec un léger décalage aléatoire pour qu'elles
 * ne s'empilent pas exactement, et marque `meta.geoApprox = true` (localisation
 * approximative). Ainsi aucune asso n'est invisible sur la carte.
 *
 * Idempotent et repris en avant via un curseur sur `id` (jamais de boucle infinie :
 * une ligne non géocodable reste NULL mais on ne la repropose pas).
 *
 * Lancement : pnpm --filter @gemenskarte/api regeocode:missing
 */
import { parse as parseSync } from "csv-parse/sync";
import { Pool } from "pg";
import { getEnv } from "../../config/env";

const BATCH = 1000;
const JITTER = 0.004; // ~±200-300 m, pour disperser les pins d'une même commune

function csvField(value: string): string {
  const v = value.replace(/[\r\n]+/g, " ");
  return `"${v.replace(/"/g, '""')}"`;
}

interface Cell {
  seq: number;
  city: string;
  postalCode: string;
}

/** Géocodage en masse au niveau commune (BAN /search/csv/, type municipality). */
async function geocodeCommunes(
  baseUrl: string,
  rows: Cell[],
): Promise<Map<number, { lng: number; lat: number }>> {
  const out = new Map<number, { lng: number; lat: number }>();
  const todo = rows.filter((r) => r.city || r.postalCode);
  if (todo.length === 0) return out;

  const header = "seq,address,postcode";
  const body = todo
    .map((r) => [r.seq, csvField(r.city || r.postalCode), csvField(r.postalCode)].join(","))
    .join("\n");
  const csv = `${header}\n${body}\n`;

  const form = new FormData();
  form.append("data", new Blob([csv], { type: "text/csv" }), "in.csv");
  form.append("columns", "address");
  form.append("postcode", "postcode");
  form.append("type", "municipality");
  form.append("result_columns", "latitude");
  form.append("result_columns", "longitude");

  try {
    const res = await fetch(new URL("/search/csv/", baseUrl), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) return out;
    const recs = parseSync(await res.text(), {
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
    /* BAN indisponible : lot ignoré, on avancera quand même grâce au curseur. */
  }
  return out;
}

async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  let cursor = "00000000-0000-0000-0000-000000000000";
  let scanned = 0;
  let fixed = 0;

  for (;;) {
    const { rows } = await pool.query<{ id: string; city: string | null; postal_code: string | null }>(
      `SELECT id::text AS id, city, postal_code
         FROM associations
        WHERE location IS NULL AND id > $1::uuid
          AND (city IS NOT NULL OR postal_code IS NOT NULL)
        ORDER BY id
        LIMIT ${BATCH}`,
      [cursor],
    );
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    scanned += rows.length;

    const input: Cell[] = rows.map((r, i) => ({
      seq: i,
      city: r.city ?? "",
      postalCode: r.postal_code ?? "",
    }));
    const geo = await geocodeCommunes(env.BAN_GEOCODER_URL, input);

    for (let i = 0; i < rows.length; i++) {
      const p = geo.get(i);
      if (!p) continue;
      const lng = p.lng + (Math.random() - 0.5) * JITTER;
      const lat = p.lat + (Math.random() - 0.5) * JITTER;
      await pool.query(
        `UPDATE associations
            SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
                meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{geoApprox}', 'true'::jsonb),
                updated_at = now()
          WHERE id = $3::uuid`,
        [lng, lat, rows[i].id],
      );
      fixed++;
    }
    console.log(`scanné ${scanned} · repositionné ${fixed}`);
  }

  console.log(`TERMINÉ : ${fixed} assos reposées sur leur commune (sur ${scanned} sans géoloc traitées).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
