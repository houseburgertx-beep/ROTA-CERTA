import React, { useState, useEffect } from "react";
import { Download, X, Smartphone, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [showIOSTip, setShowIOSTip] = useState(false);

  useEffect(() => {
    // Verifica se já está em modo PWA standalone (instalado)
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsStandalone(standaloneMode);

    if (standaloneMode) return;

    // Verifica se já foi dispensado nesta sessão
    const wasDismissed = sessionStorage.getItem("pwa_prompt_dismissed");
    if (!wasDismissed) {
      setDismissed(false);
    }

    // Detecção de iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleMobile = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isAppleMobile);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!sessionStorage.getItem("pwa_prompt_dismissed")) {
        setDismissed(false);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  if (isStandalone || dismissed) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDismissed(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSTip(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa_prompt_dismissed", "true");
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "82px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 28px)",
        maxWidth: "460px",
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "16px",
        padding: "12px 14px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        color: "#f8fafc",
        fontSize: "13px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              flexShrink: 0,
            }}
          >
            <Smartphone size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "13px", color: "#ffffff" }}>
              Instalar App Rota Certa
            </div>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>
              Acesso rápido sem barra do navegador
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            onClick={handleInstallClick}
            style={{
              height: "32px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "none",
              background: "#10b981",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
            }}
          >
            <Download size={14} />
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Fechar aviso"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              border: "none",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showIOSTip && (
        <div
          style={{
            fontSize: "11px",
            color: "#cbd5e1",
            background: "rgba(255, 255, 255, 0.06)",
            padding: "8px 10px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginTop: "4px",
          }}
        >
          <Share size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
          <span>
            No Safari do iPhone: toque em <strong>Compartilhar</strong> e selecione <strong>Adicionar à Tela de Início</strong>.
          </span>
        </div>
      )}
    </div>
  );
}
