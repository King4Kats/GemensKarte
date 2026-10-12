/**
 * Composant racine du front (l'application React affichée dans le navigateur).
 * Il décide quel écran montrer : la page d'accueil (Landing), la carte (MapView),
 * ou le tri collaboratif de la quarantaine (Quarantine, accessible via #quarantaine).
 */
import { useEffect, useState } from "react";
import { Landing } from "./screens/Landing";
import { MapView } from "./screens/MapView";
import { Quarantine } from "./screens/Quarantine";
import { api } from "./lib/api";
import type { DeptMeta } from "./data/departements";

type Screen = "landing" | "map" | "quarantaine";

// L'ancre #quarantaine (dans l'URL) ouvre directement la page de tri. Pratique pour
// un lien direct ou un raccourci bureau (gemenskarte.fr/#quarantaine).
function screenFromHash(): Screen | null {
  return typeof window !== "undefined" && window.location.hash.replace("#", "") === "quarantaine"
    ? "quarantaine"
    : null;
}

export function App() {
  // useState = une "case mémoire" de React : quand sa valeur change, l'écran se redessine.
  const [screen, setScreen] = useState<Screen>(() => screenFromHash() ?? "landing");
  const [dept, setDept] = useState<DeptMeta | null>(null);

  // Suit les changements d'historique (bouton retour/suivant du navigateur)
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const s = screenFromHash();
      if (s === "quarantaine") {
        setScreen("quarantaine");
      } else if (window.location.hash === "#carte") {
        setScreen("map");
        if (e.state && e.state.dept) setDept(e.state.dept);
      } else {
        setScreen("landing");
      }
    };
    window.addEventListener("popstate", onPopState);

    // Initialisation de l'état pour la page d'accueil si on arrive dessus
    if (!window.history.state && !window.location.hash) {
      window.history.replaceState({ screen: 'landing' }, "", window.location.pathname);
    } else if (window.location.hash === "#carte" && window.history.state?.dept) {
      setDept(window.history.state.dept);
      setScreen("map");
    }

    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goHome = () => {
    if (window.history.state?.screen === 'map' || window.history.state?.screen === 'quarantaine') {
      window.history.back();
    } else {
      if (window.location.hash) window.history.pushState({ screen: 'landing' }, "", window.location.pathname);
      setScreen("landing");
    }
  };

  // Suivi de fréquentation anonyme : une « page vue » à chaque changement d'écran.
  useEffect(() => { api.track("page", { path: screen }); }, [screen]);

  // Ouvre un territoire (depuis la carte ou la popup) + compte la région consultée.
  const openDept = (d: DeptMeta) => {
    api.track("region", { dept: d.code });
    setDept(d);
    setScreen("map");
    window.history.pushState({ screen: 'map', dept: d }, "", "#carte");
  };

  return (
    <>
      {screen === "landing" && (
        <Landing onSelect={openDept} />
      )}
      {screen === "map" && (
        <MapView
          initial={{}}
          dept={dept}
          onHome={goHome}
        />
      )}
      {screen === "quarantaine" && <Quarantine onHome={goHome} />}
    </>
  );
}
