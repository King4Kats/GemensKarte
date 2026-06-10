import { useEffect, useState } from "react";
import { Landing } from "./screens/Landing";
import { AdminReview } from "./components/AdminReview";
import { LinkReview } from "./components/LinkReview";
import { MapView } from "./screens/MapView";
import type { DeptMeta } from "./data/departements";

/** Retire le #hash sans recharger ni empiler d'historique. */
function clearHash() {
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export function App() {
  const [screen, setScreen] = useState<"landing" | "map">("landing");
  const [dept, setDept] = useState<DeptMeta | null>(null);
  const [admin, setAdmin] = useState(false);
  const [links, setLinks] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "A") setAdmin((v) => !v);
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) setLinks((v) => !v);
    };
    window.addEventListener("keydown", handler);
    // Accès admin par URL (bookmarkable) : /#review = revue des liens en quarantaine,
    // /#categories = revue des catégories. Marche au chargement ET au changement de hash.
    const fromHash = () => {
      const h = window.location.hash.toLowerCase();
      setLinks(h === "#review" || h === "#quarantaine" || h === "#admin");
      setAdmin(h === "#categories");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  return (
    <>
      {admin && <AdminReview onClose={() => { setAdmin(false); clearHash(); }} />}
      {links && <LinkReview onClose={() => { setLinks(false); clearHash(); }} />}
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
    </>
  );
}
