/**
 * Page d'accueil (landing) de GemensKarte.
 * C'est la vitrine du site : grand titre, carte des départements pour choisir
 * un territoire, statistiques animées, explication de la qualité des données,
 * ressources utiles, appel aux dons et pied de page.
 * Tout le contenu visuel est défini ici en JSX (le HTML version React),
 * avec des styles écrits directement dans le code (style inline).
 */
import { useEffect, useRef, useState } from "react";
import { api, type Suggestion, type ProgressData, type TerritoryStat } from "../lib/api";
import { CATEGORIES, catById } from "../lib/categories";
import { Logo } from "../components/Logo";
import { SearchBar } from "../components/SearchBar";
import { DepartmentMap } from "../components/DepartmentMap";
import { Icon } from "../components/Icon";
import { STRIPE_DON_URL } from "../lib/config";
import { useIsMobile } from "../lib/useIsMobile";
import { ConfettiField } from "../components/ConfettiField";
import { ContactModal } from "../components/ContactModal";
import { REGION_COLOR, COVERED_CODES, COVERED, STATE_COLOR, STATE_LABEL, type DeptMeta } from "../data/departements";

// Options passées quand on quitte l'accueil pour aller explorer la carte
// (recherche tapée, catégorie choisie, fiche à ouvrir).
export interface ExploreOpts {
  q?: string;
  cat?: string;
  open?: string;
}

// ── Compteur animé ─────────────────────────────────────────────────────────
// Hook (fonction réutilisable React) qui fait grimper un nombre de 0 jusqu'à
// `target` en douceur, pour l'effet "compteur qui défile" sur les stats.
// Tant que `target` est null (donnée pas encore chargée), rien ne démarre ;
// le `startedRef` garantit que l'animation ne se relance qu'une seule fois.
function useCountUp(target: number | null, duration = 1800) {
  const [count, setCount] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (target === null || startedRef.current) return;
    startedRef.current = true;
    const startTime = performance.now();
    // À chaque image de l'animation : on calcule la progression (0 → 1),
    // on applique une courbe d'accélération douce (ease) puis on met le nombre à jour.
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setCount(Math.floor(ease * target));
      if (p < 1) requestAnimationFrame(tick);
      else setCount(target);
    };
    const t = setTimeout(() => requestAnimationFrame(tick), 400);
    return () => clearTimeout(t);
  }, [target, duration]);
  return count;
}

// ── Chip catégorie ──────────────────────────────────────────────────────────
// Petit bouton-pastille pour une catégorie d'association (avec sa pastille de
// couleur et son libellé). Au survol, on change directement le style de
// l'élément pour l'effet de surbrillance. `delay` décale l'animation d'entrée.
function CatChip({ cat, onClick, delay }: { cat: string; onClick: (c: string) => void; delay: number }) {
  const c = catById(cat);
  return (
    <button
      onClick={() => onClick(cat)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        height: 40, padding: "0 16px 0 13px", borderRadius: "var(--radius-pill)",
        border: "1.5px solid var(--hairline)", background: "var(--bg)",
        cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 14,
        color: "var(--ink)", letterSpacing: "-0.01em",
        opacity: 0, animation: `cmSlideUp .5s cubic-bezier(.22,1,.36,1) ${delay}s forwards`,
        transition: "border-color .16s, transform .16s, box-shadow .16s, background .16s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = c.color;
        el.style.transform = "translateY(-3px) scale(1.03)";
        el.style.boxShadow = `0 8px 20px color-mix(in srgb, ${c.color} 25%, transparent)`;
        el.style.background = `color-mix(in srgb, ${c.color} 7%, white)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "var(--hairline)";
        el.style.transform = "none";
        el.style.boxShadow = "none";
        el.style.background = "var(--bg)";
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: c.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${c.color} 18%, transparent)` }} />
      {c.label}
    </button>
  );
}

const navLink = { background: "transparent", color: "var(--ink)", fontWeight: 700 } as const;

// Couleur de la barre de progression par réseau (section "enrichissement en direct").
const PROG_COLOR: Record<string, string> = {
  instagram: "#EC2D8A", facebook: "#1877f2", helloasso: "#f5a623", website: "#7b3ff2",
};

// ── Landing ─────────────────────────────────────────────────────────────────
// Composant principal de la page d'accueil.
// Les `props` sont des fonctions fournies par le parent : onSelect (un
// département a été cliqué), onExplore (aller vers la carte), onPortal (revenir
// au choix des territoires), et `dept` = territoire éventuellement déjà choisi.
export function Landing({ onSelect, onExplore, onPortal, dept }: {
  onSelect: (d: DeptMeta) => void;
  onExplore?: (o: ExploreOpts) => void;
  onPortal?: () => void;
  dept?: DeptMeta | null;
}) {
  const [q, setQ] = useState("");
  const isMobile = useIsMobile();              // true sur téléphone -> menu burger
  const [menuOpen, setMenuOpen] = useState(false); // burger ouvert/fermé
  const [modal, setModal] = useState<"recenser" | "deferencer" | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [dataStats, setDataStats] = useState<Record<string, { n: number; pct: number }> & { total?: number } | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null); // avancement des passes
  const [showTerr, setShowTerr] = useState(false);                     // détail par territoire déplié ?
  const [territories, setTerritories] = useState<TerritoryStat[] | null>(null); // stats par département
  const animCount = useCountUp(total);

  // Au premier affichage de la page : on demande à l'API le nombre total
  // d'associations et les statistiques détaillées (pour la section "données").
  useEffect(() => {
    api.list({ limit: 1 }).then((r) => setTotal(r.total)).catch(() => setTotal(null));
    // Stats + avancement : on charge tout de suite, puis on rafraîchit toutes les 60s
    // pour voir les chiffres grimper en direct au fil des passes (sans recharger la page).
    const load = () => {
      (api.fetchStats as () => Promise<any>)().then(setDataStats).catch(() => {});
      api.fetchProgress().then(setProgress).catch(() => {});
    };
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  // Suggestions de recherche en direct pendant la frappe.
  // Le setTimeout de 160 ms est un "debounce" (on attend une petite pause dans
  // la frappe avant d'appeler l'API) pour éviter une requête à chaque lettre.
  useEffect(() => {
    const t = q.trim();
    if (!t) { setSuggestions([]); return; }
    const id = setTimeout(() => {
      api.suggest(t, 6).then(setSuggestions).catch(() => setSuggestions([]));
    }, 160);
    return () => clearTimeout(id);
  }, [q]);


  // Les 4 chiffres clés affichés sous le titre. Le premier utilise le compteur
  // animé ; tant que la donnée n'est pas arrivée, on affiche "…".
  const stats = [
    { n: total !== null ? animCount.toLocaleString("fr-FR") : "…", l: "associations" },
    { n: String(COVERED_CODES.length), l: COVERED_CODES.length > 1 ? "territoires" : "territoire" },
    { n: "7", l: "univers" },
    { n: "100%", l: "code ouvert" },
  ];


  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
        padding: "22px clamp(20px, 5vw, 64px)", position: "relative", zIndex: 1000,
        opacity: 0, animation: "cmFadeDown .5s ease .05s forwards",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo size={34} />
          {dept && (
            <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 11px",
              borderRadius: "var(--radius-pill)", background: "var(--bg-soft)",
              border: "1.5px solid var(--hairline)", fontSize: 12.5, fontWeight: 800 }}>
              {dept.nom}
            </span>
          )}
          {/* Code source (lien + logo GitHub) — projet à code ouvert. */}
          <a href="https://github.com/King4Kats/GemensKarte" target="_blank" rel="noopener noreferrer"
            aria-label="Code source sur GitHub" title="Code source sur GitHub"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: 10, color: "var(--ink)",
              border: "1.5px solid var(--hairline)", background: "var(--bg)", flexShrink: 0 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.36-1.33-1.73-1.33-1.73-1.09-.73.08-.72.08-.72 1.2.08 1.83 1.21 1.83 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.57-2.67-.3-5.47-1.31-5.47-5.84 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21.96-.26 1.98-.39 3-.4 1.02.01 2.04.14 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.24 1.88 1.24 3.17 0 4.54-2.81 5.54-5.49 5.83.43.36.81 1.09.81 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.22.68.83.56C20.56 21.88 24 17.48 24 12.29 24 5.78 18.63.5 12 .5z"/>
            </svg>
          </a>
        </div>
        {/* Desktop : barre de navigation normale. Mobile : un bouton burger qui
            ouvre un menu déroulant avec EXACTEMENT les mêmes liens. */}
        {!isMobile ? (
          <nav style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            {onPortal && (
              <button className="btn btn-sm" style={navLink} onClick={onPortal}>← Territoires</button>
            )}
            <a className="btn btn-sm" style={navLink} href="#carte">Choisir un territoire</a>
            <button className="btn btn-sm" style={navLink} onClick={() => setModal("recenser")}>Référencer mon asso</button>
            <a className="btn btn-sm" style={navLink} href="#stats">Les données</a>
            <a className="btn btn-sm" style={navLink} href="#quarantaine">Trier les liens</a>
            <a className="btn btn-accent btn-sm" href="#dons" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="heart" size={14} stroke={2.4} /> Soutenir
            </a>
          </nav>
        ) : (
          <div style={{ position: "relative" }}>
            <button aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}
              style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12,
                border: "1.5px solid var(--hairline)", background: "var(--bg)", cursor: "pointer", color: "var(--ink)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                {menuOpen
                  ? (<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>)
                  : (<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>)}
              </svg>
            </button>
            {menuOpen && (
              <>
                {/* Fond transparent : un clic en dehors referme le menu. */}
                <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 41,
                  background: "var(--bg)", borderRadius: 16, boxShadow: "var(--shadow-pop)",
                  border: "1px solid var(--hairline)", padding: 8, minWidth: 220,
                  display: "flex", flexDirection: "column", gap: 2 }}>
                  {onPortal && (
                    <button className="btn btn-sm" style={{ ...navLink, justifyContent: "flex-start", width: "100%" }}
                      onClick={() => { setMenuOpen(false); onPortal(); }}>← Territoires</button>
                  )}
                  <a className="btn btn-sm" style={{ ...navLink, justifyContent: "flex-start", width: "100%" }}
                    href="#carte" onClick={() => setMenuOpen(false)}>Choisir un territoire</a>
                  <button className="btn btn-sm" style={{ ...navLink, justifyContent: "flex-start", width: "100%" }}
                    onClick={() => { setMenuOpen(false); setModal("recenser"); }}>Référencer mon asso</button>
                  <a className="btn btn-sm" style={{ ...navLink, justifyContent: "flex-start", width: "100%" }}
                    href="#stats" onClick={() => setMenuOpen(false)}>Les données</a>
                  <a className="btn btn-sm" style={{ ...navLink, justifyContent: "flex-start", width: "100%" }}
                    href="#quarantaine" onClick={() => setMenuOpen(false)}>Trier les liens</a>
                  <a className="btn btn-accent btn-sm" href="#dons" onClick={() => setMenuOpen(false)}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
                    <Icon name="heart" size={14} stroke={2.4} /> Soutenir
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section style={{
        position: "relative", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "20px clamp(20px, 5vw, 64px) 0", overflow: "hidden",
        minHeight: "calc(100vh - 80px)",
      }}>
        {/* Pluie de confettis décorative en arrière-plan du hero */}
        <ConfettiField count={30} seed={11} />

        <div style={{
          position: "relative", zIndex: 5, width: "100%", maxWidth: 960,
          textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          {/* Badge régions */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28,
            padding: "7px 15px 7px 11px", borderRadius: "var(--radius-pill)",
            background: "var(--bg-sunk)", fontSize: 13, fontWeight: 700,
            color: "var(--ink-2)", letterSpacing: "-0.01em",
            opacity: 0, animation: "cmSlideUp .5s cubic-bezier(.22,1,.36,1) .1s forwards",
          }}>
            <span style={{ display: "inline-flex", gap: 4 }}>
              {(dept ? [REGION_COLOR[dept.region]] : ["#ff2d78", "#00d68f", "#2b59ff"]).map((c, i) => (
                <i key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c, animation: `cmPulse 2.4s ease ${i * 0.4}s infinite` }} />
              ))}
            </span>
            {dept ? `${dept.nom} · ${dept.region}` : "Carte des associations locales"}
          </span>

          {/* H1 */}
          <h1 className="display" style={{
            fontSize: "clamp(44px, 7.4vw, 92px)", margin: "0 0 24px", color: "var(--ink)",
            opacity: 0, animation: "cmSlideUp .6s cubic-bezier(.22,1,.36,1) .18s forwards",
          }}>
            Le territoire<br />
            <span style={{ position: "relative", color: "var(--accent)", whiteSpace: "nowrap" }}>
              des assos
              {/* Trait dessiné à la main sous "des assos", animé pour se
                  "tracer" tout seul (l'animation joue sur le pointillé du SVG) */}
              <svg viewBox="0 0 240 18" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: "-0.12em", width: "100%", height: "0.22em", overflow: "visible" }}>
                <path d="M3 13 C 60 4, 180 4, 237 11" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                  pathLength="1" strokeDasharray="1" strokeDashoffset="1"
                  style={{ animation: "cmDrawLine .7s ease .75s forwards" }} />
              </svg>
            </span>
          </h1>

          {/* Sous-titre */}
          <p style={{
            fontSize: "clamp(16px, 2vw, 20px)", lineHeight: 1.55, color: "var(--ink-2)",
            margin: "0 0 40px", maxWidth: 560, fontWeight: 500, textWrap: "balance" as never,
            opacity: 0, animation: "cmSlideUp .6s cubic-bezier(.22,1,.36,1) .28s forwards",
          }}>
            Répertorier, découvrir et rejoindre les associations qui font vivre le territoire.
            Une carte, mille élans citoyens.
          </p>

          {/* Sélecteur de territoire (carte SVG) */}
          <div id="carte" style={{ width: "100%", maxWidth: 600, position: "relative", zIndex: 50, opacity: 0, animation: "cmSlideUp .6s cubic-bezier(.22,1,.36,1) .38s forwards" }}>
            <DepartmentMap onSelect={onSelect} />
          </div>
        </div>

        {/* Stats */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", flexWrap: "wrap", justifyContent: "center",
          gap: "clamp(28px, 6vw, 72px)", padding: "48px 0 36px",
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: "center", opacity: 0, animation: `cmSlideUp .55s cubic-bezier(.22,1,.36,1) ${0.85 + i * 0.1}s forwards` }}>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.045em", color: "var(--ink)", lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginTop: 6 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Scroll hint */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingBottom: 32, opacity: 0, animation: "cmFadeIn .6s ease 1.4s forwards" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>En savoir plus</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "cmBounce 2s ease infinite" }}>
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* ── Section À propos ── */}
      <section style={{
        padding: "96px clamp(24px, 8vw, 120px)",
        background: "var(--bg-soft)",
        display: "flex", gap: "clamp(32px, 6vw, 96px)",
        alignItems: "center", flexWrap: "wrap",
      }}>
        {/* Texte */}
        <div style={{ flex: "1 1 300px", maxWidth: 560 }}>
          <span className="eyebrow" style={{ marginBottom: 16, display: "block" }}>Le projet</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 24px", lineHeight: 1.1 }}>
            Fait avec <span style={{ color: "#ff2d78", display: "inline-flex", verticalAlign: "middle" }}><Icon name="heart" size={30} stroke={2.2} /></span> en Vendée,<br />pour toutes les régions
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 20px" }}>
            GemensKarte est un projet <strong>100&nbsp;% bénévole</strong>, né d'un constat simple&nbsp;:
            trouver une association locale est souvent compliqué. Les annuaires sont éparpillés,
            les sites vieillissants, les données incomplètes.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 32px" }}>
            L'objectif&nbsp;: <strong>mettre en avant le dynamisme associatif du territoire</strong> et
            permettre à chacun de découvrir, rejoindre ou soutenir une association près de chez soi —
            qu'il s'agisse d'un club de foot de village, d'une amicale de quartier ou d'une association
            de sauvegarde du patrimoine local.
          </p>
          <a className="btn btn-accent btn-md" href="#carte">
            Choisir un territoire →
          </a>
        </div>

        {/* Pillules illustratives */}
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 16 }}>
          {([
            { icon: "pin", color: "#2b59ff", label: `${total?.toLocaleString("fr-FR") ?? "…"} associations référencées` },
            { icon: "map", color: "#ff2d78", label: "Vendée — d'autres territoires à venir" },
            { icon: "search", color: "#7b3ff2", label: "Recherche par type, ville, distance" },
            { icon: "users", color: "#00d68f", label: "Entièrement bénévole & à code ouvert" },
          ] as const).map((it) => (
            <div key={it.label} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 18px", borderRadius: "var(--radius)",
              background: "var(--bg)", border: "1px solid var(--hairline)",
              boxShadow: "var(--shadow-card)",
            }}>
              <span style={{ display: "inline-flex", color: it.color, flexShrink: 0 }}>
                <Icon name={it.icon} size={20} stroke={2.1} />
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{it.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section Qualité des données / Comment on scrape ── */}
      <section style={{ position: "relative", overflow: "hidden", padding: "96px clamp(24px, 8vw, 120px)" }}>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 980, margin: "0 auto" }}>

          {/* En-tête */}
          <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 56px" }}>
            <span className="eyebrow" style={{ marginBottom: 12, display: "block" }}>Qualité des données</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 16px", lineHeight: 1.1 }}>
              Des fiches vérifiées, pas devinées
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--ink-2)", margin: 0, textWrap: "pretty" as never }}>
              On part des données officielles (souvent pauvres), puis chaque lien est <strong>cherché sur le web</strong>
              et <strong>validé par une IA</strong> avant d'apparaître. Notre règle&nbsp;: <strong>mieux vaut une fiche
              vide qu'une fiche fausse.</strong>
            </p>
          </div>

          {/* Illustration du pipeline */}
          <img
            src="/pipeline.svg"
            alt="Le pipeline en 3 étapes : on cherche les liens sur le web, une IA les vérifie, puis on affiche une fiche notée."
            loading="lazy"
            style={{ display: "block", width: "100%", maxWidth: 880, margin: "8px auto 48px" }}
          />

          {/* Les 3 étapes du pipeline */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {([
              { c: "#3B6BFF", n: "1", icon: "search", t: "On cherche", d: "Pour chaque association, on interroge le web (moteur de recherche) pour trouver ses liens : site, Facebook, Instagram, HelloAsso." },
              { c: "#EC2D8A", n: "2", icon: "sparkle", t: "On vérifie (IA)", d: "Une IA lit la page (ou son extrait) et tranche : ce lien appartient-il vraiment à CETTE association ? Elle attribue un niveau de confiance." },
              { c: "#19C37D", n: "3", icon: "check", t: "On affiche", d: "Seuls les liens confirmés sont publiés. Les liens douteux partent en revue, les liens faux sont écartés." },
            ] as const).map((s) => (
              <div key={s.n} style={{
                position: "relative", borderRadius: "var(--radius)", background: "var(--bg)",
                border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)", padding: "22px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 11, background: `color-mix(in srgb, ${s.c} 14%, white)`, color: s.c }}><Icon name={s.icon} size={18} stroke={2.2} /></span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: s.c }}>Étape {s.n}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", marginBottom: 6 }}>{s.t}</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>

          {/* Règle d'or */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginTop: 16, padding: "14px 18px",
            borderRadius: "var(--radius)", background: "color-mix(in srgb, #19C37D 8%, white)",
            border: "1px solid color-mix(in srgb, #19C37D 28%, white)",
          }}>
            <span style={{ display: "inline-flex", color: "#19C37D", flexShrink: 0 }}><Icon name="shield" size={20} stroke={2.1} /></span>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>
              <strong>Règle d'or :</strong> on privilégie la justesse à l'exhaustivité. En cas de doute,
              rien n'est affiché — plutôt que d'afficher le mauvais Facebook ou un site qui n'existe plus.
            </span>
          </div>

          {/* Ce qu'on enrichit */}
          <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", margin: "56px 0 18px", textAlign: "center" }}>
            Ce qu'on enrichit &amp; nettoie
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
            {([
              { icon: "globe", color: "#7b3ff2", l: "Site web officiel" },
              { icon: "facebook", color: "#1877f2", l: "Réseaux sociaux" },
              { icon: "heart", color: "#f5a623", l: "HelloAsso (dons)" },
              { icon: "calendar", color: "#00d68f", l: "Agenda à venir" },
              { icon: "close", color: "#9ca3af", l: "Liens morts retirés" },
            ] as const).map(({ icon, color, l }) => (
              <span key={l} style={{
                display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px",
                borderRadius: "var(--radius-pill)", background: "var(--bg)", border: "1.5px solid var(--hairline)",
                fontSize: 14, fontWeight: 700, color: "var(--ink)",
              }}>
                <span style={{ display: "inline-flex", color }}><Icon name={icon} size={17} stroke={2.1} /></span>{l}
              </span>
            ))}
          </div>

          {/* Avancement EN DIRECT des passes d'enrichissement, par réseau social. */}
          {progress && (
            <div style={{ marginTop: 56, borderRadius: 22, background: "var(--bg-soft)", padding: "clamp(24px, 4vw, 40px)" }}>
              <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 30px" }}>
                <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 8px" }}>
                  Enrichissement en direct — {progress.territory}
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>
                  Où en sont les scripts, réseau par réseau. Prochain territoire prévu :{" "}
                  <strong style={{ color: "var(--ink)" }}>{progress.next}</strong>.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640, margin: "0 auto" }}>
                {progress.platforms.map((p) => {
                  const color = PROG_COLOR[p.key] ?? "var(--accent)";
                  return (
                    <div key={p.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, gap: 10 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{p.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
                          <span style={{ color }}>{p.validated.toLocaleString("fr-FR")}</span> trouvés · {p.pct}% balayé
                        </span>
                      </div>
                      <div style={{ height: 10, borderRadius: 999, background: "var(--bg-sunk)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(p.pct, 1.5)}%`, background: color, borderRadius: 999, transition: "width .8s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", margin: "24px 0 0", fontStyle: "italic" }}>
                Le balayage progresse tout seul ; les liens trouvés sont vérifiés par l'IA avant d'apparaître.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Section Espace Ressources ── */}
      <section style={{ position: "relative", overflow: "hidden", padding: "96px clamp(24px, 8vw, 120px)", background: "var(--bg-soft)" }}>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 880, margin: "0 auto" }}>

          {/* En-tête */}
          <div style={{ marginBottom: 48 }}>
            <span className="eyebrow" style={{ marginBottom: 12, display: "block" }}>Ressources libres</span>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 14px", lineHeight: 1.1 }}>
              Bibliothèque de ressources
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 520, fontWeight: 500, margin: 0 }}>
              Guides, modèles et réseaux pour organiser des événements responsables —
              à disposition de toutes les associations.
            </p>
          </div>

          {/* Grille fiches */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {([
              {
                color: "#00d68f",
                tag: "Guide",
                source: "ADEME",
                favicon: "ademe.fr",
                title: "Événementiel responsable",
                desc: "La référence pour organiser des événements éco-responsables — conseils, outils, retours d'expérience.",
                href: "https://communication-responsable.ademe.fr/evenementiel-responsable",
              },
              {
                color: "#7b3ff2",
                tag: "Modèle",
                source: "Univ. Rennes",
                favicon: "univ-rennes.fr",
                title: "Convention de prêt de matériel",
                desc: "Modèle de contrat clé en main pour formaliser le prêt de matériel entre associations.",
                href: "https://etudiant.univ-rennes.fr/sites/etudiant.univ-rennes.fr/files/medias/files/Contrat%20de%20pr%C3%AAt.pdf",
              },
              {
                color: "#ff5c35",
                tag: "Réseau",
                source: "Réseau Éco-Événement",
                favicon: "reseau-ecoevenement.net",
                title: "Réseau Éco-Événement",
                desc: "La communauté des organisateurs engagés pour des manifestations plus durables.",
                href: "https://reseau-ecoevenement.net/",
              },
              {
                color: "#ffc300",
                tag: "Réseau",
                source: "Collectif des Festivals",
                favicon: "lecollectifdesfestivals.org",
                title: "Collectif des Festivals",
                desc: "Les festivals qui s'engagent collectivement vers le développement durable.",
                href: "https://www.lecollectifdesfestivals.org/collectif/collectif-des-festivals/",
              },
              {
                color: "#e8431a",
                tag: "Presse locale",
                source: "Ouest-France",
                favicon: "infolocale.ouest-france.fr",
                title: "Infolocale Vendée",
                desc: "Publication gratuite des événements et actualités associatives auprès des lecteurs vendéens.",
                href: "https://infolocale.ouest-france.fr/?dpt=vendee",
              },
            ] as const).map((res) => (
              <a
                key={res.title}
                href={res.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", flexDirection: "column", gap: 0,
                  borderRadius: "var(--radius)", overflow: "hidden",
                  background: "var(--bg)",
                  border: "1px solid var(--hairline)",
                  boxShadow: "var(--shadow-card)",
                  textDecoration: "none",
                  transition: "transform .18s, box-shadow .18s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform = "translateY(-3px)";
                  el.style.boxShadow = `0 10px 28px color-mix(in srgb, ${res.color} 16%, transparent), var(--shadow-card)`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement;
                  el.style.transform = "none";
                  el.style.boxShadow = "var(--shadow-card)";
                }}
              >
                {/* Tranche colorée + emoji */}
                <div style={{
                  height: 6,
                  background: res.color,
                }} />
                <div style={{ padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {/* Tag + source */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em",
                      textTransform: "uppercase", color: res.color,
                      padding: "2px 8px", borderRadius: 20,
                      background: `color-mix(in srgb, ${res.color} 12%, white)`,
                    }}>
                      {res.tag}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                      {res.source}
                    </span>
                  </div>

                  {/* Titre */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <img
                    src={`https://www.google.com/s2/favicons?domain=${res.favicon}&sz=32`}
                    alt={res.source}
                    style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, marginTop: 2 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                    <h3 style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0, lineHeight: 1.3 }}>
                      {res.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", margin: 0 }}>
                    {res.desc}
                  </p>

                  {/* Lien */}
                  <span style={{
                    fontSize: 12.5, fontWeight: 700, color: res.color,
                    marginTop: "auto", paddingTop: 4,
                  }}>
                    Accéder →
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Fenêtre de contact (référencer ou déréférencer une asso), affichée
          seulement quand `modal` contient un mode. */}
      {modal && <ContactModal mode={modal} onClose={() => setModal(null)} />}

      {/* ── Section Données ouvertes ── */}
      <section id="stats" style={{ position: "relative", overflow: "hidden", padding: "96px clamp(24px, 8vw, 120px)" }}>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 880, margin: "0 auto" }}>
          <span className="eyebrow" style={{ marginBottom: 12, display: "block" }}>Open data</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 12px", lineHeight: 1.1 }}>
            Transparence des données
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 560, margin: "0 0 48px" }}>
            Toutes les données proviennent du <strong>Répertoire National des Associations</strong> (data.gouv.fr),
            enrichies automatiquement par nos scripts. Voici l'état exact en temps réel.
          </p>

          {/* Chiffre phare : nombre TOTAL d'associations recensées (national) —
              ≈ le nombre de descriptifs RNA, + les ajouts manuels via "Référencer". */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", margin: "0 0 44px" }}>
            <span style={{ fontSize: "clamp(40px, 7vw, 64px)", fontWeight: 800, letterSpacing: "-0.04em", color: "var(--accent)", lineHeight: 1 }}>
              {dataStats?.total != null ? dataStats.total.toLocaleString("fr-FR") : "…"}
            </span>
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-2)" }}>associations recensées</span>
          </div>

          {/* Si les stats sont chargées on affiche les cartes, sinon un message
              d'attente. Chaque carte montre un pourcentage et une barre. */}
          {dataStats ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {([
                { key: "geolocalisees",  icon: "pin",      label: "Géolocalisées",           color: "#2b59ff" },
                { key: "avecDescription",icon: "list",     label: "Description (RNA)",        color: "#00d68f" },
                { key: "avecWebsite",    icon: "globe",    label: "Site web officiel",        color: "#7b3ff2" },
                { key: "avecFacebook",   icon: "facebook", label: "Page Facebook",            color: "#1877f2" },
                { key: "avecInstagram",  icon: "insta",    label: "Compte Instagram",         color: "#e1306c" },
                { key: "avecSocial",     icon: "check",    label: "Fiche avec au moins 1 lien", color: "#00d68f" },
                { key: "ficheVide",      icon: "square",   label: "Fiche RNA seule",          color: "#9ca3af" },
              ] as const).map(({ key, icon, label, color }) => {
                const stat = dataStats[key] as { n: number; pct: number } | undefined;
                if (!stat) return null;
                return (
                  <div key={key} style={{
                    background: "var(--bg)", borderRadius: "var(--radius)",
                    border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)",
                    padding: "18px 20px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ display: "inline-flex", color }}><Icon name={icon} size={20} stroke={2.1} /></span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                        textTransform: "uppercase", color,
                        padding: "2px 9px", borderRadius: 20,
                        background: `color-mix(in srgb, ${color} 12%, white)`,
                      }}>
                        {stat.pct}%
                      </span>
                    </div>
                    {/* Barre de progression */}
                    <div style={{ height: 5, background: "var(--bg-sunk)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${stat.pct}%`, borderRadius: 10,
                        background: color, transition: "width 1s ease",
                      }} />
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>
                      {stat.n.toLocaleString("fr-FR")}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginTop: 4 }}>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--muted)", fontWeight: 600 }}>Chargement des statistiques…</div>
          )}

          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 32, fontStyle: "italic" }}>
            Données mises à jour en continu · Source : RNA © Ministère de l'Intérieur · {dataStats?.total?.toLocaleString("fr-FR") ?? "…"} associations indexées
          </p>

          {/* Bouton -> détail par TERRITOIRE (stats par département, groupées par région). */}
          <div style={{ marginTop: 28, textAlign: "center" }}>
            <button className="btn btn-ghost btn-md"
              onClick={() => {
                setShowTerr((v) => !v);
                if (!territories) api.fetchTerritories().then(setTerritories).catch(() => {});
              }}>
              {showTerr ? "Masquer le détail par territoire ▴" : "Voir le détail par territoire ▾"}
            </button>
          </div>

          {showTerr && (
            <div style={{ marginTop: 28 }}>
              {!territories ? (
                <div style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>Chargement…</div>
              ) : (
                Object.entries(
                  COVERED_CODES.reduce<Record<string, string[]>>((acc, code) => {
                    const reg = COVERED[code].region;
                    (acc[reg] ??= []).push(code);
                    return acc;
                  }, {}),
                ).map(([region, codes]) => (
                  <div key={region} style={{ marginBottom: 28 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 4, background: REGION_COLOR[region] ?? "var(--accent)" }} />
                      <h4 style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", margin: 0 }}>{region}</h4>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                      {codes.map((code) => {
                        const meta = COVERED[code];
                        const t = territories.find((x) => x.department === code);
                        const tot = t?.total ?? 0;
                        const p = (n: number) => (tot ? Math.round((n / tot) * 1000) / 10 : 0);
                        return (
                          <div key={code} style={{ background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)", padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{meta.nom}</span>
                              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: STATE_COLOR[meta.state], padding: "2px 7px", borderRadius: 20, background: `color-mix(in srgb, ${STATE_COLOR[meta.state]} 14%, white)`, whiteSpace: "nowrap" }}>{STATE_LABEL[meta.state]}</span>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>{tot.toLocaleString("fr-FR")}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 10 }}>associations</div>
                            <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600, lineHeight: 1.6 }}>
                              {p(t?.geolocalisees ?? 0)}% géolocalisées · {p(t?.avecSocial ?? 0)}% avec un lien
                              <br />FB {p(t?.avecFacebook ?? 0)}% · IG {p(t?.avecInstagram ?? 0)}% · web {p(t?.avecWebsite ?? 0)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Aider : tri collaboratif de la quarantaine ── */}
      <section id="aider" style={{ padding: "88px clamp(24px, 8vw, 120px)", background: "var(--bg)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <span style={{ display: "inline-flex", color: "var(--accent)", marginBottom: 16 }}>
            <Icon name="users" size={34} stroke={2.1} />
          </span>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-0.035em", color: "var(--ink)", margin: "0 0 14px", lineHeight: 1.1 }}>
            Donne un coup de main 🔍
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 28px" }}>
            Nos robots déterrent plein de liens (sites, réseaux, HelloAsso) mais ne sont pas toujours
            <strong> sûrs</strong> qu'ils appartiennent à la bonne association. En quelques clics, tu peux
            vérifier et trancher&nbsp;: <strong>garde</strong> les bons, <strong>jette</strong> les mauvais.
            Chaque tri rend la carte plus juste — et c'est <strong>ouvert à tous</strong>. Merci&nbsp;! 💛
          </p>
          <a href="#quarantaine" className="btn btn-ink btn-md"
            style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <Icon name="check" size={17} stroke={2.4} /> Trier les liens
          </a>
        </div>
      </section>

      {/* ── Soutenir (dons) ── */}
      <section id="dons" style={{ padding: "88px clamp(24px, 8vw, 120px)", background: "var(--bg-soft)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
          <span style={{ display: "inline-flex", color: "var(--accent)", marginBottom: 16 }}>
            <Icon name="heart" size={34} stroke={2.1} />
          </span>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 40px)", fontWeight: 900, letterSpacing: "-0.035em", color: "var(--ink)", margin: "0 0 14px", lineHeight: 1.1 }}>
            Soutenir GemensKarte
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 28px" }}>
            GemensKarte est <strong>gratuit et 100&nbsp;% bénévole</strong> — enfin, presque&nbsp;: nos robots
            fouillent et vérifient le web <strong>24h/24</strong>, et tout ça consomme bien réel… de l'électricité
            (et ça fait chauffer les machines 😅). Tes dons paient le courant, l'hébergement, les noms de domaine
            et le temps de développement — et aident à ouvrir de nouveaux territoires. Chaque coup de pouce compte 💛.
          </p>
          <a href={STRIPE_DON_URL} target="_blank" rel="noopener noreferrer" className="btn btn-accent btn-md"
            style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <Icon name="heart" size={17} stroke={2.3} /> Faire un don
          </a>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "16px 0 0", fontWeight: 600 }}>
            Paiement sécurisé par Stripe · montant libre
          </p>
        </div>
      </section>

      {/* ── Footer minimal ── */}
      <footer style={{
        padding: "28px clamp(24px, 8vw, 120px)",
        borderTop: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
      }}>
        <Logo size={26} />
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Projet bénévole · Vendée · Code ouvert
        </p>
        <button onClick={() => setModal("deferencer")} style={{ fontSize: 13, color: "var(--muted)", background: "none", border: 0, cursor: "pointer", fontFamily: "var(--font)", padding: 0 }}>
          Déférencer une association
        </button>
        {/* Lien discret vers les pages SEO par commune (vraie page serveur) — aide Google
            à les découvrir/crawler en plus du sitemap. */}
        <a href="/territoires" style={{ fontSize: 13, color: "var(--muted)", textDecoration: "none", fontWeight: 600, fontFamily: "var(--font)" }}>
          Associations par commune
        </a>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Données&nbsp;: RNA © Ministère de l'Intérieur · Cartographie&nbsp;: OpenStreetMap
        </p>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Réalisé par{" "}
          <a href="https://flavienauvray.me/" target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700, fontFamily: "var(--font)" }}>
            Flavien Auvray
          </a>
        </p>
      </footer>
    </div>
  );
}
