import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../app/globals.css";
import Home from "../app/page";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz não encontrado.");

createRoot(root).render(<StrictMode><Home/></StrictMode>);

// Tratamento automático de erro de chunk desatualizado (após deploy com novos hashes)
window.addEventListener("error", (e) => {
  const msg = e.message || "";
  const isChunkError =
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("error loading dynamically imported module");

  if (isChunkError && !sessionStorage.getItem("sw_chunk_retry")) {
    sessionStorage.setItem("sw_chunk_retry", "true");
    if (typeof caches !== "undefined") {
      void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
