/**
 * Service SEO : génère de VRAIES pages HTML (côté serveur) par commune, ex.
 *   /vendee/challans, /haute-garonne/toulouse, /lot/cahors …
 * avec la liste des associations en clair -> indexable par Google (la SPA, en JS,
 * ne se référence pas bien sur "association Challans").
 *
 * Couvre TOUTE la France (métropole + DROM) — voir territoires.ts.
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

// Tournure naturelle pour les sous-titres H2 « Associations <…> à <ville> »
// (capte la longue traîne : "association sportive Brest", "association culturelle …").
const CAT_GENRE: Record<string, string> = {
  sport: "sportives",
  cult: "culturelles",
  eco: "écologie et environnement",
  social: "de vie locale",
  soli: "de solidarité",
  edu: "éducation et jeunesse",
  patri: "de patrimoine",
};
// Ordre d'affichage stable des catégories (celui de CATEGORIES).
const CAT_ORDER: string[] = CATEGORIES.map((c) => c.id);

// Slugs d'URL des pages catégorie×département : /<dept>/associations-sportives, etc.
// Volontairement explicites (riches en mots-clés + AUCUNE collision possible avec un
// slug de commune) -> le routeur teste d'abord ces slugs, sinon c'est une commune.
const CAT_SLUG: Record<string, string> = {
  sport: "associations-sportives",
  cult: "associations-culturelles",
  eco: "associations-environnement",
  social: "associations-vie-locale",
  soli: "associations-solidarite",
  edu: "associations-education",
  patri: "associations-patrimoine",
};
const CAT_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(CAT_SLUG).map(([id, slug]) => [slug, id]),
);

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function cleanCity(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
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
h2{font-size:20px;font-weight:800;letter-spacing:-.02em;margin:32px 0 12px}
h3{font-size:16px;font-weight:700;margin:20px 0 6px;color:var(--ink)}
.lead{font-size:17px;color:var(--muted);margin:0 0 28px}
.lead strong{color:var(--ink);font-weight:700}
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

  /** Fil d'Ariane schema.org (BreadcrumbList) : aide Google à afficher le chemin. */
  private breadcrumb(items: [string, string][]): object {
    return {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: items.map(([name, url], i) => ({
        "@type": "ListItem", position: i + 1, name, item: url,
      })),
    };
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
    const { nom: deptNom, region } = SEO_DEPARTEMENTS[deptCode];
    const rows = await this.db.execute<{ name: string; category_id: string; social: Record<string, string> | null; website: string | null }>(sql`
      SELECT name, category_id, social, website
      FROM associations
      WHERE department = ${c.dept} AND status = 'published' AND city = ${c.city}
      ORDER BY name ASC
      LIMIT ${MAX_LISTE}
    `);
    const items = rows.rows;

    // Une ligne <li> d'association (nom + catégorie + éventuel lien site officiel).
    // Le lien n'est rendu que s'il commence par http(s) : esc() neutralise les
    // guillemets mais pas un schéma dangereux du type javascript: (défense en
    // profondeur — la validation d'URL en amont accepte n'importe quel schéma).
    const renderLi = (a: typeof items[number]): string => {
      const label = CAT_LABEL[a.category_id] ?? "Association";
      const site = a.social?.website || a.website || null;
      const safeSite = site && /^https?:\/\//i.test(site) ? site : null;
      const link = safeSite ? ` <a href="${esc(safeSite)}" target="_blank" rel="nofollow noopener">site</a>` : "";
      return `  <li><span class="nom">${esc(a.name)}</span> <span class="cat">· ${esc(label)}</span>${link}</li>`;
    };

    // On REGROUPE par catégorie : chaque groupe devient une section avec un H2
    // riche en mots-clés ("Associations sportives à <ville>"). Bien meilleur pour
    // le référencement que la liste à plat (structure + longue traîne).
    const byCat: Record<string, typeof items> = {};
    for (const a of items) (byCat[a.category_id] ??= []).push(a);
    const catsPresent = CAT_ORDER.filter((id) => byCat[id]?.length);
    const sections = catsPresent.map((id) => {
      const genre = CAT_GENRE[id] ?? (CAT_LABEL[id] ?? "").toLowerCase();
      const lis = byCat[id].map(renderLi).join("\n");
      return `<h2>Associations ${esc(genre)} à ${esc(c.display)}</h2>\n<ul class="assos">\n${lis}\n</ul>`;
    }).join("\n");
    const reste = c.n > items.length ? `<p class="lead">… et ${c.n - items.length} autres associations à ${esc(c.display)}, à découvrir sur la <a href="/">carte interactive</a>.</p>` : "";

    // Maillage interne : quelques autres communes du même département.
    const voisines = (await this.allCommunes())
      .filter((x) => x.dept === deptCode && x.slug !== c.slug)
      .slice(0, 24)
      .map((x) => `<a href="/${x.deptSlug}/${x.slug}">Associations ${esc(x.display)}</a>`)
      .join("");

    // Phrase d'intro unique : ville + département + région + nombre + catégories.
    const themes = catsPresent.map((id) => (CAT_LABEL[id] ?? "").toLowerCase()).filter(Boolean);
    const themesTxt = themes.length ? themes.join(", ") : "sport, culture, solidarité, environnement, éducation";

    // FAQ : réponses courtes et autonomes (titres en questions). Restituées en
    // HTML visible ET en schema FAQPage -> citables par les moteurs IA (AI Overviews,
    // ChatGPT, Perplexity) qui répondent aux requêtes "associations à <ville>".
    const faq: [string, string][] = [
      [
        `Combien d'associations y a-t-il à ${c.display} ?`,
        `${c.display} (${deptNom}) compte ${c.n} association${c.n > 1 ? "s" : ""} référencée${c.n > 1 ? "s" : ""} sur GemensKarte, issues du Répertoire National des Associations (RNA).`,
      ],
      [
        `Comment trouver une association à ${c.display} ?`,
        `Parcourez la liste par thème ci-dessus (${themesTxt}), ou ouvrez la carte interactive de GemensKarte pour localiser les associations de ${c.display} et accéder à leurs coordonnées et à leur site.`,
      ],
      [
        `Quels types d'associations trouve-t-on à ${c.display} ?`,
        themes.length
          ? `À ${c.display}, on trouve notamment des associations ${themes.join(", ")}.`
          : `On trouve à ${c.display} des associations dans des domaines variés : sport, culture, solidarité, environnement, éducation.`,
      ],
    ];
    const faqHtml = `<h2>Questions fréquentes sur les associations à ${esc(c.display)}</h2>\n` +
      faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p class="lead">${esc(a)}</p>`).join("\n");

    const title = `Associations à ${c.display} (${deptNom}) — annuaire des assos`;
    const desc = `Les ${c.n} associations de ${c.display} (${deptNom}) : ${themesTxt}. Trouvez une association à ${c.display}, ses coordonnées et son site sur GemensKarte.`;
    const jsonld = JSON.stringify([
      {
        "@context": "https://schema.org", "@type": "ItemList",
        name: `Associations à ${c.display} (${deptNom})`, numberOfItems: c.n,
        itemListElement: items.slice(0, 100).map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.name })),
      },
      this.breadcrumb([
        ["Accueil", `${BASE}/`],
        [deptNom, `${BASE}/${c.deptSlug}`],
        [c.display, `${BASE}/${c.deptSlug}/${c.slug}`],
      ]),
      {
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faq.map(([q, a]) => ({
          "@type": "Question", name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ]);
    const body = `
<h1>Associations à ${esc(c.display)} (${esc(deptNom)})</h1>
<p class="lead">Vous cherchez une <strong>association à ${esc(c.display)}</strong> ? GemensKarte référence ${c.n} association${c.n > 1 ? "s" : ""} à ${esc(c.display)}, dans le département ${esc(deptNom)} (${esc(region)}) — ${esc(themesTxt)}. Retrouvez-les ci-dessous, ou explorez-les sur la <a href="/">carte interactive</a>. Voir aussi <a href="/${c.deptSlug}">toutes les communes — ${esc(deptNom)}</a>.</p>
${sections}
${reste}
${faqHtml}
${voisines ? `<p class="lead" style="margin-top:32px">Associations dans d'autres communes du ${esc(deptNom)} :</p>\n<div class="deps">${voisines}</div>` : ""}`;
    return this.doc({ title, desc, canonical: `${BASE}/${c.deptSlug}/${c.slug}`, jsonld, body });
  }

  /** Slug d'URL d'une catégorie (pour le routeur/contrôleur). */
  isCategorySlug(slug: string): boolean {
    return slug in CAT_BY_SLUG;
  }

  /** Page CATÉGORIE × DÉPARTEMENT : /<deptSlug>/associations-sportives, etc.
   *  Riche (toutes les communes du dépt ayant ce thème + un échantillon d'assos),
   *  pour capter « associations sportives <département> ». null si inconnu/vide. */
  async deptCategoryPage(deptSlug: string, catSlug: string): Promise<string | null> {
    const deptCode = SEO_CODE_BY_SLUG[deptSlug];
    const catId = CAT_BY_SLUG[catSlug];
    if (!deptCode || !catId) return null;
    const { nom: deptNom, region } = SEO_DEPARTEMENTS[deptCode];
    const genre = CAT_GENRE[catId] ?? (CAT_LABEL[catId] ?? "").toLowerCase();

    // Communes du département ayant au moins une asso de ce thème (avec compte).
    const grp = await this.db.execute<{ city: string; n: number }>(sql`
      SELECT city, count(*)::int AS n
      FROM associations
      WHERE department = ${deptCode} AND category_id = ${catId} AND status = 'published'
        AND city IS NOT NULL AND length(trim(city)) > 0
      GROUP BY city ORDER BY count(*) DESC, city ASC
    `);
    if (!grp.rows.length) return null; // pas de page si aucune asso de ce thème (pas de page maigre)
    const total = grp.rows.reduce((s, r) => s + r.n, 0);
    const nbCommunes = grp.rows.length;

    // Slug officiel de chaque commune (réutilise le dédoublonnage d'allCommunes).
    const slugByCity = new Map<string, string>();
    for (const c of (await this.allCommunes()).filter((x) => x.dept === deptCode)) slugByCity.set(c.city, c.slug);

    // Échantillon d'associations du thème (nom + ville), pour du contenu réel + ItemList.
    const assoRows = await this.db.execute<{ name: string; city: string }>(sql`
      SELECT name, city FROM associations
      WHERE department = ${deptCode} AND category_id = ${catId} AND status = 'published'
        AND city IS NOT NULL AND length(trim(city)) > 0
      ORDER BY name ASC LIMIT ${MAX_LISTE}
    `);
    const lis = assoRows.rows.map((a) =>
      `  <li><span class="nom">${esc(a.name)}</span> <span class="cat">· ${esc(cleanCity(a.city))}</span></li>`,
    ).join("\n");
    const reste = total > assoRows.rows.length
      ? `<p class="lead">… et ${total - assoRows.rows.length} autres associations ${esc(genre)} dans le département, à explorer sur la <a href="/">carte interactive</a>.</p>` : "";

    // Maillage : communes du thème (vers la page commune) + autres thèmes du département.
    const communeLinks = grp.rows.map((r) => {
      const sl = slugByCity.get(r.city);
      const lbl = `${esc(cleanCity(r.city))} <span class="c">${r.n}</span>`;
      return sl ? `<a href="/${deptSlug}/${sl}">${lbl}</a>` : `<span>${lbl}</span>`;
    }).join("\n");
    const autresThemes = CAT_ORDER.filter((id) => id !== catId).map((id) =>
      `<a href="/${deptSlug}/${CAT_SLUG[id]}">Associations ${esc(CAT_GENRE[id] ?? CAT_LABEL[id])} — ${esc(deptNom)}</a>`,
    ).join("");

    const faq: [string, string][] = [
      [
        `Combien d'associations ${genre} y a-t-il dans le département ${deptNom} ?`,
        `Le département ${deptNom} (${region}) compte ${total} association${total > 1 ? "s" : ""} ${genre} réparties dans ${nbCommunes} commune${nbCommunes > 1 ? "s" : ""}, référencées sur GemensKarte.`,
      ],
      [
        `Comment trouver une association ${genre} près de chez moi (${deptNom}) ?`,
        `Choisissez votre commune dans la liste ci-dessous, ou utilisez la carte interactive de GemensKarte pour localiser les associations ${genre} du département ${deptNom} et accéder à leurs coordonnées.`,
      ],
    ];
    const faqHtml = `<h2>Questions fréquentes</h2>\n` +
      faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p class="lead">${esc(a)}</p>`).join("\n");

    const title = `Associations ${genre} — ${deptNom} | GemensKarte`;
    const desc = `Les ${total} associations ${genre} du département ${deptNom} (${region}), dans ${nbCommunes} communes. Trouvez une association ${genre} près de chez vous sur GemensKarte.`;
    const jsonld = JSON.stringify([
      {
        "@context": "https://schema.org", "@type": "ItemList",
        name: `Associations ${genre} — ${deptNom}`, numberOfItems: total,
        itemListElement: assoRows.rows.slice(0, 100).map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.name })),
      },
      this.breadcrumb([
        ["Accueil", `${BASE}/`],
        [deptNom, `${BASE}/${deptSlug}`],
        [`Associations ${genre}`, `${BASE}/${deptSlug}/${catSlug}`],
      ]),
      {
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ]);
    const body = `
<h1>Associations ${esc(genre)} — ${esc(deptNom)}</h1>
<p class="lead">${total} <strong>association${total > 1 ? "s" : ""} ${esc(genre)}</strong> référencée${total > 1 ? "s" : ""} dans le département ${esc(deptNom)} (${esc(region)}), réparties dans ${nbCommunes} commune${nbCommunes > 1 ? "s" : ""}. Choisissez une commune ou explorez la <a href="/">carte interactive</a>. Voir aussi <a href="/${deptSlug}">toutes les communes — ${esc(deptNom)}</a>.</p>
<h2>Associations ${esc(genre)} par commune — ${esc(deptNom)}</h2>
<div class="grid">
${communeLinks}
</div>
<h2>Quelques associations ${esc(genre)} du ${esc(deptNom)}</h2>
<ul class="assos">
${lis}
</ul>
${reste}
${faqHtml}
<p class="lead" style="margin-top:32px">Autres thèmes — ${esc(deptNom)} :</p>
<div class="deps">${autresThemes}</div>`;
    return this.doc({ title, desc, canonical: `${BASE}/${deptSlug}/${catSlug}`, jsonld, body });
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
    const jsonld = JSON.stringify(this.breadcrumb([
      ["Accueil", `${BASE}/`],
      [nom, `${BASE}/${deptSlug}`],
    ]));
    const themeLinks = CAT_ORDER.map((id) =>
      `<a href="/${deptSlug}/${CAT_SLUG[id]}">Associations ${esc(CAT_GENRE[id] ?? CAT_LABEL[id])} — ${esc(nom)}</a>`,
    ).join("");
    const body = `
<h1>${esc(nom)} — associations par commune</h1>
<p class="lead">${communes.length} communes · ${total} associations référencées. Choisissez une commune, parcourez par thème, ou explorez la <a href="/">carte interactive</a>.</p>
<p class="lead" style="margin-top:0">Par thème :</p>
<div class="deps">${themeLinks}</div>
<div class="grid" style="margin-top:24px">
${liens}
</div>
<p class="lead" style="margin-top:32px">Autres territoires couverts :</p>
${this.autresDepts(deptSlug)}`;
    return this.doc({ title, desc, canonical: `${BASE}/${deptSlug}`, jsonld, body });
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

  // Découpage du sitemap : Google limite à 50 000 URL/fichier. ~49k communes -> on
  // passe par un sitemap INDEX qui pointe vers des sous-sitemaps de 20 000 URL.
  private readonly SITEMAP_CHUNK = 20000;

  /** Toutes les URL du sitemap (accueil + racine + départements + thèmes + communes). */
  private async sitemapUrls(): Promise<{ urls: string[]; mod: string }> {
    const communes = await this.allCommunes();
    const mod = communes.reduce((m, c) => (c.updated > m ? c.updated : m), "2024-01-01");
    // Pages catégorie×département (uniquement les combos qui ont des assos).
    const inList = SEO_DEPT_CODES.map((c) => `'${c}'`).join(",");
    const cat = await this.db.execute<{ department: string; category_id: string }>(sql.raw(`
      SELECT department, category_id FROM associations
      WHERE department IN (${inList}) AND status = 'published'
      GROUP BY department, category_id`));
    const catUrls = cat.rows
      .filter((r) => SEO_DEPARTEMENTS[r.department] && CAT_SLUG[r.category_id])
      .map((r) => `<url><loc>${BASE}/${SEO_DEPARTEMENTS[r.department].slug}/${CAT_SLUG[r.category_id]}</loc><lastmod>${mod}</lastmod><changefreq>weekly</changefreq><priority>0.65</priority></url>`);
    const urls = [
      `<url><loc>${BASE}/</loc><lastmod>${mod}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${BASE}/territoires</loc><lastmod>${mod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      ...Object.values(SEO_DEPARTEMENTS).map((d) =>
        `<url><loc>${BASE}/${d.slug}</loc><lastmod>${mod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`),
      ...catUrls,
      ...communes.map((c) =>
        `<url><loc>${BASE}/${c.deptSlug}/${c.slug}</loc><lastmod>${c.updated}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`),
    ];
    return { urls, mod };
  }

  /** /sitemap.xml = sitemap INDEX : liste les sous-sitemaps /sitemap-N.xml. */
  async sitemap(): Promise<string> {
    const { urls, mod } = await this.sitemapUrls();
    const n = Math.max(1, Math.ceil(urls.length / this.SITEMAP_CHUNK));
    const items = Array.from({ length: n }, (_, i) =>
      `<sitemap><loc>${BASE}/sitemap-${i}.xml</loc><lastmod>${mod}</lastmod></sitemap>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>\n`;
  }

  /** /sitemap-N.xml = une tranche de 20 000 URL. */
  async sitemapChunk(n: number): Promise<string> {
    const { urls } = await this.sitemapUrls();
    const slice = urls.slice(n * this.SITEMAP_CHUNK, (n + 1) * this.SITEMAP_CHUNK);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${slice.join("\n")}\n</urlset>\n`;
  }
}
