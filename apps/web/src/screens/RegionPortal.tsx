import { useMemo, useState } from "react";
import { FR_VIEWBOX, FR_DEPT_PATHS } from "../data/fr-departements-paths";
import { COVERED, REGION_COLOR, READY_CODES, isReady, type DeptMeta } from "../data/departements";
import { ConfettiField } from "../components/ConfettiField";

/**
 * Portail d'entrée : carte SVG de la France (open data Wikimedia). Seuls les
 * territoires EN LIGNE (READY_CODES — aujourd'hui la Vendée) sont colorés, grossissent
 * au survol et sont cliquables -> on entre dans leur GemensKarte. Tout le reste reste
 * BLANC tant qu'on n'a pas ses données (« on colore quand on a les données »).
 */
export function RegionPortal({ onSelect }: { onSelect: (dept: DeptMeta) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const codes = useMemo(() => Object.keys(FR_DEPT_PATHS), []);

  // Le département survolé est rendu en dernier -> au-dessus des voisins (z-order SVG).
  const ordered = useMemo(() => {
    if (!hover) return codes;
    return [...codes.filter((c) => c !== hover), hover];
  }, [codes, hover]);

  const hovered = hover ? COVERED[hover] : null;
  const ready = READY_CODES.map((c) => COVERED[c]).filter(Boolean);

  return (
    <div style={{ position: "relative", minHeight: "100dvh", display: "flex",
      flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
      <ConfettiField count={18} seed={7} />

      {/* En-tête */}
      <header style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center",
        gap: 12, padding: "22px clamp(20px, 5vw, 56px)" }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em" }}>
          Gemens<span style={{ color: "var(--accent)" }}>Karte</span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
          {ready.length} territoire{ready.length > 1 ? "s" : ""} en ligne
        </span>
      </header>

      {/* Corps */}
      <main style={{ position: "relative", zIndex: 1, flex: 1, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "0 clamp(16px, 5vw, 56px) 40px", textAlign: "center" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(28px, 5vw, 46px)", fontWeight: 900,
          letterSpacing: "-0.045em", lineHeight: 1.05 }}>
          Choisis ton territoire
        </h1>
        <p style={{ margin: "0 0 6px", fontSize: "clamp(14px, 2.4vw, 17px)", color: "var(--ink-2)",
          maxWidth: 560 }}>
          Un GemensKarte par département. On commence par la Vendée — chaque territoire
          se colore dès qu'il a ses données.
        </p>

        {/* Bandeau d'info (suit le survol) */}
        <div style={{ height: 34, display: "flex", alignItems: "center", justifyContent: "center",
          margin: "6px 0 4px" }}>
          {hovered ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10,
              fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3,
                background: REGION_COLOR[hovered.region] }} />
              {hovered.nom}
              <span style={{ fontWeight: 600, color: "var(--muted)" }}>· {hovered.region}</span>
              <span style={{ color: "var(--accent)", fontWeight: 800 }}>Entrer →</span>
            </span>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--muted)" }}>
              Survole un territoire coloré pour l'ouvrir
            </span>
          )}
        </div>

        {/* La carte */}
        <svg viewBox={FR_VIEWBOX} role="img" aria-label="Carte des départements français"
          style={{ width: "100%", maxWidth: 560, height: "auto", maxHeight: "58vh",
            overflow: "visible" }}>
          {ordered.map((code) => {
            const live = isReady(code);
            const meta = COVERED[code];
            const isH = hover === code;
            const color = live ? REGION_COLOR[meta.region] : null;
            return (
              <path
                key={code}
                d={FR_DEPT_PATHS[code]}
                onMouseEnter={live ? () => setHover(code) : undefined}
                onMouseLeave={live ? () => setHover(null) : undefined}
                onClick={live ? () => onSelect(meta) : undefined}
                style={{
                  fill: live
                    ? (isH ? color! : `color-mix(in srgb, ${color} 26%, white)`)
                    : "#ffffff",
                  stroke: live ? "#ffffff" : "#e6e6e1",
                  strokeWidth: live ? 1.3 : 0.7,
                  cursor: live ? "pointer" : "default",
                  transformBox: "fill-box",
                  transformOrigin: "center",
                  transform: isH ? "scale(1.08)" : "scale(1)",
                  filter: isH ? "drop-shadow(0 8px 16px rgba(20,20,27,.30))" : "none",
                  transition: "transform .18s cubic-bezier(.2,.8,.2,1), fill .16s, filter .16s",
                  outline: "none",
                }}
              />
            );
          })}
        </svg>

        {/* Territoires disponibles */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10,
          marginTop: 18 }}>
          {ready.map((d) => (
            <button key={d.code} onClick={() => onSelect(d)}
              onMouseEnter={() => setHover(d.code)} onMouseLeave={() => setHover(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7,
              height: 32, padding: "0 14px", borderRadius: "var(--radius-pill)",
              background: "var(--bg-soft)", border: "1.5px solid var(--hairline)",
              fontSize: 13, fontWeight: 800, color: "var(--ink)", cursor: "pointer",
              fontFamily: "var(--font)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: REGION_COLOR[d.region] }} />
              {d.nom} <span style={{ color: "var(--accent)" }}>→</span>
            </button>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 12px",
            fontSize: 12.5, fontWeight: 600, color: "var(--muted)" }}>
            d'autres départements bientôt
          </span>
        </div>
      </main>
    </div>
  );
}
