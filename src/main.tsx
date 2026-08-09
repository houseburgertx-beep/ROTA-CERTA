import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../app/globals.css";
import Home from "../app/page";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz não encontrado.");

createRoot(root).render(<StrictMode><Home/></StrictMode>);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
