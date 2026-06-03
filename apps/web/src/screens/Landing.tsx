import { useEffect, useState } from "react";
import { api, type Suggestion } from "../lib/api";
import { CATEGORIES, catById } from "../lib/categories";
import { Logo } from "../components/Logo";
import { SearchBar } from "../components/SearchBar";
import { ConfettiField } from "../components/ConfettiField";

export interface ExploreOpts {
  q?: string;
  cat?: string;
  open?: string;
}

function CatChip({ cat, onClick }: { cat: string; onClick: (cat: string) => void }) {
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
        transition: "border-color .16s, transform .16s, box-shadow .16s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = c.color;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 8px 20px color-mix(in srgb, ${c.color} 22%, transparent)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--hairline)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: c.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${c.color} 16%, transparent)` }} />
      {c.label}
    </button>
  );
}

const navLink = { background: "transparent", color: "var(--ink)", fontWeight: 700 } as const;

export function Landing({ onExplore }: { onExplore: (o: ExploreOpts) => void }) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    api.list({ limit: 1 }).then((r) => setTotal(r.total)).catch(() => setTotal(null));
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
    { n: total != null ? total.toLocaleString("fr-FR") : "…", l: "associations" },
    { n: "3", l: "régions" },
    { n: "6", l: "univers" },
    { n: "100%", l: "open-source" },
  ];

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px clamp(20px, 5vw, 64px)", position: "relative", zIndex: 5 }}>
        <Logo size={22} />
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn btn-sm" style={navLink} onClick={() => onExplore({})}>Explorer la carte</button>
          <button className="btn btn-sm" style={navLink}>Ajouter mon asso</button>
          <button className="btn btn-ink btn-sm" style={{ marginLeft: 6 }}>Se connecter</button>
        </nav>
      </header>

      <main style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px clamp(20px, 5vw, 64px) 0", overflow: "hidden" }}>
        <ConfettiField count={22} seed={11} />

        <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 960, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 26, padding: "7px 15px 7px 11px", borderRadius: "var(--radius-pill)", background: "var(--bg-sunk)", fontSize: 13, fontWeight: 700, color: "var(--ink-2)", letterSpacing: "-0.01em" }}>
            <span style={{ display: "inline-flex", gap: 3 }}>
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-cult)" }} />
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-eco)" }} />
              <i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-social)" }} />
            </span>
            Bretagne · Pays de la Loire · Normandie
          </span>

          <h1 className="display" style={{ fontSize: "clamp(44px, 7.4vw, 92px)", margin: "0 0 22px", color: "var(--ink)" }}>
            Le territoire<br />
            de <span style={{ position: "relative", color: "var(--accent)", whiteSpace: "nowrap" }}>
              tes assos
              <svg viewBox="0 0 240 18" preserveAspectRatio="none" style={{ position: "absolute", left: 0, right: 0, bottom: "-0.12em", width: "100%", height: "0.22em" }}>
                <path d="M3 13 C 60 4, 180 4, 237 11" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          <p style={{ fontSize: "clamp(16px, 2vw, 20px)", lineHeight: 1.5, color: "var(--ink-2)", margin: "0 0 38px", maxWidth: 620, fontWeight: 500, textWrap: "balance" }}>
            Répertorie, découvre et rejoins les associations qui font vivre ta région.
            Une carte, mille élans citoyens.
          </p>

          <div style={{ width: "100%", maxWidth: 640 }}>
            <SearchBar
              size="lg"
              value={q}
              onChange={setQ}
              suggestions={suggestions}
              onSubmit={() => onExplore({ q })}
              onPick={(s) => onExplore({ open: s.id })}
            />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 26 }}>
            {CATEGORIES.map((c) => (
              <CatChip key={c.id} cat={c.id} onClick={(cat) => onExplore({ cat })} />
            ))}
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 2, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "clamp(28px, 6vw, 72px)", margin: "auto 0 0", padding: "40px 0 34px" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: "var(--ink)", lineHeight: 1, whiteSpace: "nowrap" }}>{s.n}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginTop: 6, letterSpacing: "0.01em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
