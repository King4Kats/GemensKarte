/**
 * MapView : l'écran principal de la carte interactive.
 * On affiche une carte Leaflet (librairie de cartes web) avec les associations
 * d'un département, regroupées en "clusters" (paquets de points proches), plus
 * une barre de recherche et des filtres par catégorie.
 * Cliquer sur un point ouvre la fiche détaillée de l'association (AssoSheet).
 */
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

// Barre de filtres : une pastille cliquable par catégorie. Cliquer active/désactive
// le filtre. Un bouton "Tout afficher" apparait dès qu'au moins un filtre est actif.
// (`active` = liste des id de catégories actuellement sélectionnées.)
/** Normalise un nom de ville pour comparer sans accents/casse/espaces multiples
 *  (la base contient parfois "La   Roche-sur-Yon" avec plusieurs espaces). */
function normCity(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
/** Nettoie l'affichage d'une ville (espaces multiples -> un seul). */
function cleanCity(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

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

// Composant principal de l'écran carte.
// - `initial` : options de départ (recherche, catégorie, asso à ouvrir) venant de la page d'accueil.
// - `onHome` / `onPortal` : fonctions pour revenir à l'accueil ou à la liste des territoires.
// - `dept` : le département affiché (sert à limiter les données à ce territoire).
export function MapView({ initial, onHome, onPortal, dept }: {
  initial: ExploreOpts;
  onHome: () => void;
  onPortal?: () => void;
  dept?: DeptMeta | null;
}) {
  // États React (données qui, quand elles changent, redessinent l'écran) :
  const [q, setQ] = useState(initial.q || "");                                  // texte tapé dans la recherche
  const [cats, setCats] = useState<string[]>(initial.cat ? [initial.cat] : []); // filtres catégories actifs
  const [points, setPoints] = useState<GeoPoint[]>([]);                         // tous les points géographiques des assos
  const [openAsso, setOpenAsso] = useState<Association | null>(null);           // asso dont la fiche est ouverte
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);             // propositions auto de la recherche
  const [keywords, setKeywords] = useState<string[]>([]);                       // mots-clés actifs = filtre carte (croisés en ET)
  const [kwIds, setKwIds] = useState<Record<string, string[]>>({});             // mot-clé (minuscule) -> ids des assos qui matchent

  // Références (valeurs gardées entre les rendus, sans redessiner l'écran) :
  const mapRef = useRef<L.Map | null>(null);                                    // l'objet carte Leaflet
  const mapElRef = useRef<HTMLDivElement>(null);                                // la balise HTML qui contient la carte
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);                 // le groupe de marqueurs clusterisés
  const didFitRef = useRef(false);                                              // recentrage initial déjà fait ?
  const deptRef = useRef<string | undefined>(dept?.code);                       // dept courant (pour les handlers carte)
  const loadTimerRef = useRef<number | null>(null);                            // debounce du chargement par zone

  /* ---- points carte : CHARGEMENT PAR ZONE VISIBLE ----
     Au changement de territoire : on mémorise le dept, on autorise un recadrage, et on
     charge un petit échantillon pour pouvoir cadrer. Ensuite, c'est le `moveend` de la
     carte (voir init Leaflet) qui recharge les points de la portion regardée (bbox),
     plafonnés -> jamais 100 000 points d'un coup, même sur Paris. */
  useEffect(() => {
    deptRef.current = dept?.code;
    didFitRef.current = false;
    api.geojson({ located: true, department: dept?.code, limit: 3000 })
      .then(setPoints).catch(() => setPoints([]));
  }, [dept?.code]);

  // Charge les points de la zone actuellement affichée (bbox de la carte), plafonnés.
  const loadViewport = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const b = m.getBounds();
    api.geojson({
      located: true, department: deptRef.current,
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], limit: 4000,
    }).then(setPoints).catch(() => {});
  }, []);


  // Déplace en douceur la carte vers une association (animation de "vol").
  const flyTo = useCallback((a: Association) => {
    const m = mapRef.current;
    if (m && a.lat != null && a.lng != null) m.flyTo([a.lat, a.lng], Math.max(m.getZoom(), 11), { duration: 0.7 });
  }, []);

  // Ouvre la fiche d'une asso déjà chargée et recentre la carte dessus.
  const openAssoFn = useCallback((a: Association) => { setOpenAsso(a); flyTo(a); }, [flyTo]);

  // Va chercher l'asso complète auprès de l'API à partir de son identifiant, puis l'ouvre.
  const openById = useCallback(async (id: string) => {
    try { const a = await api.get(id); openAssoFn(a); } catch { /* ignore */ }
  }, [openAssoFn]);

  /* ---- recherche par VILLE -> zoom carte ---- */
  // Index des villes présentes : nom normalisé -> { affichage, points de la ville }.
  const cityIndex = useMemo(() => {
    const m = new Map<string, { name: string; pts: GeoPoint[] }>();
    for (const p of points) {
      if (!p.city) continue;
      const key = normCity(p.city);
      if (!key) continue;
      let e = m.get(key);
      if (!e) { e = { name: cleanCity(p.city), pts: [] }; m.set(key, e); }
      e.pts.push(p);
    }
    return m;
  }, [points]);

  // Villes proposées pour le texte tapé (max 4) : celles qui commencent par le texte
  // d'abord, puis les plus fournies. Rien tant qu'on a tapé moins de 2 caractères.
  const cityMatches = useMemo(() => {
    const t = normCity(q);
    if (t.length < 2) return [] as { name: string; count: number }[];
    const out: { name: string; count: number; starts: boolean }[] = [];
    for (const [key, e] of cityIndex) {
      if (key.includes(t)) out.push({ name: e.name, count: e.pts.length, starts: key.startsWith(t) });
    }
    out.sort((a, b) => (a.starts === b.starts ? b.count - a.count : a.starts ? -1 : 1));
    return out.slice(0, 4).map(({ name, count }) => ({ name, count }));
  }, [q, cityIndex]);

  // Zoome la carte sur une ville (ajuste la vue pour montrer toutes ses associations).
  const zoomToCity = useCallback((name: string) => {
    const e = cityIndex.get(normCity(name));
    const m = mapRef.current;
    if (!e || !m || e.pts.length === 0) return;
    const bounds = L.latLngBounds(e.pts.map((p) => [p.lat, p.lng] as [number, number]));
    m.fitBounds(bounds, { padding: [70, 70], maxZoom: 14, animate: true, duration: 0.7 });
  }, [cityIndex]);

  // Touche Entrée / bouton "Go" : si le texte correspond à une ville, on zoome dessus ;
  // sinon on ouvre la 1re association proposée.
  /* ---- filtre par MOTS-CLÉS (chips) : masque les points dont le titre/descriptif
          ne contient pas le(s) mot(s). Plusieurs mots = croisement en ET. ---- */
  // Ajoute le texte tapé comme mot-clé, et récupère en fond les ids des assos qui
  // matchent (nom OU descriptif RNA, via Meili → gère synonymes "music"/"musique").
  const addKeyword = useCallback((raw: string) => {
    const w = raw.trim();
    if (!w) return;
    const key = w.toLowerCase();
    setKeywords((ks) => (ks.some((k) => k.toLowerCase() === key) ? ks : [...ks, w]));
    setQ("");
    if (!(key in kwIds)) {
      api.matchIds(w, dept?.code).then((ids) => setKwIds((m) => ({ ...m, [key]: ids }))).catch(() => {});
    }
  }, [kwIds, dept?.code]);

  const removeKeyword = useCallback((w: string) => {
    setKeywords((ks) => ks.filter((k) => k !== w));
  }, []);

  // Entrée / "Go" : si le texte est une ville -> zoom ; sinon -> ajoute un mot-clé de filtre.
  const onSearchSubmit = useCallback(() => {
    if (cityMatches.length > 0) { zoomToCity(cityMatches[0].name); setOpenAsso(null); }
    else if (q.trim()) addKeyword(q);
  }, [cityMatches, zoomToCity, q, addKeyword]);

  // Intersection des ids de tous les mots-clés (= croisement ET). null = aucun filtre mot-clé.
  const keywordIds = useMemo(() => {
    if (keywords.length === 0) return null;
    let acc: Set<string> | null = null;
    for (const w of keywords) {
      const ids = kwIds[w.toLowerCase()];
      if (!ids) continue; // pas encore chargé : on l'ignore (le filtre s'affine à l'arrivée)
      const s = new Set(ids);
      acc = acc === null ? s : new Set([...acc].filter((id) => s.has(id)));
    }
    return acc;
  }, [keywords, kwIds]);

  /* ---- suggestions (Meili) ---- */
  // À chaque frappe, on demande au moteur de recherche (Meilisearch) jusqu'à 6 propositions.
  // Le setTimeout/clearTimeout fait un "debounce" (on attend 160 ms de pause avant d'envoyer)
  // pour ne pas lancer une requête à chaque lettre tapée.
  useEffect(() => {
    const t = q.trim();
    if (!t) { setSuggestions([]); return; }
    const id = setTimeout(() => { api.suggest(t, 6, dept?.code).then(setSuggestions).catch(() => setSuggestions([])); }, 160);
    return () => clearTimeout(id);
  }, [q, dept?.code]);

  /* ---- filtrage des points carte par categorie uniquement (pas par texte = freeze) ---- */
  // On ne garde que les points dont la catégorie est cochée. Si aucun filtre, on garde tout.
  // useMemo = on recalcule seulement quand `points` ou `cats` changent (évite des recalculs inutiles).
  const filteredPoints = useMemo(() => {
    return points.filter((p) =>
      (cats.length === 0 || cats.includes(p.categoryId)) &&
      (keywordIds === null || keywordIds.has(p.id))
    );
  }, [points, cats, keywordIds]);

  /* ---- init Leaflet (une fois) ---- */
  // Crée la carte au premier affichage : centre sur la Vendée, choisit le fond de carte
  // OpenStreetMap France (les "tiles" = petites images qui composent la carte).
  // Le `return () => map.remove()` nettoie la carte quand on quitte l'écran.
  useEffect(() => {
    if (mapRef.current || !mapElRef.current) return;
    const map = L.map(mapElRef.current, { center: [46.67, -1.43], zoom: 9, zoomControl: false, scrollWheelZoom: true });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Agrandir", zoomOutTitle: "Réduire" }).addTo(map);
    // Fond de carte OpenStreetMap standard (osm.org) : rapide, fiable et jamais bloqué
    // par les bloqueurs de pub (contrairement aux CDN type cartocdn). Bien plus réactif
    // que les tuiles OpenStreetMap France (souvent lentes/limitées).
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    // Recharge les points de la zone à chaque fin de déplacement/zoom (debounce léger).
    map.on("moveend", () => {
      if (loadTimerRef.current) window.clearTimeout(loadTimerRef.current);
      loadTimerRef.current = window.setTimeout(loadViewport, 250);
    });
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ---- (re)construit les marqueurs (clusterisés) quand les points filtrés changent ---- */
  // À chaque changement de filtre, on vide puis recrée tous les marqueurs sur la carte.
  // Les marqueurs proches sont regroupés en "clusters" (paquets) pour ne pas surcharger l'écran.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // On crée le groupe de clusters une seule fois (à la première exécution).
    if (!clusterRef.current) {
      clusterRef.current = L.markerClusterGroup({
        chunkedLoading: true,
        // Ne garde dans le DOM que les marqueurs DANS la vue -> indispensable avec
        // des dizaines de milliers de points (zoom/pan fluide même à l'échelle nationale).
        removeOutsideVisibleBounds: true,
        showCoverageOnHover: false,
        maxClusterRadius: 56,
        spiderfyOnMaxZoom: true,
        // Pastille plate colorée par la catégorie DOMINANTE des assos du cluster.
        // Dessine la pastille d'un cluster : on compte les catégories des assos qu'il contient
        // et on le colore avec la catégorie la plus présente. La taille grandit avec le nombre.
        iconCreateFunction: (cluster) => {
          // tally = compteur "catégorie -> nombre d'assos de cette catégorie dans le cluster".
          const tally: Record<string, number> = {};
          for (const m of cluster.getAllChildMarkers()) {
            const id = (m.options as { catId?: string }).catId;
            if (id) tally[id] = (tally[id] ?? 0) + 1;
          }
          // On cherche la catégorie dominante (celle qui revient le plus souvent).
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
    group.clearLayers(); // on enlève les anciens marqueurs avant de remettre les nouveaux

    // Pour chaque point, on fabrique un marqueur coloré selon sa catégorie,
    // avec une mini-fiche (popup) au survol et l'ouverture de la fiche au clic.
    const markers = filteredPoints.map((p) => {
      const c = catById(p.categoryId);
      const icon = L.divIcon({
        className: "",
        html: `<div class="confetti-pin" data-id="${p.id}" style="--cat:${c.color}"><span class="pin-dot"></span></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      });
      const marker = L.marker([p.lat, p.lng], { icon });
      (marker.options as Record<string, unknown>).catId = p.categoryId; // pour la couleur du cluster

      // Popup PARESSEUSE : on ne construit la mini-fiche qu'au 1er survol (au lieu de
      // la générer pour des dizaines de milliers de marqueurs d'emblée).
      marker.on("mouseover", () => {
        if (!marker.getPopup()) {
          const popHtml =
            `<div class="cm-pop-inner" style="--cat:${c.color}">` +
            `<div class="pp-cat">${c.label}</div>` +
            `<div class="pp-name">${p.name}</div>` +
            `<div class="pp-city"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>${p.city ?? ""}</div>` +
            `</div>`;
          marker.bindPopup(popHtml, { className: "cm-pop", closeButton: false, offset: [0, -6], autoPan: false });
        }
        marker.openPopup();
      });
      marker.on("mouseout", () => marker.closePopup());
      marker.on("click", () => void openById(p.id));
      return marker;
    });
    group.addLayers(markers);

    // Recentre la carte sur les points du territoire, UNE seule fois (sauf si on ouvre
    // une asso précise depuis l'accueil). Permet d'arriver bien cadré sur n'importe quel
    // département (ex. Occitanie au sud), pas seulement la Vendée.
    if (!didFitRef.current && !initial.open && filteredPoints.length > 0) {
      didFitRef.current = true;
      map.fitBounds(
        L.latLngBounds(filteredPoints.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [40, 40], maxZoom: 12, animate: false },
      );
    }
  }, [filteredPoints, openById, initial.open]);

  /* ---- ouverture initiale (depuis la landing) ---- */
  // Si la page d'accueil a demandé d'ouvrir une asso précise, on le fait une seule fois,
  // une fois les points chargés. `didInitOpen` empêche de recommencer aux rendus suivants.
  const didInitOpen = useRef(false);
  useEffect(() => {
    if (didInitOpen.current || !initial.open || points.length === 0) return;
    didInitOpen.current = true;
    void openById(initial.open);
  }, [initial.open, points, openById]);

  // Active/désactive un filtre catégorie : on le retire s'il y est déjà, sinon on l'ajoute.
  const toggleCat = (id: string) => setCats((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));

  // Affichage de l'écran : en haut l'en-tête (logo, recherche, boutons),
  // puis la barre de filtres, puis la carte qui occupe tout le reste de la place.
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 14px", padding: "12px clamp(16px, 3vw, 26px)", borderBottom: "1px solid var(--hairline)", flexShrink: 0, position: "relative", zIndex: 1200, background: "var(--bg)" }}>
        <Logo size={30} onClick={onHome} />
        {dept && (
          <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 11px",
            borderRadius: "var(--radius-pill)", background: "var(--bg-soft)",
            border: "1.5px solid var(--hairline)", fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>
            {dept.nom}
          </span>
        )}
        <div style={{ flex: 1, maxWidth: 440 }}>
          <SearchBar size="sm" value={q} onChange={setQ} suggestions={suggestions}
            onPick={(s) => openById(s.id)} cities={cityMatches} onPickCity={zoomToCity}
            onSubmit={onSearchSubmit} />
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
        {/* Mots-clés actifs (chips) : chacun filtre la carte ; plusieurs = croisement (ET).
            La croix retire le mot. Le compteur = nb d'assos qui contiennent ce mot. */}
        {keywords.length > 0 && (
          <>
            <span style={{ width: 1, height: 22, background: "var(--hairline)", flexShrink: 0 }} />
            {keywords.map((w) => {
              const count = kwIds[w.toLowerCase()]?.length;
              return (
                <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0,
                  height: 34, padding: "0 7px 0 13px", borderRadius: "var(--radius-pill)",
                  background: "color-mix(in srgb, var(--accent) 12%, white)", color: "var(--accent)",
                  border: "1.5px solid color-mix(in srgb, var(--accent) 35%, white)",
                  fontFamily: "var(--font)", fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em" }}>
                  {w}{count !== undefined ? ` · ${count}` : "…"}
                  <button onClick={() => removeKeyword(w)} aria-label={`Retirer ${w}`}
                    style={{ display: "grid", placeItems: "center", width: 19, height: 19, borderRadius: "50%",
                      border: 0, background: "color-mix(in srgb, var(--accent) 20%, white)", color: "var(--accent)", cursor: "pointer", flexShrink: 0 }}>
                    <Icon name="close" size={11} stroke={2.6} />
                  </button>
                </span>
              );
            })}
          </>
        )}
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

