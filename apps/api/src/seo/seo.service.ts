/**
 * Service SEO : génère de VRAIES pages HTML (côté serveur) par commune, ex.
 *   /vendee/challans, /haute-garonne/toulouse, /lot/cahors …
 * avec la liste des associations en clair -> indexable par Google (la SPA, en JS,
 * ne se référence pas bien sur "association Challans").
 *
 * Couvre la Vendée + l'Occitanie (sans l'Hérault) — voir territoires.ts.
 * Ces pages ne sont PAS mises en avant dans le site (on n'y arrive que via Google) ;
 * elles renvoient vers la carte interactive. Le sitemap.xml les liste toutes.
 */
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { CATEGORIES } from "@gemenskarte/shared";
import { DB, type Db } from "../db/db.module";
import { SEO_DEPARTEMENTS, SEO_DEPT_CODES, SEO_CODE_BY_SLUG } from "./territoires";

const BASE = "https://gemenskarte.fr";
const MAX_LISTE = 600; // plafond d'assos affichées par page (évite des pages énormes)

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cleanCity(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function slugify(s: string): string {
  return cleanCity(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function isoDate(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v ?? ""));
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

interface Commune { dept: string; deptSlug: string; city: string; display: string; slug: string; n: number; updated: string; }

@Injectable()
export class SeoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // La liste des communes (tous départements couverts) change peu : cache 30 min.
  private cache: { at: number; list: Commune[] } | null = null;

  private async allCommunes(): Promise<Commune[]> {
    if (this.cache && Date.now() - this.cache.at < 30 * 60 * 1000) return this.cache.list;
    const inList = SEO_DEPT_CODES.map((c) => `'${c}'`).join(","); // codes constants -> sûr
    const rows = await this.db.execute<{ department: string; city: string; n: number; updated: unknown }>(
      sql.raw(`
        SELECT department, city, count(*)::int AS n, max(updated_at) AS updated
        FROM associations
        WHERE department IN (${inList}) AND status = 'published'
          AND city IS NOT NULL AND length(trim(city)) > 0
        GROUP BY department, city
        ORDER BY count(*) DESC, city ASC
      `),
    );
    const seenByDept: Record<string, Set<string>> = {};
    const list: Commune[] = [];
    for (const r of rows.rows) {
      const meta = SEO_DEPARTEMENTS[r.department];
      if (!meta) continue;
      const display = cleanCity(r.city);
      let slug = slugify(display);
      if (!slug) continue;
      const seen = (seenByDept[r.department] ??= new Set());
      if (seen.has(slug)) slug = `${slug}-${list.length}`;
      seen.add(slug);
      list.push({ dept: r.department, deptSlug: meta.slug, city: r.city, display, slug, n: r.n, updated: isoDate(r.updated) });
    }
    this.cache = { at: Date.now(), list };
    return list;
  }

  /** Enveloppe un contenu dans un document HTML complet (head SEO + style minimal). */
  private doc(o: { title: string; desc: string; canonical: string; jsonld?: string; body: string }): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${o.canonical}">
<link rel="icon" href="/favicon.ico">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${o.canonical}">
${o.jsonld ? `<script type="application/ld+json">${o.jsonld}</script>` : ""}
<style>
:root{--ink:#15151b;--muted:#6b7280;--accent:#ff2d78;--bg:#fff;--soft:#fbfbf9;--line:#ececec}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}
.wrap{max-width:880px;margin:0 auto;padding:20px 20px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--line);margin-bottom:28px}
.logo{font-weight:800;font-size:20px;letter-spacing:-.02em;color:var(--ink);text-decoration:none}.logo span{color:var(--accent)}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;white-space:nowrap}
h1{font-size:clamp(26px,5vw,38px);font-weight:800;letter-spacing:-.03em;line-height:1.1;margin:0 0 12px}
.lead{font-size:17px;color:var(--muted);margin:0 0 28px}
ul.assos{list-style:none;padding:0;margin:0;display:grid;gap:8px}
ul.assos li{padding:11px 15px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}
.nom{font-weight:700}.cat{color:var(--muted);font-size:13px}
ul.assos a{color:var(--accent);text-decoration:none;font-size:13px;font-weight:600;margin-left:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.grid a{padding:9px 13px;border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--ink);font-weight:600;font-size:14px;background:var(--soft)}
.grid a:hover{border-color:var(--accent)}.grid .c{color:var(--muted);font-weight:500}
.deps{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.deps a{font-size:13px;color:var(--muted);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 12px}
footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
footer a{color:var(--muted)}
</style>
</head>
<body><div class="wrap">
<header>
  <a class="logo" href="/">Gemens<span>Karte</span></a>
  <a class="cta" href="/">Voir la carte interactive →</a>
</header>
${o.body}
<footer>Données issues du Répertoire National des Associations (RNA, data.gouv.fr), enrichies automatiquement par GemensKarte. · <a href="/">Accueil</a></footer>
</div></body></html>`;
  }

  /** Petite barre de liens vers les autres départements couverts (cross-linking crawl). */
  private autresDepts(currentSlug?: string): string {
    const links = Object.values(SEO_DEPARTEMENTS)
      .filter((d) => d.slug !== currentSlug)
      .map((d) => `<a href="/${d.slug}">${esc(d.nom)}</a>`)
      .join("");
    return `<div class="deps">${links}</div>`;
  }

  /** Page d'une commune : /<deptSlug>/<communeSlug>. null si introuvable. */
  async communePage(deptSlug: string, communeSlug: string): Promise<string | null> {
    const deptCode = SEO_CODE_BY_SLUG[deptSlug];
    if (!deptCode) return null;
    const c = (await this.allCommunes()).find((x) => x.dept === deptCode && x.slug === communeSlug);
    if (!c) return null;
    const { nom: deptNom } = SEO_DEPARTEMENTS[deptCode];
    const rows = await this.db.execute<{ name: string; category_id: string; social: Record<string, string> | null; website: string | null }>(sql`
      SELECT name, category_id, social, website
      FROM associations
      WHERE department = ${c.dept} AND status = 'published' AND city = ${c.city}
      ORDER BY name ASC
      LIMIT ${MAX_LISTE}
    `);
    const items = rows.rows;
    const lis = items.map((a) => {
      const label = CAT_LABEL[a.category_id] ?? "Association";
      const site = a.social?.website || a.website || null;
      const link = site ? ` <a href="${esc(site)}" target="_blank" rel="nofollow noopener">site</a>` : "";
      return `  <li><span class="nom">${esc(a.name)}</span> <span class="cat">· ${esc(label)}</span>${link}</li>`;
    }).join("\n");
    const reste = c.n > items.length ? `<p class="lead">… et ${c.n - items.length} autres associations à ${esc(c.display)}, à découvrir sur la <a href="/">carte interactive</a>.</p>` : "";

    const title = `Associations à ${c.display} (${deptNom}) — GemensKarte`;
    const desc = `Les ${c.n} associations de ${c.display} (${deptNom}) : sport, culture, solidarité, environnement, éducation… Coordonnées et liens sur GemensKarte.`;
    const jsonld = JSON.stringify({
      "@context": "https://schema.org", "@type": "ItemList",
      name: `Associations à ${c.display} (${deptNom})`, numberOfItems: c.n,
      itemListElement: items.slice(0, 100).map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.name })),
    });
    const body = `
<h1>Associations à ${esc(c.display)} (${esc(deptNom)})</h1>
<p class="lead">${c.n} association${c.n > 1 ? "s" : ""} référencée${c.n > 1 ? "s" : ""} à ${esc(c.display)} — sport, culture, solidarité, environnement, éducation… Explorez-les sur la <a href="/">carte interactive de GemensKarte</a>. Voir <a href="/${c.deptSlug}">toutes les communes — ${esc(deptNom)}</a>.</p>
<ul class="assos">
${lis}
</ul>
${reste}`;
    return this.doc({ title, desc, canonical: `${BASE}/${c.deptSlug}/${c.slug}`, jsonld, body });
  }

  /** Index d'un département : /<deptSlug> (liste de ses communes). null si inconnu. */
  async deptIndex(deptSlug: string): Promise<string | null> {
    const deptCode = SEO_CODE_BY_SLUG[deptSlug];
    if (!deptCode) return null;
    const { nom } = SEO_DEPARTEMENTS[deptCode];
    const communes = (await this.allCommunes()).filter((c) => c.dept === deptCode);
    const total = communes.reduce((s, c) => s + c.n, 0);
    const liens = communes.map((c) =>
      `  <a href="/${c.deptSlug}/${c.slug}">${esc(c.display)} <span class="c">${c.n}</span></a>`,
    ).join("\n");
    const title = `Associations par commune — ${nom} — GemensKarte`;
    const desc = `${nom} : ${communes.length} communes et leurs ${total} associations référencées — trouvez les assos près de chez vous.`;
    const body = `
<h1>${esc(nom)} — associations par commune</h1>
<p class="lead">${communes.length} communes · ${total} associations référencées. Choisissez une commune, ou explorez la <a href="/">carte interactive</a>.</p>
<div class="grid">
${liens}
</div>
<p class="lead" style="margin-top:32px">Autres territoires couverts :</p>
${this.autresDepts(deptSlug)}`;
    return this.doc({ title, desc, canonical: `${BASE}/${deptSlug}`, body });
  }

  /** Index RACINE : tous les territoires couverts (départements), groupés par région. */
  async rootIndex(): Promise<string> {
    const communes = await this.allCommunes();
    const byDept: Record<string, { communes: number; assos: number }> = {};
    for (const c of communes) {
      const e = (byDept[c.dept] ??= { communes: 0, assos: 0 });
      e.communes += 1; e.assos += c.n;
    }
    const byRegion: Record<string, string[]> = {};
    for (const code of SEO_DEPT_CODES) {
      (byRegion[SEO_DEPARTEMENTS[code].region] ??= []).push(code);
    }
    const sections = Object.entries(byRegion).map(([region, codes]) => {
      const cards = codes.map((code) => {
        const d = SEO_DEPARTEMENTS[code];
        const stat = byDept[code] ?? { communes: 0, assos: 0 };
        return `  <a href="/${d.slug}">${esc(d.nom)} <span class="c">${stat.assos} assos · ${stat.communes} communes</span></a>`;
      }).join("\n");
      return `<h2 style="font-size:18px;margin:28px 0 12px;font-weight:800">${esc(region)}</h2>\n<div class="grid">\n${cards}\n</div>`;
    }).join("\n");
    const totalAssos = Object.values(byDept).reduce((s, e) => s + e.assos, 0);
    const title = "Associations par commune en France — GemensKarte";
    const desc = `Trouvez les associations près de chez vous : ${communes.length} communes, ${totalAssos} associations référencées partout en France.`;
    const body = `
<h1>Associations par commune</h1>
<p class="lead">${communes.length} communes · ${totalAssos} associations référencées. Choisissez votre territoire, ou explorez la <a href="/">carte interactive</a>.</p>
${sections}`;
    return this.doc({ title, desc, canonical: `${BASE}/territoires`, body });
  }

  /** Sitemap XML : accueil + index racine + chaque index département + chaque commune. */
  async sitemap(): Promise<string> {
    const communes = await this.allCommunes();
    const globalMod = communes.reduce((m, c) => (c.updated > m ? c.updated : m), "2024-01-01");
    const urls = [
      `<url><loc>${BASE}/</loc><lastmod>${globalMod}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${BASE}/territoires</loc><lastmod>${globalMod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      ...Object.values(SEO_DEPARTEMENTS).map((d) =>
        `<url><loc>${BASE}/${d.slug}</loc><lastmod>${globalMod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`),
      ...communes.map((c) =>
        `<url><loc>${BASE}/${c.deptSlug}/${c.slug}</loc><lastmod>${c.updated}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }
}
