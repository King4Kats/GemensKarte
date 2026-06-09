import { useEffect, useRef, useState } from "react";
import { api, type Suggestion } from "../lib/api";
import { CATEGORIES, catById } from "../lib/categories";
import { Logo } from "../components/Logo";
import { SearchBar } from "../components/SearchBar";
import { ConfettiField } from "../components/ConfettiField";
import { ContactModal } from "../components/ContactModal";

export interface ExploreOpts {
  q?: string;
  cat?: string;
  open?: string;
}

// ── Compteur animé ─────────────────────────────────────────────────────────
function useCountUp(target: number | null, duration = 1800) {
  const [count, setCount] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (target === null || startedRef.current) return;
    startedRef.current = true;
    const startTime = performance.now();
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

// ── Landing ─────────────────────────────────────────────────────────────────
export function Landing({ onExplore }: { onExplore: (o: ExploreOpts) => void }) {
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"recenser" | "deferencer" | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [dataStats, setDataStats] = useState<Record<string, { n: number; pct: number }> & { total?: number } | null>(null);
  const animCount = useCountUp(total);

  useEffect(() => {
    api.list({ limit: 1 }).then((r) => setTotal(r.total)).catch(() => setTotal(null));
    (api.fetchStats as () => Promise<any>)().then(setDataStats).catch(() => {});
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (!t) { setSuggestions([]); return; }
    const id = setTimeout(() => {
      api.suggest(t, 6).then(setSuggestions).catch(() => setSuggestions([]));
    }, 160);
    return () => clearTimeout(id);
  }, [q]);


  const stats = [
    { n: total !== null ? animCount.toLocaleString("fr-FR") : "…", l: "associations" },
    { n: "3", l: "régions" },
    { n: "7", l: "univers" },
    { n: "100%", l: "open-source" },
  ];


  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "22px clamp(20px, 5vw, 64px)", position: "relative", zIndex: 5,
        opacity: 0, animation: "cmFadeDown .5s ease .05s forwards",
      }}>
        <Logo size={22} />
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-sm" style={navLink} onClick={() => onExplore({})}>Explorer la carte</button>
          <button className="btn btn-sm" style={navLink} onClick={() => setModal("recenser")}>Référencer mon asso</button>
          <a className="btn btn-sm" style={navLink} href="#stats">Les données</a>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{
        position: "relative", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "20px clamp(20px, 5vw, 64px) 0", overflow: "hidden",
        minHeight: "calc(100vh - 80px)",
      }}>
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
              {(["#ff2d78", "#00d68f", "#2b59ff"] as const).map((c, i) => (
                <i key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c, animation: `cmPulse 2.4s ease ${i * 0.4}s infinite` }} />
              ))}
            </span>
            Bretagne · Pays de la Loire · Normandie
          </span>

          {/* H1 */}
          <h1 className="display" style={{
            fontSize: "clamp(44px, 7.4vw, 92px)", margin: "0 0 24px", color: "var(--ink)",
            opacity: 0, animation: "cmSlideUp .6s cubic-bezier(.22,1,.36,1) .18s forwards",
          }}>
            Le territoire<br />
            de <span style={{ position: "relative", color: "var(--accent)", whiteSpace: "nowrap" }}>
              tes assos
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
            Répertorie, découvre et rejoins les associations qui font vivre ta région.
            Une carte, mille élans citoyens.
          </p>

          {/* SearchBar */}
          <div style={{ width: "100%", maxWidth: 640, position: "relative", zIndex: 50, opacity: 0, animation: "cmSlideUp .6s cubic-bezier(.22,1,.36,1) .38s forwards" }}>
            <SearchBar size="lg" value={q} onChange={setQ} suggestions={suggestions}
              onSubmit={() => onExplore({ q })} onPick={(s) => onExplore({ open: s.id })} />
          </div>


          {/* Chips catégories */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 28 }}>
            {CATEGORIES.map((c, i) => (
              <CatChip key={c.id} cat={c.id} onClick={(cat) => onExplore({ cat })} delay={0.6 + i * 0.06} />
            ))}
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
            Fait avec ❤️ en Vendée,<br />pour toute la région
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
          <button className="btn btn-accent btn-md" onClick={() => onExplore({})}>
            Explorer la carte →
          </button>
        </div>

        {/* Pillules illustratives */}
        <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { emoji: "📍", label: "18 554 associations référencées" },
            { emoji: "🗺️", label: "Bretagne, Pays de la Loire, Normandie" },
            { emoji: "🔍", label: "Recherche par type, ville, distance" },
            { emoji: "🤝", label: "Entièrement bénévole & open-source" },
          ].map((it) => (
            <div key={it.label} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 18px", borderRadius: "var(--radius)",
              background: "var(--bg)", border: "1px solid var(--hairline)",
              boxShadow: "var(--shadow-card)",
            }}>
              <span style={{ fontSize: 22 }}>{it.emoji}</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{it.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section Qualité des données / Comment on scrape ── */}
      <section style={{ padding: "96px clamp(24px, 8vw, 120px)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>

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
            src="/pipeline.png"
            alt="Le pipeline en 3 étapes : on cherche les liens sur le web, une IA les vérifie, puis on affiche une fiche notée."
            loading="lazy"
            style={{ display: "block", width: "100%", maxWidth: 900, margin: "0 auto 44px", borderRadius: "var(--radius-lg, 22px)" }}
          />

          {/* Les 3 étapes du pipeline */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {([
              { c: "#3B6BFF", n: "1", emoji: "🔍", t: "On cherche", d: "Pour chaque association, on interroge le web (moteur de recherche) pour trouver ses liens : site, Facebook, Instagram, HelloAsso." },
              { c: "#EC2D8A", n: "2", emoji: "🧠", t: "On vérifie (IA)", d: "Une IA lit la page (ou son extrait) et tranche : ce lien appartient-il vraiment à CETTE association ? Elle attribue un niveau de confiance." },
              { c: "#19C37D", n: "3", emoji: "✅", t: "On affiche", d: "Seuls les liens confirmés sont publiés. Les liens douteux partent en revue, les liens faux sont écartés." },
            ] as const).map((s) => (
              <div key={s.n} style={{
                position: "relative", borderRadius: "var(--radius)", background: "var(--bg)",
                border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)", padding: "22px 20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 11, background: `color-mix(in srgb, ${s.c} 14%, white)`, fontSize: 18 }}>{s.emoji}</span>
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
            <span style={{ fontSize: 20 }}>🛡️</span>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>
              <strong>Règle d'or :</strong> on privilégie la justesse à l'exhaustivité. Si on n'est pas sûr,
              on n'affiche rien — plutôt que de te montrer le mauvais Facebook ou un site qui n'existe plus.
            </span>
          </div>

          {/* Ce qu'on enrichit */}
          <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", margin: "56px 0 18px", textAlign: "center" }}>
            Ce qu'on enrichit &amp; nettoie pour toi
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
            {([
              ["🌐", "Site web officiel"], ["📘", "Réseaux sociaux"], ["💛", "HelloAsso (dons)"],
              ["📰", "Articles de presse"], ["📅", "Agenda à venir"], ["💀", "Liens morts retirés"],
            ] as const).map(([e, l]) => (
              <span key={l} style={{
                display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px",
                borderRadius: "var(--radius-pill)", background: "var(--bg)", border: "1.5px solid var(--hairline)",
                fontSize: 14, fontWeight: 700, color: "var(--ink)",
              }}>
                <span style={{ fontSize: 16 }}>{e}</span>{l}
              </span>
            ))}
          </div>

          {/* Le score de qualité */}
          <div style={{ marginTop: 64, borderRadius: "var(--radius-lg, 22px)", background: "var(--bg-soft)", padding: "clamp(28px, 4vw, 44px)" }}>
            <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 28px" }}>
              <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 10px" }}>
                Une note de qualité par fiche
              </h3>
              <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "var(--ink-2)", margin: 0 }}>
                Chaque fiche reçoit une note&nbsp;/100 et un niveau, selon la <strong>richesse de ses liens</strong>,
                leur <strong>disponibilité</strong> (liens vivants), la <strong>fraîcheur</strong> des infos et la
                présence d'un <strong>agenda</strong>. Tu la vois en haut de chaque fiche.
              </p>
            </div>
            {/* Les 4 niveaux */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>
              {([
                { tier: "A", c: "#00b87a", l: "Excellente", d: "liens vérifiés, vivants, à jour" },
                { tier: "B", c: "#2b7fff", l: "Bonne", d: "bien fournie, quelques manques" },
                { tier: "C", c: "#f5a623", l: "Correcte", d: "des infos, à compléter" },
                { tier: "D", c: "#9ca3af", l: "À enrichir", d: "fiche encore pauvre" },
              ] as const).map((t) => (
                <div key={t.tier} style={{ background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--hairline)", padding: "16px 16px 14px", textAlign: "center" }}>
                  <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "50%", background: t.c, color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 auto 8px" }}>{t.tier}</span>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{t.l}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", marginTop: 2, lineHeight: 1.4 }}>{t.d}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: 0, fontStyle: "italic" }}>
              La note grimpe toute seule au fil de l'enrichissement automatique, et sert aussi à repérer les fiches à retravailler en priorité.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section Espace Ressources ── */}
      <section style={{ padding: "96px clamp(24px, 8vw, 120px)" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>

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
                desc: "Publiez gratuitement vos événements et actualités associatives auprès des lecteurs vendéens.",
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

      {modal && <ContactModal mode={modal} onClose={() => setModal(null)} />}

      {/* ── Section Données ouvertes ── */}
      <section id="stats" style={{ padding: "96px clamp(24px, 8vw, 120px)", background: "var(--bg-soft)" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <span className="eyebrow" style={{ marginBottom: 12, display: "block" }}>Open data</span>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", margin: "0 0 12px", lineHeight: 1.1 }}>
            Transparence des données
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)", maxWidth: 560, margin: "0 0 48px" }}>
            Toutes les données proviennent du <strong>Répertoire National des Associations</strong> (data.gouv.fr),
            enrichies automatiquement par nos scripts. Voici l'état exact en temps réel.
          </p>

          {dataStats ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {([
                { key: "geolocalisees",  emoji: "📍", label: "Géolocalisées",           color: "#2b59ff" },
                { key: "avecDescription",emoji: "📝", label: "Description (RNA)",        color: "#00d68f" },
                { key: "avecWebsite",    emoji: "🌐", label: "Site web officiel",        color: "#7b3ff2" },
                { key: "avecFacebook",   emoji: "📘", label: "Page Facebook",            color: "#1877f2" },
                { key: "avecInstagram",  emoji: "📸", label: "Compte Instagram",         color: "#e1306c" },
                { key: "avecPresse",     emoji: "📰", label: "Articles de presse",       color: "#e2001a" },
                { key: "avecSocial",     emoji: "✅", label: "Fiche avec au moins 1 lien", color: "#00d68f" },
                { key: "ficheVide",      emoji: "⬜", label: "Fiche RNA seule",          color: "#9ca3af" },
              ] as const).map(({ key, emoji, label, color }) => {
                const stat = dataStats[key] as { n: number; pct: number } | undefined;
                if (!stat) return null;
                return (
                  <div key={key} style={{
                    background: "var(--bg)", borderRadius: "var(--radius)",
                    border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)",
                    padding: "18px 20px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 22 }}>{emoji}</span>
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
        </div>
      </section>

      {/* ── Footer minimal ── */}
      <footer style={{
        padding: "28px clamp(24px, 8vw, 120px)",
        borderTop: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
      }}>
        <Logo size={18} />
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Projet bénévole · Vendée · Open-source
        </p>
        <button onClick={() => setModal("deferencer")} style={{ fontSize: 13, color: "var(--muted)", background: "none", border: 0, cursor: "pointer", fontFamily: "var(--font)", padding: 0 }}>
          Déférencer une association
        </button>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Données&nbsp;: RNA © Ministère de l'Intérieur · Cartographie&nbsp;: OpenStreetMap
        </p>
      </footer>
    </div>
  );
}
