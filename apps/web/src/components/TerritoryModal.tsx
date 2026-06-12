/**
 * TerritoryModal : fenêtre pop-up listant TOUS les départements (100+) avec leurs
 * stats. Recherche (nom / région) + tri (nombre d'assos, % avec lien, nom) +
 * grille responsive. Cliquer un département ouvre son territoire sur la carte.
 */
import { useMemo, useState } from "react";
import type { TerritoryStat } from "../lib/api";
import {
  COVERED, COVERED_CODES, STATE_COLOR, STATE_LABEL, type DeptMeta,
} from "../data/departements";
import { Icon } from "./Icon";

type SortKey = "total" | "lien" | "nom";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

interface Row {
  meta: DeptMeta;
  total: number;
  pctGeo: number;
  pctLien: number;
}

export function TerritoryModal({
  territories,
  onClose,
  onSelect,
}: {
  territories: TerritoryStat[] | null;
  onClose: () => void;
  onSelect: (d: DeptMeta) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("total");

  const rows = useMemo<Row[]>(() => {
    const byCode = new Map((territories ?? []).map((t) => [t.department, t]));
    const list = COVERED_CODES.map((code) => {
      const meta = COVERED[code];
      const t = byCode.get(code);
      const total = t?.total ?? 0;
      const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
      return { meta, total, pctGeo: pct(t?.geolocalisees ?? 0), pctLien: pct(t?.avecSocial ?? 0) };
    });
    const nq = norm(q.trim());
    const filtered = nq
      ? list.filter((r) => norm(r.meta.nom).includes(nq) || norm(r.meta.region).includes(nq))
      : list;
    filtered.sort((a, b) =>
      sort === "nom" ? a.meta.nom.localeCompare(b.meta.nom, "fr")
        : sort === "lien" ? b.pctLien - a.pctLien
          : b.total - a.total,
    );
    return filtered;
  }, [territories, q, sort]);

  const inp: React.CSSProperties = {
    height: 42, padding: "0 14px", borderRadius: 12, border: "1.5px solid var(--hairline)",
    background: "var(--bg)", fontFamily: "var(--font)", fontSize: 14.5, color: "var(--ink)",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(10,10,20,.65)",
        backdropFilter: "blur(6px)", display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        width: "min(900px, 100%)", maxHeight: "90vh", background: "var(--bg)", borderRadius: 20,
        boxShadow: "0 32px 80px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header + contrôles (fixes) */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)" }}>
              Détail par territoire
            </h2>
            <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)", display: "flex", padding: 4 }}>
              <Icon name="close" size={20} stroke={2} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 240px" }}>
              <span style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }}>
                <Icon name="search" size={17} stroke={2} />
              </span>
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Chercher un département ou une région…"
                style={{ ...inp, width: "100%", paddingLeft: 38 }}
              />
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
              style={{ ...inp, cursor: "pointer", flex: "0 0 auto" }}>
              <option value="total">Tri : nombre d'assos</option>
              <option value="lien">Tri : % avec un lien</option>
              <option value="nom">Tri : nom (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Liste scrollable */}
        <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>
          {!territories ? (
            <div style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600, padding: 30 }}>Chargement…</div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--muted)", fontWeight: 600, padding: 30 }}>Aucun territoire trouvé.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {rows.map((r) => (
                <button
                  key={r.meta.code}
                  onClick={() => { onSelect(r.meta); onClose(); }}
                  style={{
                    textAlign: "left", cursor: "pointer", background: "var(--bg)", borderRadius: "var(--radius)",
                    border: "1px solid var(--hairline)", boxShadow: "var(--shadow-card)", padding: "14px 16px",
                    fontFamily: "var(--font)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--ink)" }}>{r.meta.nom}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase", color: STATE_COLOR[r.meta.state], padding: "2px 7px", borderRadius: 20, background: `color-mix(in srgb, ${STATE_COLOR[r.meta.state]} 14%, white)`, whiteSpace: "nowrap" }}>
                      {STATE_LABEL[r.meta.state]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>{r.meta.region}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ink)", lineHeight: 1 }}>
                    {r.total.toLocaleString("fr-FR")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, marginBottom: 8 }}>associations</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 600, lineHeight: 1.6 }}>
                    {r.pctGeo}% géolocalisées · {r.pctLien}% avec un lien
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
