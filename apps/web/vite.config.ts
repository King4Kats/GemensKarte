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
