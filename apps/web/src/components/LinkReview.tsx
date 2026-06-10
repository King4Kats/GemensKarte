/**
 * LinkReview — écran de modération des liens "en quarantaine".
 *
 * Quand le système détecte un lien réseau social pour une association mais
 * n'est pas sûr de lui (faux positif possible), il met ce lien "en quarantaine"
 * au lieu de l'appliquer tout de suite. Ce composant affiche ces liens douteux
 * un par un (comme un jeu de cartes) pour qu'un humain tranche au clavier :
 * Garder (le lien devient officiel) ou Jeter.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type QuarantineAssoc } from "../lib/api";
import { Icon } from "./Icon";

// Un "QItem" = une carte à arbitrer = un seul lien douteux d'une association.
type QItem = {
  asso: QuarantineAssoc;
  platform: string;
  url: string;
  score: number;
  reason: string;
};

// Noms d'affichage propres pour chaque plateforme (la clé technique "facebook"
// devient l'étiquette lisible "Facebook").
const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn",
  twitter: "Twitter/X", tiktok: "TikTok", youtube: "YouTube",
  helloasso: "HelloAsso", website: "Site web",
};

/** Revue manuelle des liens en quarantaine : Garder (→ social) ou Jeter, au clavier. */
export function LinkReview({ onClose }: { onClose: () => void }) {
  const [assos, setAssos] = useState<QuarantineAssoc[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState<Record<string, "keep" | "drop">>({});
  const [busy, setBusy] = useState(false);

  // Va chercher une page de 50 associations en quarantaine auprès de l'API.
  // Page 1 = on remplace la liste ; pages suivantes = on ajoute à la suite.
  const load = useCallback((pg: number) => {
    api.listQuarantine(pg, 50)
      .then((r) => {
        setAssos((prev) => (pg === 1 ? r.items : [...prev, ...r.items]));
        setTotal(r.total);
      })
      .catch(() => {});
  }, []);

  // Au premier affichage, on charge la première page.
  useEffect(() => { load(1); }, [load]);

  // Une association peut avoir plusieurs liens douteux. Ici on "aplatit" :
  // on transforme la liste d'associations en une file d'items (un par lien),
  // qu'on présentera ensuite carte après carte.
  const queue = useMemo<QItem[]>(() => {
    const out: QItem[] = [];
    for (const asso of assos) {
      for (const [platform, v] of Object.entries(asso.quarantine ?? {})) {
        out.push({ asso, platform, url: v.url, score: v.score, reason: v.reason });
      }
    }
    return out;
  }, [assos]);

  // La carte actuellement affichée ("cursor" = position dans la file).
  const item = queue[cursor] ?? null;

  // Précharge la page suivante quand on approche de la fin.
  useEffect(() => {
    if (assos.length > 0 && cursor >= queue.length - 4 && assos.length < total) {
      const next = page + 1;
      setPage(next);
      load(next);
    }
  }, [cursor, queue.length, assos.length, total, page, load]);

  // Traite la carte courante : prévient l'API du choix de l'humain
  // (garder ou jeter), puis passe à la carte suivante. "busy" empêche
  // un double-clic pendant que la requête est en cours.
  const resolve = useCallback(
    async (action: "keep" | "drop") => {
      if (!item || busy) return;
      const key = `${item.asso.id}:${item.platform}`;
      setBusy(true);
      try {
        await api.resolveQuarantine(item.asso.id, item.platform, action);
        setDone((d) => ({ ...d, [key]: action }));
      } catch { /* ignore */ } finally { setBusy(false); }
      setCursor((c) => c + 1);
    },
    [item, busy],
  );

  // Raccourcis clavier pour modérer vite sans la souris :
  // → / Entrée / K = Garder, ← / D = Jeter, Échap = fermer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key.toLowerCase() === "k") {
        e.preventDefault(); void resolve("keep");
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "d") {
        e.preventDefault(); void resolve("drop");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resolve, onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,20,.72)",
        backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "min(720px, 96vw)", maxHeight: "92vh", background: "var(--bg)",
        borderRadius: 20, boxShadow: "0 40px 120px rgba(0,0,0,.35)", display: "flex",
        flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 24px",
          borderBottom: "1px solid var(--hairline)", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.03em", flex: 1 }}>
            Revue des liens en quarantaine
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>
            {Math.min(cursor + 1, queue.length)} / {queue.length}
            {assos.length < total ? "+" : ""} · {Object.keys(done).length} traités
          </span>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer",
            color: "var(--muted)", display: "flex", padding: 4 }}>
            <Icon name="close" size={20} stroke={2} />
          </button>
        </div>

        {!item ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--muted)", fontSize: 15, fontWeight: 600, padding: 40 }}>
            {assos.length === 0 ? "Chargement…" : "✓ Plus aucun lien en quarantaine !"}
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "26px 32px 24px" }}>
            {/* Asso */}
            <h2 style={{ margin: "0 0 4px", fontSize: 21, fontWeight: 900,
              letterSpacing: "-0.04em", lineHeight: 1.2 }}>{item.asso.name}</h2>
            {item.asso.city && (
              <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--muted)", fontWeight: 600 }}>
                {item.asso.city}{item.asso.department ? ` · ${item.asso.department}` : ""}
              </p>
            )}

            {/* Lien à arbitrer */}
            <div style={{ padding: "18px 20px", borderRadius: 14, background: "var(--bg-soft)",
              border: "1px solid var(--hairline)", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ padding: "4px 12px", borderRadius: 20, background: "var(--bg)",
                  border: "1.5px solid var(--hairline)", fontWeight: 800, fontSize: 12.5 }}>
                  {PLATFORM_LABEL[item.platform] ?? item.platform}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
                  confiance {(item.score * 100).toFixed(0)}%
                </span>
              </div>
              <a href={item.url} target="_blank" rel="noreferrer"
                style={{ fontSize: 14, fontWeight: 600, color: "var(--accent, #2b6cff)",
                  wordBreak: "break-all" }}>{item.url}</a>
              <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>
                <strong>Doute du modèle :</strong> {item.reason || "—"}
              </p>
            </div>

            {/* Contexte : liens déjà appliqués */}
            {Object.keys(item.asso.social ?? {}).length > 0 && (
              <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--muted)" }}>
                Déjà appliqués : {Object.entries(item.asso.social).map(([p]) => PLATFORM_LABEL[p] ?? p).join(", ")}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => void resolve("drop")} disabled={busy}
                style={{ flex: 1, height: 46, borderRadius: 12, border: "1.5px solid var(--hairline)",
                  background: "var(--bg)", color: "#e5484d", fontWeight: 800, fontSize: 14,
                  cursor: "pointer" }}>
                ✕ Jeter <span style={{ opacity: .6, fontWeight: 600 }}>(D / ←)</span>
              </button>
              <button onClick={() => void resolve("keep")} disabled={busy}
                style={{ flex: 1, height: 46, borderRadius: 12, border: "2px solid #00b386",
                  background: "color-mix(in srgb, #00b386 12%, white)", color: "#00875f",
                  fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                ✓ Garder <span style={{ opacity: .6, fontWeight: 600 }}>(K / → / Entrée)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
