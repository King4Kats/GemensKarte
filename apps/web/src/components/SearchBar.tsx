/**
 * SearchBar — la barre de recherche d'associations / villes.
 *
 * Champ de saisie + bouton, avec une liste d'autocomplétion (suggestions)
 * qui s'ouvre sous le champ pendant qu'on tape. On peut tout faire au clavier :
 * flèches haut/bas pour surligner une suggestion, Entrée pour valider,
 * Échap pour fermer la liste.
 *
 * Ce composant ne décide rien tout seul : c'est le parent qui lui fournit la
 * valeur et les suggestions (via les "props"), et qui réagit aux événements
 * (onChange, onSubmit, onPick). On parle de composant "contrôlé".
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Suggestion } from "../lib/api";
import { catById } from "../lib/categories";
import { Icon } from "./Icon";

/** Suggestion de VILLE : cliquer dessus zoome la carte sur cette commune. */
export interface CitySuggestion { name: string; count: number; }

interface Props {
  size?: "lg" | "sm";
  autoFocus?: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  suggestions?: Suggestion[];
  onPick: (s: Suggestion) => void;
  cities?: CitySuggestion[];          // villes proposées (zoom carte au clic)
  onPickCity?: (name: string) => void;
}

export function SearchBar({ size = "lg", autoFocus = false, value, onChange, onSubmit, suggestions = [], onPick, cities = [], onPickCity }: Props) {
  const [open, setOpen] = useState(false); // la liste de suggestions est-elle ouverte ?
  const [hi, setHi] = useState(-1);        // index de la suggestion surlignée (-1 = aucune)
  const wrapRef = useRef<HTMLDivElement>(null); // référence vers la boîte, pour détecter les clics extérieurs

  // Ferme la liste de suggestions quand on clique ailleurs sur la page.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // On n'affiche les suggestions que si la liste est ouverte, qu'on a tapé
  // quelque chose, et qu'il y a au moins une suggestion à montrer.
  const showSug = open && !!value && (suggestions.length > 0 || cities.length > 0);
  const big = size === "lg"; // "lg" = grande barre (accueil), "sm" = compacte (en-tête)

  // Navigation au clavier dans le champ de recherche.
  const onKey = (e: KeyboardEvent) => {
    if (!showSug) { if (e.key === "Enter") onSubmit?.(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (hi >= 0 && suggestions[hi]) onPick(suggestions[hi]);
      else onSubmit?.();
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: big ? 14 : 10,
          background: "var(--bg)",
          height: big ? 68 : 50,
          padding: big ? "0 8px 0 22px" : "0 6px 0 16px",
          borderRadius: "var(--radius-pill)",
          boxShadow: open
            ? "0 0 0 2px var(--accent), 0 18px 50px rgba(20,20,27,.14)"
            : "0 0 0 1.5px var(--hairline), 0 10px 34px rgba(20,20,27,.07)",
          transition: "box-shadow .2s",
        }}
      >
        <span style={{ color: open ? "var(--accent)" : "var(--muted)", display: "flex", transition: "color .2s" }}>
          <Icon name="search" size={big ? 24 : 19} stroke={2.4} />
        </span>
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={big ? "Rechercher une association, une ville…" : "Rechercher une asso, une ville…"}
          style={{
            flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent",
            fontFamily: "var(--font)", fontWeight: 600,
            fontSize: big ? 19 : 15, color: "var(--ink)", letterSpacing: "-0.01em",
          }}
        />
        <button className={big ? "btn btn-accent btn-md" : "btn btn-accent btn-sm"} style={{ flexShrink: 0 }} onClick={() => onSubmit?.()}>
          {big ? "Explorer" : "Go"}
          {big && <Icon name="arrow" size={16} stroke={2.6} />}
        </button>
      </div>

      {/* Liste déroulante des suggestions, positionnée juste sous la barre. */}
      {showSug && (
        <div
          className="cm-scroll"
          style={{
            position: "absolute", top: "calc(100% + 10px)", left: 0, right: 0, zIndex: 1000,
            background: "var(--bg)", borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-pop)", border: "1px solid var(--hairline)",
            padding: 8, maxHeight: 340, overflowY: "auto",
          }}
        >
          {/* Villes d'abord : cliquer dessus zoome la carte sur la commune. */}
          {cities.map((ct) => (
            <button
              key={`city-${ct.name}`}
              onClick={() => { onPickCity?.(ct.name); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                textAlign: "left", border: 0, cursor: "pointer", background: "transparent",
                borderRadius: 12, padding: "10px 12px", transition: "background .12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-sunk)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: "var(--bg-sunk)", color: "var(--accent)", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, color: "var(--ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ct.name}
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                  Ville · {ct.count} association{ct.count > 1 ? "s" : ""}
                </span>
              </span>
              <span style={{ color: "var(--muted)", display: "flex" }}>
                <Icon name="arrowUpRight" size={16} stroke={2.2} />
              </span>
            </button>
          ))}
          {suggestions.map((s, i) => {
            const c = catById(s.categoryId); // catégorie de l'asso : sert à colorer la pastille et afficher le libellé
            return (
              <button
                key={s.id}
                onMouseEnter={() => setHi(i)}
                onClick={() => onPick(s)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  textAlign: "left", border: 0, cursor: "pointer",
                  background: hi === i ? "var(--bg-sunk)" : "transparent",
                  borderRadius: 12, padding: "10px 12px", transition: "background .12s",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: c.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${c.color} 18%, transparent)`,
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, color: "var(--ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </span>
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                    {c.label}{s.city ? ` · ${s.city}` : ""}
                  </span>
                </span>
                <span style={{ color: "var(--muted)", display: "flex" }}>
                  <Icon name="arrowUpRight" size={16} stroke={2.2} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
