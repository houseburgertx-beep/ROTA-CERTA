import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/ROTA-CERTA/",
  root: "pages",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../github-pages",
    emptyOutDir: true,
  },
});
