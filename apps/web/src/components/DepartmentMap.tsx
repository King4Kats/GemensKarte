import { useMemo, useState } from "react";
import { FR_VIEWBOX, FR_DEPT_PATHS } from "../data/fr-departements-paths";
import {
  COVERED, STATE_COLOR, STATE_LABEL, STATE_ORDER, isCovered, colorOf, type DeptMeta,
} from "../data/departements";

/**
 * Carte SVG de la France. Chaque territoire COUVERT est coloré selon son ÉTAT de
 * scrap (rose = en cours, bleu = non scrapé, vert = effectué) et est cliquable.
 * Le reste de la France est laissé en blanc. Sert de sélecteur de territoire.
 */
export function DepartmentMap({ onSelect }: { onSelect: (dept: DeptMeta) => void }) {
  const [hover, setHover] = useState<string | null>(null); // code du département survolé
  const codes = useMemo(() => Object.keys(FR_DEPT_PATHS), []); // tous les codes dessinés

  // Le département survolé est rendu en dernier -> au-dessus des voisins (z-order SVG).
  const ordered = useMemo(() => {
    if (!hover) return codes;
    return [...codes.filter((c) => c !== hover), hover];
  }, [codes, hover]);

  const hovered = hover ? COVERED[hover] : null;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Bandeau d'info (suit le survol) */}
      <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
        {hovered ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: STATE_COLOR[hovered.state] }} />
            {hovered.nom}
            <span style={{ fontWeight: 600, color: "var(--muted)" }}>· {STATE_LABEL[hovered.state]}</span>
            <span style={{ color: "var(--accent)", fontWeight: 800 }}>Entrer →</span>
          </span>
        ) : (
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--muted)" }}>
            Un territoire coloré s'ouvre au clic
          </span>
        )}
      </div>

      {/* La carte */}
      <svg viewBox={FR_VIEWBOX} role="img" aria-label="Carte des départements français"
        style={{ width: "100%", maxWidth: 520, height: "auto", maxHeight: "56vh", overflow: "visible" }}>
        {ordered.map((code) => {
          const live = isCovered(code);
          const meta = COVERED[code];
          const isH = hover === code;
          const color = live ? colorOf(code)! : null;
          return (
            <path
              key={code}
              d={FR_DEPT_PATHS[code]}
              onMouseEnter={live ? () => setHover(code) : undefined}
              onMouseLeave={live ? () => setHover(null) : undefined}
              onClick={live ? () => onSelect(meta) : undefined}
              style={{
                fill: live ? (isH ? color! : `color-mix(in srgb, ${color} 30%, white)`) : "#fafaf8",
                stroke: live ? "#ffffff" : "#c2c2bb",
                strokeWidth: live ? 1.6 : 1.2,
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

      {/* Légende : code couleur des états de scrap */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 16 }}>
        {STATE_ORDER.map((s) => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: STATE_COLOR[s] }} />
            {STATE_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
