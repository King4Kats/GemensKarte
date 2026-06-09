import * as path from "node:path";
import { importRna, type ImportOptions } from "./importer";

/**
 * CLI d'import RNA.
 *
 *   # fichier national agrégé (CSV) data.gouv, périmètre couvert uniquement :
 *   pnpm import:rna -- --file data/rna/rna_waldec.csv --covered-only
 *
 *   # dump départemental historique (Latin-1) :
 *   pnpm import:rna -- --file data/rna/rna_waldec_44.csv --encoding latin1
 *
 *   # échantillon embarqué (hors-ligne, sans géocodage) :
 *   pnpm import:rna -- --sample --no-geocode
 */
function parseArgs(argv: string[]): ImportOptions & { sample: boolean } {
  const opts: ImportOptions & { sample: boolean } = {
    file: "",
    geocode: "bulk",
    coveredOnly: false,
    status: "published",
    encoding: "utf8",
    dryRun: false,
    sample: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--file": opts.file = argv[++i]; break;
      case "--limit": opts.limit = Number(argv[++i]); break;
      case "--batch-size": opts.batchSize = Number(argv[++i]); break;
      case "--encoding": opts.encoding = argv[++i] as BufferEncoding; break;
      case "--no-geocode": opts.geocode = "none"; break;
      case "--geocode-single": opts.geocode = "single"; break;
      case "--covered-only": opts.coveredOnly = true; break;
      case "--status": opts.status = argv[++i] as ImportOptions["status"]; break;
      case "--dry-run": opts.dryRun = true; break;
      case "--sample": opts.sample = true; break;
      case "--": break; // séparateur pnpm, ignoré silencieusement
      default:
        if (a) console.warn(`option inconnue ignorée : ${a}`);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.sample && !opts.file) {
    opts.file = path.join(__dirname, "..", "data", "rna-sample.csv");
  } else if (opts.file && !path.isAbsolute(opts.file)) {
    // pnpm exécute le script depuis apps/api ; on résout --file depuis le dossier d'appel.
    opts.file = path.resolve(process.env.INIT_CWD || process.cwd(), opts.file);
  }
  if (!opts.file) {
    console.error("Usage : pnpm import:rna -- --file <chemin.csv> [--covered-only] [--encoding latin1] [--limit N] [--no-geocode|--geocode-single]");
    console.error("    ou : pnpm import:rna -- --sample");
    process.exit(1);
  }

  console.log(`📥 Import RNA depuis ${opts.file} (géocodage: ${opts.geocode}, encodage: ${opts.encoding})`);
  const t0 = Date.now();
  const report = await importRna(opts);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("─".repeat(40));
  console.log(`  lues        : ${report.read}`);
  console.log(`  ignorées    : ${report.skipped}`);
  console.log(`  géocodées   : ${report.geocoded}`);
  console.log(`  enregistrées: ${report.upserted}`);
  console.log(`✅ terminé en ${dt}s`);
  console.log("ℹ️  Pense à `pnpm search:reindex`.");
}

main().catch((err) => {
  console.error("❌ Import échoué :", err);
  process.exit(1);
});
