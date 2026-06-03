import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { api, type Association, type Suggestion } from "../lib/api";
import { CATEGORIES, catById } from "../lib/categories";
import { Logo } from "../components/Logo";
import { Icon } from "../components/Icon";
import { SearchBar } from "../components/SearchBar";
import { AssoCard } from "../components/AssoCard";
import { AssoSheet } from "../components/AssoSheet";
import type { ExploreOpts } from "./Landing";

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

export function MapView({ initial, onHome }: { initial: ExploreOpts; onHome: () => void }) {
  const [q, setQ] = useState(initial.q || "");
  const [cats, setCats] = useState<string[]>(initial.cat ? [initial.cat] : []);
  const [items, setItems] = useState<Association[]>([]);
  const [openAsso, setOpenAsso] = useState<Association | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const mapRef = useRef<L.Map | null>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  /* ---- données : associations géolocalisées ---- */
  useEffect(() => {
    api.list({ located: true, limit: 100 }).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  const openId = openAsso?.id ?? null;

  const flyTo = useCallback((a: Association) => {
    const m = mapRef.current;
    if (m && a.lat != null && a.lng != null) m.flyTo([a.lat, a.lng], Math.max(m.getZoom(), 11), { duration: 0.7 });
  }, []);

  const openAssoFn = useCallback((a: Association) => { setOpenAsso(a); flyTo(a); }, [flyTo]);

  const openById = useCallback(async (id: string) => {
    const found = markersRefItem(items, id);
    if (found) { openAssoFn(found); return; }
    try { const a = await api.get(id); setOpenAsso(a); flyTo(a); } catch { /* ignore */ }
  }, [items, openAssoFn, flyTo]);

  /* ---- suggestions (Meili) ---- */
  useEffect(() => {
    const t = q.trim();
    if (!t) { setSuggestions([]); return; }
    const id = setTimeout(() => { api.suggest(t, 6).then(setSuggestions).catch(() => setSuggestions([])); }, 160);
    return () => clearTimeout(id);
  }, [q]);

  /* ---- filtrage client (catégories + texte) ---- */
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((a) => {
      const okCat = cats.length === 0 || cats.includes(a.categoryId);
      const okQ = !t ||
        a.name.toLowerCase().includes(t) ||
        (a.city ?? "").toLowerCase().includes(t) ||
        catById(a.categoryId).label.toLowerCase().includes(t) ||
        a.tags.some((tag) => tag.toLowerCase().includes(t));
      return okCat && okQ;
    });
  }, [items, q, cats]);

  /* ---- init Leaflet (une fois) ---- */
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return;
    const map = L.map(mapElRef.current, { center: [47.9, -2.0], zoom: 7, zoomControl: false, scrollWheelZoom: true });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ---- (re)construit les marqueurs quand les données changent ---- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    items.forEach((a) => {
      if (a.lat == null || a.lng == null) return;
      const c = catById(a.categoryId);
      const icon = L.divIcon({
        className: "",
        html: `<div class="confetti-pin" data-id="${a.id}" style="--cat:${c.color}"><span class="pin-dot"></span></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const marker = L.marker([a.lat, a.lng], { icon }).addTo(map);
      const popHtml =
        `<div class="cm-pop-inner" style="--cat:${c.color}">` +
        `<div class="pp-cat">${c.label}</div>` +
        `<div class="pp-name">${a.name}</div>` +
        `<div class="pp-city"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>${a.city ?? ""}</div>` +
        `</div>`;
      marker.bindPopup(popHtml, { className: "cm-pop", closeButton: false, offset: [0, -6], autoPan: false });
      marker.on("mouseover", () => { setHoverId(a.id); marker.openPopup(); });
      marker.on("mouseout", () => { setHoverId(null); marker.closePopup(); });
      marker.on("click", () => openAssoFn(a));
      markersRef.current[a.id] = marker;
    });
  }, [items, openAssoFn]);

  /* ---- ouverture initiale (depuis la landing) ---- */
  const didInitOpen = useRef(false);
  useEffect(() => {
    if (didInitOpen.current || !initial.open || items.length === 0) return;
    didInitOpen.current = true;
    void openById(initial.open);
  }, [initial.open, items, openById]);

  /* ---- reflète le filtre : estompe les pins masqués ---- */
  useEffect(() => {
    const ids = new Set(filtered.map((a) => a.id));
    Object.entries(markersRef.current).forEach(([id, m]) => {
      const el = m.getElement();
      if (el) {
        el.style.transition = "opacity .25s";
        el.style.opacity = ids.has(id) ? "1" : "0.12";
        el.style.pointerEvents = ids.has(id) ? "auto" : "none";
      }
    });
  }, [filtered]);

  /* ---- reflète actif/survol sur les pins ---- */
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, m]) => {
      const el = m.getElement();
      const pin = el?.querySelector(".confetti-pin");
      if (pin) pin.classList.toggle("is-active", id === openId || id === hoverId);
    });
  }, [openId, hoverId]);

  const toggleCat = (id: string) => setCats((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 18, padding: "14px clamp(16px, 3vw, 26px)", borderBottom: "1px solid var(--hairline)", flexShrink: 0, zIndex: 10 }}>
        <Logo size={20} onClick={onHome} />
        <div style={{ flex: 1, maxWidth: 440 }}>
          <SearchBar size="sm" value={q} onChange={setQ} suggestions={suggestions} onPick={(s) => openById(s.id)} onSubmit={() => {}} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onHome} style={{ marginLeft: "auto" }}>
          <Icon name="sparkle" size={15} stroke={2.2} /> Accueil
        </button>
      </header>

      <div className="cm-scroll" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px clamp(16px, 3vw, 26px)", borderBottom: "1px solid var(--hairline)", flexShrink: 0, overflowX: "auto" }}>
        <FilterBar active={cats} onToggle={toggleCat} onClear={() => setCats([])} />
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <section className="cm-scroll" style={{ width: "clamp(360px, 36%, 460px)", flexShrink: 0, overflowY: "auto", borderRight: "1px solid var(--hairline)", padding: "18px clamp(14px, 2vw, 20px) 30px", background: "var(--bg-soft)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 16, padding: "0 4px" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.03em", margin: 0, color: "var(--ink)", whiteSpace: "nowrap" }}>
              {filtered.length} association{filtered.length > 1 ? "s" : ""}
            </h2>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>Grand Ouest</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map((a) => (
              <AssoCard key={a.id} asso={a} active={a.id === openId || a.id === hoverId} onOpen={openAssoFn} onHover={(x) => setHoverId(x.id)} onLeave={() => setHoverId(null)} />
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
                <div style={{ display: "inline-flex", gap: 5, marginBottom: 14 }}>
                  <i style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--c-cult)", opacity: 0.5 }} />
                  <i style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--c-eco)", opacity: 0.5 }} />
                  <i style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--c-sport)", opacity: 0.5 }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: "0 0 4px" }}>Aucune asso par ici</p>
                <p style={{ fontSize: 13.5, margin: 0 }}>Essaie d'élargir ta recherche ou tes filtres.</p>
              </div>
            )}
          </div>
        </section>

        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <div ref={mapElRef} style={{ position: "absolute", inset: 0 }} />
          <AssoSheet asso={openAsso} onClose={() => setOpenAsso(null)} />
        </div>
      </div>
    </div>
  );
}

function markersRefItem(items: Association[], id: string): Association | undefined {
  return items.find((a) => a.id === id);
}
