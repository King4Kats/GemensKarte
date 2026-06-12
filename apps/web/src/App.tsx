/**
 * Composant racine du front (l'application React affichée dans le navigateur).
 * Il décide quel écran montrer : la page d'accueil (Landing), la carte (MapView),
 * ou le tri collaboratif de la quarantaine (Quarantine, accessible via #quarantaine).
 */
import { useEffect, useState } from "react";
import { Landing } from "./screens/Landing";
import { MapView } from "./screens/MapView";
import { Quarantine } from "./screens/Quarantine";
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

  // Suit les changements d'ancre (#quarantaine) pour basculer d'écran.
  useEffect(() => {
    const onHash = () => {
      const s = screenFromHash();
      if (s) setScreen(s);
      else if (screen === "quarantaine") setScreen("landing");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [screen]);

  const goHome = () => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    setScreen("landing");
  };

  return (
    <>
      {screen === "landing" && (
        <Landing onSelect={(d) => { setDept(d); setScreen("map"); }} />
      )}
      {screen === "map" && (
        <MapView
          initial={{}}
          dept={dept}
          onHome={() => setScreen("landing")}
        />
      )}
      {screen === "quarantaine" && <Quarantine onHome={goHome} />}
    </>
  );
}
