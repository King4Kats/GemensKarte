/**
 * AdminReview — outil d'administration pour vérifier/corriger rapidement la catégorie
 * de chaque association, une par une. On voit la fiche, on choisit la bonne catégorie,
 * et on passe à la suivante. Pensé pour aller vite au clavier (flèches, Entrée, touches 1-9).
 * Ce n'est PAS visible par le grand public.
 */
import { useCallback, useEffect, useState } from "react";
import { api, type Association } from "../lib/api";
import { CATEGORIES, catById } from "../lib/categories";
import { Icon } from "./Icon";

// Liste des filtres en haut : "Toutes" + toutes les catégories réelles.
const ALL_CATS = [{ id: "", label: "Toutes", color: "var(--ink-2)" }, ...CATEGORIES];

export function AdminReview({ onClose }: { onClose: () => void }) {
  // --- État du composant (mémoire qui déclenche un ré-affichage quand elle change) ---
  const [filterCat, setFilterCat] = useState("social"); // catégorie filtrée actuellement
  const [items, setItems] = useState<Association[]>([]); // les assos chargées
  const [cursor, setCursor] = useState(0); // index de l'asso affichée
  const [total, setTotal] = useState(0); // nombre total d'assos pour ce filtre
  const [page, setPage] = useState(1); // page de résultats déjà demandée à l'API
  const [saving, setSaving] = useState(false); // true pendant l'enregistrement
  const [saved, setSaved] = useState<Record<string, string>>({}); // assos modifiées : id -> nouvelle catégorie

  const asso = items[cursor] ?? null; // l'asso en cours de revue (ou null)

  // Charge une page d'assos depuis l'API. Page 1 = on remplace, sinon on ajoute à la suite.
  // useCallback : garde la même fonction entre les rendus (évite des rechargements inutiles).
  const load = useCallback((cat: string, pg: number) => {
    api
      .list({ category: cat || undefined, limit: 50, page: pg })
      .then((r) => {
        setItems((prev) => (pg === 1 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
      })
      .catch(() => {});
  }, []);

  // Quand on change de filtre : on repart de zéro et on recharge la 1ère page.
  // (useEffect = code qui se relance quand une de ses dépendances change.)
  useEffect(() => {
    setCursor(0);
    setItems([]);
    setPage(1);
    load(filterCat, 1);
  }, [filterCat, load]);

  // Chargement "à l'avance" : dès qu'on approche de la fin de la liste chargée
  // (moins de 8 assos restantes) et qu'il en reste à récupérer, on demande la page suivante.
  useEffect(() => {
    if (items.length > 0 && cursor >= items.length - 8 && items.length < total) {
      const nextPage = page + 1;
      setPage(nextPage);
      load(filterCat, nextPage);
    }
  }, [cursor, items.length, total, filterCat, page, load]);

  // Valide une catégorie pour l'asso courante puis passe à la suivante.
  // Si la catégorie choisie est différente de l'actuelle, on l'enregistre via l'API.
  const pick = useCallback(
    async (newCatId: string) => {
      if (!asso || saving) return; // rien à faire si pas d'asso ou enregistrement en cours
      if (newCatId !== asso.categoryId) {
        setSaving(true);
        try {
          await api.patchCategory(asso.id, newCatId);
          setSaved((s) => ({ ...s, [asso.id]: newCatId }));
        } catch {
          /* ignore */
        } finally {
          setSaving(false);
        }
      }
      setCursor((c) => c + 1);
    },
    [asso, saving],
  );

  // Raccourcis clavier pour aller vite :
  // → ou Entrée = garder & suivant, ← = précédent, Échap = fermer,
  // chiffres 1-9 = choisir directement la catégorie correspondante.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // On ignore les raccourcis si l'utilisateur est en train de taper dans un champ.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        void pick(asso?.categoryId ?? "social");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Escape") {
        onClose();
      } else {
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < CATEGORIES.length) {
          e.preventDefault();
          void pick(CATEGORIES[idx].id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [asso, pick, onClose]);

  // Catégorie à afficher : la version déjà modifiée si elle existe, sinon celle d'origine.
  const currentCatId = asso ? (saved[asso.id] ?? asso.categoryId) : null;
  const currentCat = currentCatId ? catById(currentCatId) : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,10,20,.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(860px, 96vw)", maxHeight: "92vh",
        background: "var(--bg)", borderRadius: 20,
        boxShadow: "0 40px 120px rgba(0,0,0,.35)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 24px", borderBottom: "1px solid var(--hairline)", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.03em", flex: 1 }}>
            Revue des catégories
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
            {cursor + 1} / {total} · {Object.keys(saved).length} modifiées
          </span>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", display: "flex", padding: 4 }}>
            <Icon name="close" size={20} stroke={2} />
          </button>
        </div>

        {/* Filtre */}
        <div style={{ display: "flex", gap: 8, padding: "12px 24px", borderBottom: "1px solid var(--hairline)", overflowX: "auto", flexShrink: 0 }}>
          {ALL_CATS.map((c) => {
            const on = filterCat === c.id;
            const col = c.id ? catById(c.id).color : "var(--ink-2)";
            return (
              <button
                key={c.id}
                onClick={() => setFilterCat(c.id)}
                style={{
                  flexShrink: 0, height: 30, padding: "0 12px", borderRadius: 20,
                  border: on ? `2px solid ${col}` : "1.5px solid var(--hairline)",
                  background: on ? `color-mix(in srgb, ${col} 12%, white)` : "transparent",
                  color: on ? col : "var(--ink-2)",
                  fontFamily: "var(--font)", fontWeight: 700, fontSize: 12.5, cursor: "pointer",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Corps */}
        {!asso ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 15, fontWeight: 600, padding: 40 }}>
            {items.length === 0 ? "Chargement…" : "✓ Toutes les assos de ce filtre ont été passées en revue !"}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 24px" }}>
            {/* Catégorie actuelle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 14px", borderRadius: 20,
                background: currentCat ? `color-mix(in srgb, ${currentCat.color} 14%, white)` : "var(--bg-soft)",
                color: currentCat?.color, fontWeight: 800, fontSize: 13,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: currentCat?.color ?? "var(--muted)" }} />
                {currentCat?.label ?? "—"}
              </span>
              {saved[asso.id] && (
                <span style={{ fontSize: 12, color: "#00d68f", fontWeight: 700 }}>✓ sauvegardé</span>
              )}
            </div>

            {/* Nom */}
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.2 }}>
              {asso.name}
            </h2>
            {asso.city && (
              <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--muted)", fontWeight: 600 }}>
                {asso.city}{asso.department ? ` · ${asso.department}` : ""}
              </p>
            )}

            {/* Description */}
            <div style={{
              padding: "16px 20px", borderRadius: 12, background: "var(--bg-soft)",
              fontSize: 14.5, lineHeight: 1.65, color: "var(--ink-2)", marginBottom: 28,
              maxHeight: 180, overflowY: "auto",
            }}>
              {asso.description
                ? asso.description
                : <em style={{ color: "var(--muted)" }}>Pas de description</em>}
            </div>

            {/* Boutons catégorie */}
            <p style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Choisir la bonne catégorie — ou touche 1–{CATEGORIES.length}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>
              {CATEGORIES.map((cat, i) => {
                const isActive = (saved[asso.id] ?? asso.categoryId) === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => void pick(cat.id)}
                    disabled={saving}
                    style={{
                      height: 40, padding: "0 18px", borderRadius: 20,
                      border: isActive ? `2.5px solid ${cat.color}` : "1.5px solid var(--hairline)",
                      background: isActive ? `color-mix(in srgb, ${cat.color} 16%, white)` : "var(--bg)",
                      color: isActive ? cat.color : "var(--ink-2)",
                      fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5,
                      cursor: "pointer", opacity: saving ? 0.5 : 1, transition: "all .12s",
                    }}
                  >
                    {cat.emoji} {i + 1}. {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Navigation */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={() => setCursor((c) => Math.max(0, c - 1))}
                style={{ height: 38, padding: "0 16px", borderRadius: 20, border: "1.5px solid var(--hairline)", background: "var(--bg)", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13.5, cursor: "pointer", color: "var(--ink-2)" }}
              >
                ← Précédent
              </button>
              <button
                onClick={() => void pick(asso.categoryId)}
                disabled={saving}
                style={{ height: 38, padding: "0 20px", borderRadius: 20, border: "none", background: "var(--ink)", color: "white", fontFamily: "var(--font)", fontWeight: 800, fontSize: 13.5, cursor: "pointer", opacity: saving ? 0.5 : 1 }}
              >
                Garder & Suivant →
              </button>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>ou Entrée · ← → pour naviguer</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
