import {
  Bike,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
  Route,
  Sparkles,
  Store,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  friendlyAuthError,
  signIn,
  signInAsStoreDirect,
  signInDriverByNameAndPin,
  signOut,
  signUp,
} from "../services/authService";
import type { Driver, User } from "../types";
import { getActiveStore, registerDynamicStore, setActiveStore } from "../services/storeService";
import { getDriversRTDB, subscribeToDriversRTDB } from "../services/realtimeDbService";
import { loginTakeatWithPassword, saveTakeatCredentials } from "../services/takeatService";
import { startTakeatOAuthFlow } from "../services/takeatOAuthService";

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

  // Modal de Conexão com Takeat & Cadastro da Loja
  const [showStoreConnectModal, setShowStoreConnectModal] = useState(false);
  const [modalTab, setModalTab] = useState<"takeat" | "signup">("takeat");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  // Campos da Conexão Takeat
  const [takeatEmail, setTakeatEmail] = useState("");
  const [takeatPassword, setTakeatPassword] = useState("");
  const [showTakeatPassword, setShowTakeatPassword] = useState(false);

  // Campos do Cadastro / Criação de Login da Loja
  const [signupStoreName, setSignupStoreName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);

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

  // Conexão direta com a Takeat através do e-mail e senha do gestor
  async function handleTakeatConnectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!takeatEmail.trim() || !takeatPassword.trim()) {
      setModalError("Informe o e-mail e a senha do gestor Takeat.");
      return;
    }
    setModalLoading(true);
    setModalError("");

    try {
      const token = await loginTakeatWithPassword(takeatEmail.trim(), takeatPassword.trim());
      if (!token) {
        throw new Error("Não foi possível autenticar na Takeat.");
      }

      saveTakeatCredentials({
        authMethod: "credentials",
        email: takeatEmail.trim(),
        password: takeatPassword.trim(),
      });

      const baseSlug = takeatEmail.trim().split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "");
      const storeId = `takeat-${baseSlug || "loja"}`;
      const storeName = `Loja ${baseSlug}`;

      registerDynamicStore({
        id: storeId,
        name: storeName,
        companyId: storeId,
        defaultTakeatEmail: takeatEmail.trim(),
      });
      setActiveStore(storeId);

      const user = await signInAsStoreDirect(storeId, storeName);
      setShowStoreConnectModal(false);
      onLoginSuccess?.(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar na Takeat. Verifique e-mail e senha.";
      setModalError(msg);
    } finally {
      setModalLoading(false);
    }
  }

  // Criação de novo login e senha para a loja (cadastro)
  async function handleStoreSignupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signupStoreName.trim()) {
      setModalError("Informe o nome do seu restaurante ou loja.");
      return;
    }
    if (!signupEmail.trim() || !signupPassword.trim()) {
      setModalError("Informe o e-mail e a senha desejada.");
      return;
    }
    if (signupPassword.trim().length < 6) {
      setModalError("A senha precisa ter pelo menos 6 dígitos.");
      return;
    }

    setModalLoading(true);
    setModalError("");

    try {
      const user = await signUp(
        signupEmail.trim(),
        signupPassword.trim(),
        signupStoreName.trim(),
        "admin",
        signupPhone.trim(),
      );

      const slug = signupStoreName.trim().toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30);
      const storeId = slug || user.id;

      registerDynamicStore({
        id: storeId,
        name: signupStoreName.trim(),
        companyId: storeId,
        phone: signupPhone.trim(),
        defaultTakeatEmail: signupEmail.trim(),
      });
      setActiveStore(storeId);

      setShowStoreConnectModal(false);
      onLoginSuccess?.(user);
    } catch (err: unknown) {
      setModalError(friendlyAuthError(err));
    } finally {
      setModalLoading(false);
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
  // Deduplica motoboys por nome normalizado para nunca exibir repetidos no seletor
  const activeDriversList = useMemo(() => {
    const map = new Map<string, Driver>();
    for (const d of drivers) {
      if (d.active === false) continue;
      const key = (d.name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, d);
      } else {
        map.set(key, {
          ...existing,
          ...d,
          pin: d.pin || existing.pin,
          phone: d.phone || existing.phone,
          takeatId: d.takeatId || existing.takeatId,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [drivers]);

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
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                PIN de Acesso (4 dígitos)
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
                  placeholder="••••"
                  autoComplete="current-password"
                  style={{
                    border: "none",
                    background: "transparent",
                    width: "100%",
                    outline: "none",
                    color: "var(--text)",
                    fontSize: "18px",
                    letterSpacing: "6px",
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
            {/* Botão Oficial: Conectar via Takeat Store ou Criar Login */}
            <div style={{ marginBottom: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setModalError("");
                  setModalTab("takeat");
                  setShowStoreConnectModal(true);
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
                  ou entre com login e senha da loja
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

              <div style={{ textAlign: "center", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setModalError("");
                    setModalTab("signup");
                    setShowStoreConnectModal(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Novo por aqui? Criar login e senha da loja
                </button>
              </div>
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

      {/* Modal de Conexão Takeat & Criação de Login da Loja */}
      {showStoreConnectModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "20px",
              maxWidth: "440px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px 22px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
              boxSizing: "border-box",
              color: "#0f172a",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: "rgba(249, 115, 22, 0.12)",
                    border: "1px solid rgba(249, 115, 22, 0.25)",
                    display: "grid",
                    placeItems: "center",
                    color: "#ea580c",
                  }}
                >
                  <Store size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>
                    Acesso do Estabelecimento
                  </h2>
                  <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#475569", fontWeight: 500 }}>
                    Conexão Takeat e Cadastro de Restaurante
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowStoreConnectModal(false)}
                aria-label="Fechar"
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  width: "32px",
                  height: "32px",
                  display: "grid",
                  placeItems: "center",
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Selector Tabs */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px",
                background: "#f1f5f9",
                padding: "4px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setModalTab("takeat");
                  setModalError("");
                }}
                style={{
                  padding: "9px 6px",
                  borderRadius: "8px",
                  border: "none",
                  background: modalTab === "takeat" ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : "transparent",
                  color: modalTab === "takeat" ? "#ffffff" : "#475569",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: modalTab === "takeat" ? "0 2px 8px rgba(249,115,22,.3)" : "none",
                }}
              >
                <Store size={15} />
                <span>Conectar Takeat</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalTab("signup");
                  setModalError("");
                }}
                style={{
                  padding: "9px 6px",
                  borderRadius: "8px",
                  border: "none",
                  background: modalTab === "signup" ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : "transparent",
                  color: modalTab === "signup" ? "#ffffff" : "#475569",
                  fontSize: "12.5px",
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  boxShadow: modalTab === "signup" ? "0 2px 8px rgba(249,115,22,.3)" : "none",
                }}
              >
                <KeyRound size={15} />
                <span>Criar Login e Senha</span>
              </button>
            </div>

            {/* ABA 1: CONECTAR COM TAKEAT */}
            {modalTab === "takeat" && (
              <form onSubmit={handleTakeatConnectSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    fontSize: "12px",
                    color: "#9a3412",
                    fontWeight: 600,
                    lineHeight: "1.45",
                  }}
                >
                  Digite o e-mail e a senha do gestor Takeat para sincronizar automaticamente pedidos, comandas e cardápio.
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px", color: "#1e293b" }}>
                    E-mail do Gestor Takeat
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <Mail size={16} color="#64748b" />
                    <input
                      type="email"
                      required
                      value={takeatEmail}
                      onChange={(e) => setTakeatEmail(e.target.value)}
                      placeholder="ex: restaurante@takeat.app"
                      autoCapitalize="none"
                      autoCorrect="off"
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px", color: "#1e293b" }}>
                    Senha da Conta Takeat
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "9px 12px",
                    }}
                  >
                    <LockKeyhole size={16} color="#64748b" />
                    <input
                      type={showTakeatPassword ? "text" : "password"}
                      required
                      value={takeatPassword}
                      onChange={(e) => setTakeatPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTakeatPassword(!showTakeatPassword)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#64748b",
                        padding: 0,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {showTakeatPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {modalError && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      color: "#b91c1c",
                      fontSize: "12px",
                      fontWeight: 600,
                      lineHeight: "1.4",
                    }}
                  >
                    {modalError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    marginTop: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "13px",
                    borderRadius: "12px",
                    fontSize: "14px",
                    fontWeight: 800,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                    border: "none",
                    color: "#ffffff",
                    background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                    boxShadow: "0 4px 14px rgba(249,115,22,.35)",
                    opacity: modalLoading ? 0.7 : 1,
                  }}
                >
                  {modalLoading ? "Conectando na Takeat…" : "Conectar com Takeat e Entrar"}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0 2px" }}>
                  <span style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>ou integração oficial Takeat Store</span>
                  <span style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setModalError(
                      "A autorização via Takeat Store OAuth PKCE será liberada assim que sua proposta for aprovada no portal AI Builders da Takeat. Enquanto aguarda a aprovação, conecte sua loja digitando seu E-mail e Senha do Gestor Takeat acima!"
                    );
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "11px",
                    borderRadius: "10px",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    border: "1.5px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  <Sparkles size={14} color="#f97316" />
                  <span>Entrar com Takeat Store (OAuth PKCE)</span>
                </button>
              </form>
            )}

            {/* ABA 2: CRIAR NOVO LOGIN E SENHA DA LOJA */}
            {modalTab === "signup" && (
              <form onSubmit={handleStoreSignupSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "10px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    fontSize: "12px",
                    color: "#166534",
                    fontWeight: 600,
                    lineHeight: "1.45",
                  }}
                >
                  Crie o login e senha do seu restaurante. Todos os pedidos, taxas e motoboys serão isolados com total segurança.
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px", color: "#1e293b" }}>
                    Nome do Estabelecimento
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <Building2 size={16} color="#64748b" />
                    <input
                      type="text"
                      required
                      value={signupStoreName}
                      onChange={(e) => setSignupStoreName(e.target.value)}
                      placeholder="ex: Pizzaria Bella Napoli"
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px", color: "#1e293b" }}>
                    E-mail de Acesso da Loja
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <Mail size={16} color="#64748b" />
                    <input
                      type="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="ex: contato@pizzaria.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px", color: "#1e293b" }}>
                    Senha de Acesso (mínimo 6 dígitos)
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "9px 12px",
                    }}
                  >
                    <LockKeyhole size={16} color="#64748b" />
                    <input
                      type={showSignupPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#64748b",
                        padding: 0,
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {showSignupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px", color: "#1e293b" }}>
                    WhatsApp / Telefone da Loja (Opcional)
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "#ffffff",
                      border: "1.5px solid #cbd5e1",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <Phone size={16} color="#64748b" />
                    <input
                      type="tel"
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                      placeholder="(XX) 99999-9999"
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "#0f172a",
                        fontSize: "14px",
                        fontWeight: 600,
                      }}
                    />
                  </div>
                </div>

                {modalError && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "8px",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      color: "#b91c1c",
                      fontSize: "12px",
                      fontWeight: 600,
                      lineHeight: "1.4",
                    }}
                  >
                    {modalError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    marginTop: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "13px",
                    borderRadius: "12px",
                    fontSize: "14px",
                    fontWeight: 800,
                    cursor: modalLoading ? "not-allowed" : "pointer",
                    border: "none",
                    color: "#ffffff",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    boxShadow: "0 4px 14px rgba(16,185,129,.35)",
                    opacity: modalLoading ? 0.7 : 1,
                  }}
                >
                  {modalLoading ? "Cadastrando Loja…" : "Criar Acesso e Entrar no Painel"}
                </button>
              </form>
            )}

            {/* Acesso rápido opcional de demonstração */}
            <div style={{ textAlign: "center", marginTop: "4px" }}>
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/?portal=loja&store=${encodeURIComponent(activeStore.id)}`;
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Acesso de teste / Demonstração rápida
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
