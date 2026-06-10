/**
 * Point d'entrée du front (la toute première ligne de code qui s'exécute dans le navigateur).
 * Son rôle : prendre le composant racine <App /> et l'« accrocher » dans la page HTML,
 * à l'intérieur de la balise qui a l'id "root". On charge aussi ici les styles globaux
 * (CSS de Leaflet pour la carte + notre propre styles.css).
 */
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { App } from "./App";

// On démarre l'application React : tout ce que l'utilisateur voit part d'ici.
createRoot(document.getElementById("root")!).render(<App />);
