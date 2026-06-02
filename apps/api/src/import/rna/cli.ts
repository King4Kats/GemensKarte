import * as path from "node:path";
import { importRna, type ImportOptions } from "./importer";

/**
 * CLI d'import RNA.
 *
 *   pnpm import:rna -- --file data/rna/rna_waldec_44.csv --covered-only
 *   pnpm import:rna -- --sample              # échantillon embarqué (hors-ligne)
 *   pnpm import:rna -- --file x.csv --limit 500 --no-geocode --status pending
 */
function parseArgs(argv: string[]): ImportOptions & { sample: boolean } {
  const opts: ImportOptions & { sample: boolean } = {
    file: "",
    geocode: true,
    coveredOnly: false,
    status: "published",
    dryRun: false,
    sample: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--file": opts.file = argv[++i]; break;
      case "--limit": opts.limit = Number(argv[++i]); break;
      case "--no-geocode": opts.geocode = false; break;
      case "--covered-only": opts.coveredOnly = true; break;
      case "--status": opts.status = argv[++i] as ImportOptions["status"]; break;
      case "--dry-run": opts.dryRun = true; break;
      case "--sample": opts.sample = true; break;
      default:
        console.warn(`option inconnue ignorée : ${a}`);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.sample && !opts.file) {
    opts.file = path.join(__dirname, "..", "data", "rna-sample.csv");
  }
  if (!opts.file) {
    console.error("Usage : pnpm import:rna -- --file <chemin.csv> [--covered-only] [--limit N] [--no-geocode]");
    console.error("    ou : pnpm import:rna -- --sample");
    process.exit(1);
  }

  console.log(`📥 Import RNA depuis ${opts.file} (géocodage: ${opts.geocode ? "oui" : "non"})`);
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
