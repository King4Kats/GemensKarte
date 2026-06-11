/**
 * Service SEO : génère de VRAIES pages HTML (côté serveur) par commune de Vendée,
 * ex. /vendee/challans, avec la liste des associations en clair -> indexable par Google
 * (la SPA, elle, est en JavaScript et ne se référence pas bien sur "association Challans").
 *
 * Ces pages ne sont PAS liées depuis le site (masquées au visiteur normal) : on n'y arrive
 * que via Google. Elles renvoient vers la carte interactive. Le sitemap.xml les liste toutes.
 */
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { CATEGORIES } from "@gemenskarte/shared";
import { DB, type Db } from "../db/db.module";

const DEPT = "85";                       // Vendée seulement, pour l'instant
const BASE = "https://gemenskarte.fr";
const MAX_LISTE = 600;                   // plafond d'assos affichées par page (évite des pages énormes)

// id de catégorie -> libellé lisible (ex. "cult" -> "Culture").
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

/** Échappe les caractères spéciaux HTML (les noms d'assos contiennent &, <, ', etc.). */
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Espaces multiples -> un seul (la base contient "La   Roche-sur-Yon"). */
function cleanCity(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
/** Transforme un nom de commune en identifiant d'URL ("L'Île-d'Yeu" -> "l-ile-d-yeu"). */
function slugify(s: string): string {
  return cleanCity(s)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

interface Commune { city: string; display: string; slug: string; n: number; }

@Injectable()
export class SeoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // La liste des communes change peu : on la met en cache 30 min pour éviter de la
  // recalculer (avec les slugs) à chaque visite de robot.
  private cache: { at: number; list: Commune[] } | null = null;

  private async communes(): Promise<Commune[]> {
    if (this.cache && Date.now() - this.cache.at < 30 * 60 * 1000) return this.cache.list;
    const rows = await this.db.execute<{ city: string; n: number }>(sql`
      SELECT city, count(*)::int AS n
      FROM associations
      WHERE department = ${DEPT} AND status = 'published'
        AND city IS NOT NULL AND length(trim(city)) > 0
      GROUP BY city
      ORDER BY count(*) DESC, city ASC
    `);
    const seen = new Set<string>();
    const list: Commune[] = [];
    for (const r of rows.rows) {
      const display = cleanCity(r.city);
      let slug = slugify(display);
      if (!slug) continue;
      if (seen.has(slug)) slug = `${slug}-${list.length}`; // collision (rare) -> on diversifie
      seen.add(slug);
      list.push({ city: r.city, display, slug, n: r.n });
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
<footer>Données issues du Répertoire National des Associations (RNA, data.gouv.fr), enrichies automatiquement par GemensKarte. · <a href="/vendee">Toutes les communes de Vendée</a> · <a href="/">Accueil</a></footer>
</div></body></html>`;
  }

  /** Page d'une commune : /vendee/<slug>. Renvoie null si le slug n'existe pas. */
  async communePage(slug: string): Promise<string | null> {
    const c = (await this.communes()).find((x) => x.slug === slug);
    if (!c) return null;
    const rows = await this.db.execute<{ name: string; category_id: string; social: Record<string, string> | null; website: string | null }>(sql`
      SELECT name, category_id, social, website
      FROM associations
      WHERE department = ${DEPT} AND status = 'published' AND city = ${c.city}
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

    const title = `Associations à ${c.display} (Vendée) — GemensKarte`;
    const desc = `Les ${c.n} associations de ${c.display} (Vendée) : sport, culture, solidarité, environnement, éducation… Coordonnées et liens sur GemensKarte.`;
    const jsonld = JSON.stringify({
      "@context": "https://schema.org", "@type": "ItemList",
      name: `Associations à ${c.display} (Vendée)`, numberOfItems: c.n,
      itemListElement: items.slice(0, 100).map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.name })),
    });
    const body = `
<h1>Associations à ${esc(c.display)} (Vendée)</h1>
<p class="lead">${c.n} association${c.n > 1 ? "s" : ""} référencée${c.n > 1 ? "s" : ""} à ${esc(c.display)} — sport, culture, solidarité, environnement, éducation… Explorez-les sur la <a href="/">carte interactive de GemensKarte</a>.</p>
<ul class="assos">
${lis}
</ul>
${reste}`;
    return this.doc({ title, desc, canonical: `${BASE}/vendee/${c.slug}`, jsonld, body });
  }

  /** Index des communes : /vendee. */
  async indexPage(): Promise<string> {
    const list = await this.communes();
    const total = list.reduce((s, c) => s + c.n, 0);
    const liens = list.map((c) =>
      `  <a href="/vendee/${c.slug}">${esc(c.display)} <span class="c">${c.n}</span></a>`,
    ).join("\n");
    const title = "Associations de Vendée par commune — GemensKarte";
    const desc = `Toutes les communes de Vendée (${list.length}) et leurs associations (${total} au total) : sport, culture, solidarité… Trouvez les assos près de chez vous.`;
    const body = `
<h1>Associations de Vendée, commune par commune</h1>
<p class="lead">${list.length} communes · ${total} associations référencées en Vendée. Choisissez une commune, ou explorez la <a href="/">carte interactive</a>.</p>
<div class="grid">
${liens}
</div>`;
    return this.doc({ title, desc, canonical: `${BASE}/vendee`, body });
  }

  /** Sitemap XML : accueil + index Vendée + une URL par commune. */
  async sitemap(): Promise<string> {
    const list = await this.communes();
    const urls = [
      `<url><loc>${BASE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${BASE}/vendee</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      ...list.map((c) => `<url><loc>${BASE}/vendee/${c.slug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }
}
