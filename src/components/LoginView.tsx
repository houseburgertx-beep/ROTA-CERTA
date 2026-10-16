import {
  Bike,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Route,
  Store,
  UserCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  friendlyAuthError,
  signIn,
  signInDriverByNameAndPin,
  signOut,
} from "../services/authService";
import type { Driver, User } from "../types";
import { getActiveStore } from "../services/storeService";
import { getDriversRTDB, subscribeToDriversRTDB } from "../services/realtimeDbService";

type LoginViewProps = {
  profileError?: string;
  signedInEmail?: string;
  onLoginSuccess?: (user: User) => void;
};

export function LoginView({ profileError, signedInEmail, onLoginSuccess }: LoginViewProps) {
  const [selectedRole, setSelectedRole] = useState<"driver" | "admin">(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (
        search.includes("role=admin") ||
        search.includes("portal=loja") ||
        search.includes("loja") ||
        hash.includes("loja") ||
        hash.includes("adm")
      ) {
        return "admin";
      }
      if (
        search.includes("role=driver") ||
        search.includes("portal=motoboy") ||
        search.includes("motoboy") ||
        hash.includes("motoboy")
      ) {
        return "driver";
      }
    }
    return "driver";
  });

  const activeStore = getActiveStore();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);

  // Campos do Login de Motoboy por Nome e PIN
  const [selectedDriverName, setSelectedDriverName] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("rotacerta_saved_driver_name") || "";
      } catch {
        return "";
      }
    }
    return "";
  });
  const [driverPin, setDriverPin] = useState("");
  const [showDriverPin, setShowDriverPin] = useState(false);

  // Campos do formulário tradicional da Loja
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Carrega os motoboys da loja ativa
  useEffect(() => {
    let mounted = true;
    void getDriversRTDB().then((list) => {
      if (mounted) {
        setDrivers(list);
        setLoadingDrivers(false);
      }
    });

    const unsub = subscribeToDriversRTDB((list) => {
      if (mounted) {
        setDrivers(list);
        setLoadingDrivers(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const handleRoleChange = (role: "driver" | "admin") => {
    setSelectedRole(role);
    setError("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("role", role);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Login de Motoboy por Nome + PIN (4 dígitos)
  async function handleDriverSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedDriverName) {
      setError("Selecione seu nome de motoboy.");
      return;
    }
    if (!driverPin.trim()) {
      setError("Digite o PIN de 4 dígitos.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const user = await signInDriverByNameAndPin(drivers, selectedDriverName, driverPin);
      try {
        localStorage.setItem("rotacerta_saved_driver_name", selectedDriverName);
      } catch {}

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(80);
      }
      onLoginSuccess?.(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PIN incorreto.";
      setError(msg);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } finally {
      setLoading(false);
    }
  }

  // Login de Loja / Administrador
  async function handleAdminSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await signIn(email, password, "admin");
      onLoginSuccess?.(user);
    } catch (reason) {
      setError(friendlyAuthError(reason));
    } finally {
      setLoading(false);
    }
  }

  if (profileError) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-message">
          <div className="auth-brandmark">
            <Route />
          </div>
          <h1>Acesso pendente</h1>
          <p>{profileError}</p>
          <small>{signedInEmail}</small>
          <button type="button" onClick={() => void signOut()}>
            Usar outra conta
          </button>
        </section>
      </main>
    );
  }

  const isDriver = selectedRole === "driver";
  const activeDriversList = drivers.filter((d) => d.active !== false);

  return (
    <main className="auth-shell">
      <section
        className="auth-card"
        style={{
          maxWidth: "410px",
          width: "100%",
          padding: "26px 20px",
          border: isDriver ? "1px solid rgba(124,58,237,.35)" : "1px solid rgba(249,115,22,.35)",
          boxShadow: isDriver
            ? "0 10px 30px rgba(124,58,237,.15)"
            : "0 10px 30px rgba(249,115,22,.15)",
        }}
      >
        {/* Brand Header — Apenas a Loja Ativa, sem dropdown invasivo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "14px",
              background: isDriver
                ? "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)"
                : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              display: "grid",
              placeItems: "center",
              color: "#fff",
              flexShrink: 0,
              boxShadow: isDriver
                ? "0 4px 14px rgba(124,58,237,.35)"
                : "0 4px 14px rgba(249,115,22,.35)",
            }}
          >
            {isDriver ? <Bike size={24} /> : <Building2 size={24} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: "18px", letterSpacing: "-.4px", display: "block" }}>
              {isDriver ? "Portal do Motoboy" : "Painel da Loja"}
            </strong>
            <span
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                display: "block",
                marginTop: "1px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeStore.name}
            </span>
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            background: "var(--surface-2)",
            padding: "5px",
            borderRadius: "14px",
            marginBottom: "18px",
            border: "1px solid var(--line)",
          }}
        >
          <button
            type="button"
            onClick={() => handleRoleChange("driver")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "11px 8px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s ease",
              border: isDriver ? "1px solid #7c3aed" : "1px solid transparent",
              background: isDriver ? "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)" : "transparent",
              color: isDriver ? "#fff" : "var(--muted)",
              boxShadow: isDriver ? "0 4px 14px rgba(124,58,237,.3)" : "none",
            }}
          >
            <Bike size={16} />
            <span>SOU MOTOBOY</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleChange("admin")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "11px 8px",
              borderRadius: "10px",
              fontSize: "12.5px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s ease",
              border: !isDriver ? "1px solid #ea580c" : "1px solid transparent",
              background: !isDriver ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : "transparent",
              color: !isDriver ? "#fff" : "var(--muted)",
              boxShadow: !isDriver ? "0 4px 14px rgba(249,115,22,.3)" : "none",
            }}
          >
            <Building2 size={16} />
            <span>SOU LOJA / ADM</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* FLUXO DO MOTOBOY: FORMULÁRIO LIMPO NOME + PIN                  */}
        {/* ============================================================== */}
        {isDriver ? (
          <form onSubmit={handleDriverSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Campo 1: Nome do Motoboy */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                Seu Nome na Equipe
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: "10px",
                  padding: "6px 12px",
                }}
              >
                <Bike size={16} color="#7c3aed" style={{ flexShrink: 0 }} />
                {loadingDrivers ? (
                  <span style={{ fontSize: "13px", color: "var(--muted)", padding: "5px 0" }}>
                    Carregando entregadores…
                  </span>
                ) : activeDriversList.length > 0 ? (
                  <select
                    required
                    value={selectedDriverName}
                    onChange={(e) => setSelectedDriverName(e.target.value)}
                    style={{
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      outline: "none",
                      color: "var(--text)",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "6px 0",
                    }}
                  >
                    <option value="" disabled>
                      Selecione seu nome…
                    </option>
                    {activeDriversList.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={selectedDriverName}
                    onChange={(e) => setSelectedDriverName(e.target.value)}
                    placeholder="Digite seu nome de motoboy"
                    style={{
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      outline: "none",
                      color: "var(--text)",
                      fontSize: "14px",
                      padding: "6px 0",
                    }}
                  />
                )}
              </div>
            </div>

            {/* Campo 2: PIN de 4 Dígitos */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 700 }}>PIN de Acesso (4 dígitos)</label>
                <span style={{ fontSize: "11px", color: "#7c3aed", fontWeight: 700 }}>Padrão: 1234</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                <KeyRound size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
                <input
                  type={showDriverPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  required
                  value={driverPin}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setDriverPin(clean);
                    setError("");
                  }}
                  placeholder="1234"
                  style={{
                    border: "none",
                    background: "transparent",
                    width: "100%",
                    outline: "none",
                    color: "var(--text)",
                    fontSize: "16px",
                    letterSpacing: "4px",
                    fontWeight: 700,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowDriverPin(!showDriverPin)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--muted)",
                    padding: 0,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {showDriverPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "rgba(239,68,68,.12)",
                  border: "1px solid rgba(239,68,68,.3)",
                  color: "#ef4444",
                  fontSize: "12px",
                  lineHeight: "1.4",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "14px",
                borderRadius: "12px",
                fontSize: "15px",
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                border: "none",
                color: "#fff",
                background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
                boxShadow: "0 4px 16px rgba(124,58,237,.35)",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Entrando…" : "Entrar como Motoboy"}
            </button>
          </form>
        ) : (
          /* ============================================================== */
          /* FLUXO DA LOJA / ADMINISTRADOR                                  */
          /* ============================================================== */
          <div>
            {/* Botão Oficial: Conectar via Takeat Store */}
            <div style={{ marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/?portal=loja&store=${encodeURIComponent(activeStore.id)}`;
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "13px",
                  borderRadius: "12px",
                  border: "1px solid rgba(249,115,22,.4)",
                  background: "rgba(249,115,22,.08)",
                  color: "#ea580c",
                  fontSize: "13.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <Store size={18} />
                <span>Entrar no Painel da Loja (1 Clique)</span>
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0" }}>
                <span style={{ flex: 1, height: "1px", background: "var(--line)" }} />
                <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
                  ou entre com login e senha
                </span>
                <span style={{ flex: 1, height: "1px", background: "var(--line)" }} />
              </div>
            </div>

            <form onSubmit={handleAdminSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  E-mail da Loja
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    padding: "11px 12px",
                  }}
                >
                  <Mail size={16} color="var(--muted)" />
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Digite o e-mail da loja"
                    autoCapitalize="none"
                    autoCorrect="off"
                    style={{
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      outline: "none",
                      color: "var(--text)",
                      fontSize: "14px",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  Senha de Acesso
                </label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                  }}
                >
                  <LockKeyhole size={16} color="var(--muted)" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    style={{
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      outline: "none",
                      color: "var(--text)",
                      fontSize: "14px",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--muted)",
                      padding: 0,
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    background: "rgba(239,68,68,.12)",
                    border: "1px solid rgba(239,68,68,.3)",
                    color: "#ef4444",
                    fontSize: "12px",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "14px",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: 800,
                  cursor: loading ? "not-allowed" : "pointer",
                  border: "none",
                  color: "#fff",
                  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  boxShadow: "0 4px 16px rgba(249,115,22,.35)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Entrando…" : "Entrar no Painel da Loja"}
              </button>
            </form>
          </div>
        )}

        {/* Security & Cloud badge footer */}
        <div
          style={{
            marginTop: "18px",
            paddingTop: "12px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            color: "var(--muted)",
            fontSize: "11px",
          }}
        >
          <CheckCircle2 size={13} color="#10b981" />
          <span>Isolamento Seguro por Loja · Firebase & Takeat</span>
        </div>
      </section>
    </main>
  );
}
