import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
// Pas de MarkerCluster.Default.css : on stylise nous-mêmes les clusters (voir iconCreateFunction).
import { api, type Association, type GeoPoint, type Suggestion } from "../lib/api";
import { CATEGORIES, catById } from "../lib/categories";
import { Logo } from "../components/Logo";
import { Icon } from "../components/Icon";
import { SearchBar } from "../components/SearchBar";
import { AssoSheet } from "../components/AssoSheet";
import type { ExploreOpts } from "./Landing";
import type { DeptMeta } from "../data/departements";

function FilterBar({ active, onToggle, onClear }: { active: string[]; onToggle: (id: string) => void; onClear: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
      {CATEGORIES.map((c) => {
        const on = active.includes(c.id);
        return (
          <button
            key={c.id}
            onClick={() => onToggle(c.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, flexShrink: 0,
              height: 34, padding: "0 13px 0 11px", borderRadius: "var(--radius-pill)",
              border: on ? `1.5px solid ${c.color}` : "1.5px solid var(--hairline)",
              background: on ? `color-mix(in srgb, ${c.color} 12%, white)` : "var(--bg)",
              color: on ? c.color : "var(--ink-2)",
              cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13,
              letterSpacing: "-0.01em", transition: "all .14s",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, opacity: on ? 1 : 0.55 }} />
            {c.label}
          </button>
        );
      })}
      {active.length > 0 && (
        <button onClick={onClear} style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, height: 34, padding: "0 12px", borderRadius: "var(--radius-pill)", border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font)", fontWeight: 700, fontSize: 13 }}>
          <Icon name="close" size={14} stroke={2.4} /> Tout afficher
        </button>
      )}
    </div>
  );
}

export function MapView({ initial, onHome, onPortal, dept }: {
  initial: ExploreOpts;
  onHome: () => void;
  onPortal?: () => void;
  dept?: DeptMeta | null;
}) {
  const [q, setQ] = useState(initial.q || "");
  const [cats, setCats] = useState<string[]>(initial.cat ? [initial.cat] : []);
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [openAsso, setOpenAsso] = useState<Association | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const mapRef = useRef<L.Map | null>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  /* ---- points carte (charges une fois) ---- */
  useEffect(() => {
    api.geojson({ located: true }).then(setPoints).catch(() => setPoints([]));
  }, []);


  const flyTo = useCallback((a: Association) => {
    const m = mapRef.current;
    if (m && a.lat != null && a.lng != null) m.flyTo([a.lat, a.lng], Math.max(m.getZoom(), 11), { duration: 0.7 });
  }, []);

  const openAssoFn = useCallback((a: Association) => { setOpenAsso(a); flyTo(a); }, [flyTo]);

  const openById = useCallback(async (id: string) => {
    try { const a = await api.get(id); openAssoFn(a); } catch { /* ignore */ }
  }, [openAssoFn]);

  /* ---- suggestions (Meili) ---- */
  useEffect(() => {
    const t = q.trim();
    if (!t) { setSuggestions([]); return; }
    const id = setTimeout(() => { api.suggest(t, 6).then(setSuggestions).catch(() => setSuggestions([])); }, 160);
    return () => clearTimeout(id);
  }, [q]);

  /* ---- filtrage des points carte par categorie uniquement (pas par texte = freeze) ---- */
  const filteredPoints = useMemo(() => {
    if (cats.length === 0) return points;
    return points.filter((p) => cats.includes(p.categoryId));
  }, [points, cats]);

  /* ---- init Leaflet (une fois) ---- */
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return;
    const map = L.map(mapElRef.current, { center: [46.67, -1.43], zoom: 9, zoomControl: false, scrollWheelZoom: true });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Agrandir", zoomOutTitle: "Réduire" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
      attribution: "© <a href='https://www.openstreetmap.fr/'>OpenStreetMap France</a> | © <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors", subdomains: "abc", maxZoom: 20,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ---- (re)construit les marqueurs (clusterisés) quand les points filtrés changent ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!clusterRef.current) {
      clusterRef.current = L.markerClusterGroup({
        chunkedLoading: true,
        showCoverageOnHover: false,
        maxClusterRadius: 56,
        spiderfyOnMaxZoom: true,
        // Pastille plate colorée par la catégorie DOMINANTE des assos du cluster.
        iconCreateFunction: (cluster) => {
          const tally: Record<string, number> = {};
          for (const m of cluster.getAllChildMarkers()) {
            const id = (m.options as { catId?: string }).catId;
            if (id) tally[id] = (tally[id] ?? 0) + 1;
          }
          let domId = "";
          let max = -1;
          for (const id in tally) {
            if (tally[id] > max) { max = tally[id]; domId = id; }
          }
          const color = domId ? catById(domId).color : "var(--ink-2)";
          const n = cluster.getChildCount();
          const size = n < 10 ? 32 : n < 100 ? 40 : n < 1000 ? 48 : 56;
          const fs = n < 100 ? 13 : n < 1000 ? 12.5 : 11.5;
          return L.divIcon({
            className: "",
            html: `<div class="confetti-cluster" style="--cat:${color};width:${size}px;height:${size}px;font-size:${fs}px">${n}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
      map.addLayer(clusterRef.current);
    }
    const group = clusterRef.current;
    group.clearLayers();

    const markers = filteredPoints.map((p) => {
      const c = catById(p.categoryId);
      const icon = L.divIcon({
        className: "",
        html: `<div class="confetti-pin" data-id="${p.id}" style="--cat:${c.color}"><span class="pin-dot"></span></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const marker = L.marker([p.lat, p.lng], { icon });
      (marker.options as Record<string, unknown>).catId = p.categoryId; // pour la couleur du cluster

      const popHtml =
        `<div class="cm-pop-inner" style="--cat:${c.color}">` +
        `<div class="pp-cat">${c.label}</div>` +
        `<div class="pp-name">${p.name}</div>` +
        `<div class="pp-city"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>${p.city ?? ""}</div>` +
        `</div>`;
      marker.bindPopup(popHtml, { className: "cm-pop", closeButton: false, offset: [0, -6], autoPan: false });
      marker.on("mouseover", () => marker.openPopup());
      marker.on("mouseout", () => marker.closePopup());
      marker.on("click", () => void openById(p.id));
      return marker;
    });
    group.addLayers(markers);
  }, [filteredPoints, openById]);

  /* ---- ouverture initiale (depuis la landing) ---- */
  const didInitOpen = useRef(false);
  useEffect(() => {
    if (didInitOpen.current || !initial.open || points.length === 0) return;
    didInitOpen.current = true;
    void openById(initial.open);
  }, [initial.open, points, openById]);

  const toggleCat = (id: string) => setCats((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px clamp(16px, 3vw, 26px)", borderBottom: "1px solid var(--hairline)", flexShrink: 0, position: "relative", zIndex: 1200, background: "var(--bg)" }}>
        <Logo size={20} onClick={onHome} />
        {dept && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 11px",
            borderRadius: "var(--radius-pill)", background: "var(--bg-soft)",
            border: "1.5px solid var(--hairline)", fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>
            {dept.nom}
          </span>
        )}
        <div style={{ flex: 1, maxWidth: 440 }}>
          <SearchBar size="sm" value={q} onChange={setQ} suggestions={suggestions} onPick={(s) => openById(s.id)} onSubmit={() => {}} />
        </div>
        {onPortal && (
          <button className="btn btn-ghost btn-sm" onClick={onPortal} style={{ marginLeft: "auto" }}>
            ← Territoires
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onHome} style={{ marginLeft: onPortal ? 0 : "auto" }}>
          <Icon name="sparkle" size={15} stroke={2.2} /> Accueil
        </button>
      </header>

      <div className="cm-scroll" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px clamp(16px, 3vw, 26px)", borderBottom: "1px solid var(--hairline)", flexShrink: 0, overflowX: "auto" }}>
        <FilterBar active={cats} onToggle={toggleCat} onClear={() => setCats([])} />
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <div ref={mapElRef} style={{ position: "absolute", inset: 0 }} />
          <AssoSheet asso={openAsso} onClose={() => setOpenAsso(null)} />
        </div>
      </div>
    </div>
  );
}

