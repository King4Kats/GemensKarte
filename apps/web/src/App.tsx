/**
 * Composant racine du front (l'application React affichée dans le navigateur).
 * Il décide quel écran montrer : la page d'accueil (Landing) ou la carte (MapView).
 */
import { useState } from "react";
import { Landing } from "./screens/Landing";
import { MapView } from "./screens/MapView";
import type { DeptMeta } from "./data/departements";

export function App() {
  // useState = une "case mémoire" de React : quand sa valeur change, l'écran se redessine.
  // screen : quel écran on affiche ; dept : le département choisi.
  const [screen, setScreen] = useState<"landing" | "map">("landing");
  const [dept, setDept] = useState<DeptMeta | null>(null);

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
    </>
  );
}
