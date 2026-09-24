import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/takeat-api": {
        target: "https://public-api.takeat.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/takeat-api/, ""),
        secure: false,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            const auth = proxyReq.getHeader("authorization");
            if (auth) {
              console.log("[PROXY AUTH TOKEN]", auth);
            }
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            if (req.url && req.url.includes("table-sessions")) {
              const chunks: Buffer[] = [];
              proxyRes.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
              proxyRes.on("end", () => {
                try {
                  const body = Buffer.concat(chunks).toString("utf8");
                  const fs = require("fs");
                  fs.writeFileSync("/tmp/takeat_raw_sessions.json", body);
                  console.log("[PROXY DUMPED SESSIONS]", chunks.length, "bytes written to /tmp/takeat_raw_sessions.json");
                } catch (e) {
                  console.error("Erro ao salvar dump sessions:", e);
                }
              });
            }
          });
        },
      },
      "/takeat-auth": {
        target: "https://backend-pdv-2.takeat.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/takeat-auth/, ""),
        secure: false,
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
