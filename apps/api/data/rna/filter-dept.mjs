// Filtre un export RNA national vers un seul département (par préfixe de code postal).
// Usage : node filter-dept.mjs <in.csv> <out.csv> <dept ex: 85> [encoding=latin1]
import fs from "node:fs";
import { parse } from "csv-parse";

const [inPath, outPath, dept, enc = "latin1"] = process.argv.slice(2);
if (!inPath || !outPath || !dept) {
  console.error("Usage: node filter-dept.mjs <in.csv> <out.csv> <dept> [encoding]");
  process.exit(1);
}

const q = (v) => `"${String(v ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;

const parser = fs.createReadStream(inPath).pipe(
  parse({
    columns: true,
    delimiter: ";",
    encoding: enc,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }),
);

const out = fs.createWriteStream(outPath, { encoding: "utf8" });
let header = null;
let read = 0;
let kept = 0;

for await (const row of parser) {
  read++;
  if (!header) {
    header = Object.keys(row);
    out.write(header.map(q).join(";") + "\n");
  }
  const cp = (row.adrs_codepostal || row.code_postal || row.cp || "").trim();
  if (cp.startsWith(dept)) {
    out.write(header.map((k) => q(row[k])).join(";") + "\n");
    kept++;
  }
  if (read % 100000 === 0) process.stderr.write(`  lues=${read} gardées=${kept}\r`);
}
out.end();
console.error(`\nTerminé : ${read} lignes lues, ${kept} gardées (dept ${dept}) → ${outPath}`);
