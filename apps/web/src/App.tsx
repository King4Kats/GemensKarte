/**
 * Composant racine du front (l'application React affichée dans le navigateur).
 * Il décide quel écran montrer : la page d'accueil (Landing) ou la carte (MapView),
 * et il gère l'ouverture des écrans d'administration cachés (revue des liens / des catégories),
 * accessibles via un raccourci clavier ou une adresse spéciale (le #hash dans l'URL).
 */
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
  // useState = une "case mémoire" de React : quand sa valeur change, l'écran se redessine.
  // screen : quel écran on affiche ; dept : le département choisi ; admin/links : panneaux d'admin ouverts ou non.
  const [screen, setScreen] = useState<"landing" | "map">("landing");
  const [dept, setDept] = useState<DeptMeta | null>(null);
  const [admin, setAdmin] = useState(false);
  const [links, setLinks] = useState(false);

  // useEffect avec [] = ce code s'exécute une seule fois, au démarrage de l'app.
  // On y branche l'écoute du clavier et des changements d'URL ; on les débranche à la fermeture.
  useEffect(() => {
    // Raccourcis clavier cachés pour ouvrir/fermer les panneaux d'admin (Ctrl+Shift+A et Ctrl+Shift+L).
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
