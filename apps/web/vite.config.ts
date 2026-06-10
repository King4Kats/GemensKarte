/**
 * Configuration de Vite (l'outil qui lance le serveur de dev et construit le front).
 * On y active le support de React et on règle le serveur local : port d'écoute
 * et redirection (proxy) des appels /api vers l'API NestJS.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// L'API NestJS tourne sur :3000. En dev, on proxifie /api pour éviter le CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
