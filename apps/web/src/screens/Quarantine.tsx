/**
 * Tri collaboratif de la quarantaine (page publique).
 * On y liste les liens "à arbitrer" trouvés par les robots mais pas assez sûrs pour
 * être affichés direct. N'importe qui peut aider : OUVRIR le lien (obligatoire pour
 * pouvoir juger) puis GARDER (→ s'affiche sur le site) ou JETER. 1 clic = appliqué.
 * Anti-rafale côté serveur : si on mitraille, petite pause d'une minute.
 */
import { useEffect, useRef, useState } from "react";
import { api, type QuarantineAssoc } from "../lib/api";
import { Icon, type IconName } from "../components/Icon";
import { useIsMobile } from "../lib/useIsMobile";

// Un lien à arbitrer (on "aplatit" chaque plateforme d'une fiche en une carte).
interface Item {
  id: string;
  name: string;
  city: string | null;
  department: string | null;
  description: string | null;
  platform: string;
  url: string;
  score: number;
  reason: string;
}

const PLAT: Record<string, { label: string; icon: IconName; color: string }> = {
  facebook: { label: "Facebook", icon: "facebook", color: "#1877f2" },
  instagram: { label: "Instagram", icon: "insta", color: "#ec2d8a" },
  website: { label: "Site web", icon: "globe", color: "#7b3ff2" },
  helloasso: { label: "HelloAsso", icon: "heart", color: "#f5a623" },
};

function platOf(p: string) {
  return PLAT[p] ?? { label: p, icon: "globe" as IconName, color: "#6b7280" };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function flatten(rows: QuarantineAssoc[]): Item[] {
  const out: Item[] = [];
  for (const a of rows) {
    for (const [platform, e] of Object.entries(a.quarantine ?? {})) {
      if (!e?.url) continue;
      out.push({
        id: a.id, name: a.name, city: a.city, department: a.department,
        description: a.description, platform,
        url: e.url, score: e.score ?? 0, reason: e.reason ?? "",
      });
    }
  }
  return out;
}

export function Quarantine({ onHome }: { onHome: () => void }) {
  const [queue, setQueue] = useState<Item[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [rateUntil, setRateUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pageRef = useRef(1);
  const seenRef = useRef<Set<string>>(new Set());
  const isMobile = useIsMobile();

  const key = (it: Item) => `${it.id}:${it.platform}`;

  // Charge une page et empile les liens (en évitant les doublons déjà vus).
  const loadMore = async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await api.quarantine.list(pageRef.current, 40);
      setTotal(res.total);
      const fresh = flatten(res.items).filter((it) => !seenRef.current.has(key(it)));
      fresh.forEach((it) => seenRef.current.add(key(it)));
      setQueue((q) => [...q, ...fresh]);
      pageRef.current += 1;
      if (res.page * res.limit >= res.total) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recharge quand la file devient courte.
  useEffect(() => {
    if (queue.length < 10 && hasMore && !loading) void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, hasMore, loading]);

  // Décompte de la pause anti-rafale.
  useEffect(() => {
    if (rateUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [rateUntil]);

  const paused = rateUntil > now;
  const pauseLeft = Math.max(0, Math.ceil((rateUntil - now) / 1000));

  const act = async (it: Item, action: "keep" | "drop") => {
    if (paused || !opened.has(key(it))) return;
    // Retrait optimiste : la carte disparaît tout de suite.
    setQueue((q) => q.filter((x) => key(x) !== key(it)));
    try {
      const r = await api.quarantine.resolve(it.id, it.platform, action);
      if (r === "rate") {
        setRateUntil(Date.now() + 60_000);
        setNow(Date.now());
        setQueue((q) => [it, ...q]); // on remet la carte, l'action n'a pas été prise
        return;
      }
      setDone((d) => d + 1);
    } catch {
      setQueue((q) => [it, ...q]); // échec réseau -> on remet la carte
    }
  };

  const openLink = (it: Item) => {
    window.open(it.url, "_blank", "noopener,noreferrer");
    setOpened((s) => new Set(s).add(key(it)));
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-soft)", fontFamily: "var(--font)" }}>
      {/* En-tête */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
        padding: "18px clamp(16px, 5vw, 48px)", background: "var(--bg)",
        borderBottom: "1px solid var(--hairline)", position: "sticky", top: 0, zIndex: 5,
      }}>
        <button onClick={onHome} className="btn btn-ghost btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span> Accueil
        </button>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ink-2)", fontWeight: 700, fontSize: 14 }}>
          <Icon name="check" size={16} stroke={2.4} />
          {done} trié{done > 1 ? "s" : ""}{total !== null ? ` · ${total} fiche${total > 1 ? "s" : ""} en file` : ""}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "clamp(20px, 5vw, 40px) 16px 80px" }}>
        <h1 style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 800, color: "var(--ink)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Tri collaboratif des liens 🔍
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: 15, lineHeight: 1.6, margin: "0 0 8px" }}>
          Nos robots ont trouvé ces liens mais ne sont pas <strong>sûrs</strong> qu'ils
          appartiennent bien à l'association. Aide-nous : <strong>ouvre le lien</strong>, vérifie,
          puis <strong>garde</strong> (il s'affichera sur le site) ou <strong>jette</strong>. Merci ! 💛
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 24px" }}>
          Il faut ouvrir le lien avant de pouvoir juger. 1 clic = appliqué tout de suite.
        </p>

        {/* Bandeau pause anti-rafale */}
        {paused && (
          <div style={{
            background: "color-mix(in srgb, #f5a623 14%, white)", border: "1px solid #f5a623",
            color: "#7a5200", borderRadius: 12, padding: "12px 16px", margin: "0 0 18px",
            fontSize: 14, fontWeight: 600,
          }}>
            ⏳ Tu vas un peu vite — petite pause de {pauseLeft}s, puis c'est reparti.
          </div>
        )}

        {/* Liste des liens à arbitrer */}
        {queue.map((it) => {
          const p = platOf(it.platform);
          const isOpen = opened.has(key(it));
          return (
            <div key={key(it)} style={{
              background: "var(--bg)", border: "1px solid var(--hairline)", borderLeft: `5px solid ${p.color}`,
              borderRadius: "var(--radius)", padding: 18, margin: "0 0 14px", boxShadow: "var(--shadow-card)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 16 }}>{it.name}</div>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700,
                  color: p.color, background: `color-mix(in srgb, ${p.color} 13%, white)`,
                  padding: "4px 10px", borderRadius: 999,
                }}>
                  <Icon name={p.icon} size={14} stroke={2.2} /> {p.label}
                </span>
              </div>
              {(it.city || it.department) && (
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                  {[it.city, it.department && `(${it.department})`].filter(Boolean).join(" ")}
                </div>
              )}
              {it.description && (
                <div style={{ color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.55, margin: "8px 0 0" }}>
                  {it.description.length > 160 ? `${it.description.slice(0, 157)}…` : it.description}
                </div>
              )}
              {it.reason && (
                <div style={{ color: "var(--muted)", fontSize: 12.5, fontStyle: "italic", margin: "8px 0 0" }}>
                  Avis de l'IA : {it.reason}
                </div>
              )}

              <div style={{
                display: "flex", gap: 8, flexWrap: "wrap",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "center",
                marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--hairline)",
              }}>
                <a href={it.url} target="_blank" rel="noopener noreferrer"
                  onClick={() => setOpened((s) => new Set(s).add(key(it)))}
                  className="btn btn-ghost btn-md"
                  style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 7,
                    marginRight: isMobile ? 0 : "auto", maxWidth: "100%", overflow: "hidden" }}>
                  <Icon name="arrowUpRight" size={16} stroke={2.2} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Ouvrir {domainOf(it.url)}
                  </span>
                </a>
                <div style={{ display: "flex", gap: 8, width: isMobile ? "100%" : "auto" }}>
                  <button onClick={() => act(it, "keep")} disabled={!isOpen || paused}
                    title={isOpen ? "" : "Ouvre d'abord le lien"}
                    className="btn btn-md"
                    style={{
                      flex: isMobile ? 1 : "0 0 auto", display: "inline-flex", justifyContent: "center",
                      alignItems: "center", gap: 6, color: "#fff",
                      background: isOpen && !paused ? "#16a34a" : "#bcd9c4",
                      cursor: isOpen && !paused ? "pointer" : "not-allowed",
                    }}>
                    <Icon name="check" size={16} stroke={2.6} /> Garder
                  </button>
                  <button onClick={() => act(it, "drop")} disabled={!isOpen || paused}
                    title={isOpen ? "" : "Ouvre d'abord le lien"}
                    className="btn btn-md"
                    style={{
                      flex: isMobile ? 1 : "0 0 auto", display: "inline-flex", justifyContent: "center",
                      alignItems: "center", gap: 6,
                      color: isOpen && !paused ? "#dc2626" : "#c7989a",
                      background: "var(--bg)", border: `1.5px solid ${isOpen && !paused ? "#dc2626" : "#e7c9ca"}`,
                      cursor: isOpen && !paused ? "pointer" : "not-allowed",
                    }}>
                    <Icon name="close" size={16} stroke={2.6} /> Jeter
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* États vides / chargement */}
        {loading && queue.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0" }}>Chargement…</div>
        )}
        {!loading && queue.length === 0 && (
          <div style={{
            textAlign: "center", color: "var(--ink-2)", padding: "48px 16px",
            background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius)",
          }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
            <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 18 }}>Tout est trié, merci !</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              Reviens plus tard : les robots trouvent de nouveaux liens en continu.
            </div>
            <button onClick={onHome} className="btn btn-accent btn-md" style={{ marginTop: 18 }}>
              Retour à l'accueil
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
