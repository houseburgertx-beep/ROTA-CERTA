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
  Search,
  Store,
  UserCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  friendlyAuthError,
  signIn,
  signInWithDriverPin,
  signOut,
} from "../services/authService";
import type { Driver, User } from "../types";
import { getActiveStore, setActiveStore, STORES, type StoreId } from "../services/storeService";
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

  const [activeStore, setActiveStoreState] = useState(() => getActiveStore());
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);

  // Estados de Login por Nome e PIN do Motoboy
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [pin, setPin] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [pinError, setPinError] = useState("");
  const [useLegacyEmail, setUseLegacyEmail] = useState(false);

  // Estados do formulário tradicional de email/senha
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Carrega os motoboys da loja ativa em tempo real
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
  }, [activeStore.id]);

  const handleRoleChange = (role: "driver" | "admin") => {
    setSelectedRole(role);
    setError("");
    setPinError("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("role", role);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const handleStoreChange = (newStoreId: StoreId) => {
    setActiveStore(newStoreId);
    setActiveStoreState(getActiveStore());
    setSelectedDriver(null);
    setPin("");
  };

  // Login rápido do Motoboy com Nome e PIN de 4 dígitos
  async function handlePinLogin(driverToUse: Driver, pinToVerify: string) {
    if (pinToVerify.length < 4) return;
    setLoading(true);
    setPinError("");

    try {
      const user = await signInWithDriverPin(driverToUse, pinToVerify);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(100);
      }
      onLoginSuccess?.(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "PIN incorreto. Consulte a loja.";
      setPinError(msg);
      setPin("");
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([80, 50, 80]);
      }
    } finally {
      setLoading(false);
    }
  }

  // Disparo automático assim que o motoboy digita o 4º dígito do PIN
  const handlePinChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 4);
    setPin(clean);
    setPinError("");
    if (clean.length === 4 && selectedDriver) {
      void handlePinLogin(selectedDriver, clean);
    }
  };

  // Login tradicional (Email / Senha)
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const passToUse = password.trim() || (selectedRole === "driver" ? "123456" : "");

    try {
      const user = await signIn(email, passToUse, selectedRole);
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
  const filteredDrivers = drivers.filter(
    (d) =>
      d.active !== false &&
      (d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
        (d.phone && d.phone.includes(driverSearch))),
  );

  return (
    <main className="auth-shell">
      <section
        className="auth-card"
        style={{
          maxWidth: "430px",
          width: "100%",
          padding: "24px 20px",
          border: isDriver ? "1px solid rgba(124,58,237,.35)" : "1px solid rgba(249,115,22,.35)",
          boxShadow: isDriver
            ? "0 10px 30px rgba(124,58,237,.15)"
            : "0 10px 30px rgba(249,115,22,.15)",
        }}
      >
        {/* Brand Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: isDriver
                  ? "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)"
                  : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                boxShadow: isDriver
                  ? "0 4px 14px rgba(124,58,237,.35)"
                  : "0 4px 14px rgba(249,115,22,.35)",
              }}
            >
              {isDriver ? <Bike size={24} /> : <Building2 size={24} />}
            </div>
            <div>
              <strong style={{ fontSize: "18px", letterSpacing: "-.4px", display: "block" }}>
                {isDriver ? "Portal do Motoboy" : "Painel da Loja"}
              </strong>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                  {activeStore.name}
                </span>
              </div>
            </div>
          </div>

          {/* Troca de Loja / Tenant */}
          <div style={{ textAlign: "right" }}>
            <select
              value={activeStore.id}
              onChange={(e) => handleStoreChange(e.target.value)}
              style={{
                fontSize: "11px",
                padding: "4px 8px",
                borderRadius: "8px",
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                fontWeight: 600,
                cursor: "pointer",
              }}
              title="Alternar loja ativa"
            >
              {Object.values(STORES).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.shortName}
                </option>
              ))}
              {activeStore.id !== "houseburger" && activeStore.id !== "foodpark" && (
                <option value={activeStore.id}>{activeStore.shortName}</option>
              )}
            </select>
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
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              padding: "10px 6px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s ease",
              border: isDriver ? "1px solid #7c3aed" : "1px solid transparent",
              background: isDriver ? "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)" : "transparent",
              color: isDriver ? "#fff" : "var(--muted)",
              boxShadow: isDriver ? "0 4px 14px rgba(124,58,237,.3)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Bike size={16} />
              <span>SOU MOTOBOY</span>
            </div>
            <span style={{ fontSize: "9px", opacity: isDriver ? 0.9 : 0.6, fontWeight: 500 }}>
              Login rápido por PIN
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleChange("admin")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              padding: "10px 6px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
              transition: "all .15s ease",
              border: !isDriver ? "1px solid #ea580c" : "1px solid transparent",
              background: !isDriver ? "linear-gradient(135deg, #f97316 0%, #ea580c 100%)" : "transparent",
              color: !isDriver ? "#fff" : "var(--muted)",
              boxShadow: !isDriver ? "0 4px 14px rgba(249,115,22,.3)" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Building2 size={16} />
              <span>SOU LOJA / ADM</span>
            </div>
            <span style={{ fontSize: "9px", opacity: !isDriver ? 0.9 : 0.6, fontWeight: 500 }}>
              Painel de Gestão
            </span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* FLUXO DO MOTOBOY: LOGIN RÁPIDO COM NOME E PIN DE 4 DÍGITOS     */}
        {/* ============================================================== */}
        {isDriver && !useLegacyEmail && (
          <div>
            {selectedDriver ? (
              /* TELA DE DIGITAÇÃO DO PIN (4 DÍGITOS) */
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid rgba(124,58,237,.25)",
                  borderRadius: "16px",
                  padding: "20px 16px",
                  textAlign: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDriver(null);
                    setPin("");
                    setPinError("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    fontSize: "12px",
                    cursor: "pointer",
                    float: "left",
                    padding: 0,
                    marginBottom: "12px",
                  }}
                >
                  ← Escolher outro nome
                </button>
                <div style={{ clear: "both" }} />

                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: "rgba(124,58,237,.12)",
                    color: "#7c3aed",
                    display: "grid",
                    placeItems: "center",
                    margin: "0 auto 12px",
                    fontSize: "22px",
                    fontWeight: 900,
                  }}
                >
                  {selectedDriver.name.charAt(0).toUpperCase()}
                </div>

                <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "var(--ink)" }}>
                  Olá, {selectedDriver.name}!
                </h3>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "var(--muted)" }}>
                  Digite seu <b>PIN de 4 dígitos</b> definido pela loja para acessar suas corridas:
                </p>

                {/* 4 Caixinhas Visuais de PIN */}
                <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "16px" }}>
                  {[0, 1, 2, 3].map((idx) => {
                    const digit = pin[idx];
                    return (
                      <div
                        key={idx}
                        style={{
                          width: "48px",
                          height: "54px",
                          borderRadius: "12px",
                          border: digit
                            ? "2px solid #7c3aed"
                            : "1px solid var(--line)",
                          background: digit ? "rgba(124,58,237,.06)" : "var(--surface-2)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: "24px",
                          fontWeight: 800,
                          color: "#7c3aed",
                        }}
                      >
                        {digit ? "•" : ""}
                      </div>
                    );
                  })}
                </div>

                {/* Input Invisível para Acionar Teclado Numérico Nativo do Celular */}
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoFocus
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value)}
                  placeholder="PIN"
                  style={{
                    width: "140px",
                    textAlign: "center",
                    fontSize: "20px",
                    letterSpacing: "6px",
                    padding: "8px",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    color: "var(--ink)",
                    outline: "none",
                    fontWeight: 700,
                  }}
                />

                {pinError && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "rgba(239,68,68,.12)",
                      border: "1px solid rgba(239,68,68,.3)",
                      color: "#ef4444",
                      fontSize: "12px",
                    }}
                  >
                    {pinError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={loading || pin.length < 4}
                  onClick={() => handlePinLogin(selectedDriver, pin)}
                  style={{
                    marginTop: "16px",
                    width: "100%",
                    padding: "13px",
                    borderRadius: "12px",
                    border: "none",
                    background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "15px",
                    cursor: pin.length === 4 ? "pointer" : "not-allowed",
                    opacity: pin.length === 4 ? 1 : 0.6,
                    boxShadow: "0 4px 14px rgba(124,58,237,.35)",
                  }}
                >
                  {loading ? "Entrando…" : "Entrar no App"}
                </button>
              </div>
            ) : (
              /* LISTA DE MOTOBOYS DA LOJA (1 TOQUE PARA ESCOLHER) */
              <div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                    Quem é você na equipe?
                  </label>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      borderRadius: "10px",
                      padding: "9px 12px",
                    }}
                  >
                    <Search size={15} color="var(--muted)" />
                    <input
                      type="text"
                      value={driverSearch}
                      onChange={(e) => setDriverSearch(e.target.value)}
                      placeholder="Buscar seu nome..."
                      style={{
                        border: "none",
                        background: "transparent",
                        width: "100%",
                        outline: "none",
                        color: "var(--ink)",
                        fontSize: "13.5px",
                      }}
                    />
                  </div>
                </div>

                {loadingDrivers ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "12px" }}>
                    Carregando equipe de motoboys…
                  </div>
                ) : filteredDrivers.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)", fontSize: "12px" }}>
                    Nenhum motoboy encontrado. Cadastre no painel ou entre com e-mail.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      maxHeight: "260px",
                      overflowY: "auto",
                      paddingRight: "2px",
                      marginBottom: "14px",
                    }}
                  >
                    {filteredDrivers.map((drv) => (
                      <button
                        key={drv.id}
                        type="button"
                        onClick={() => {
                          setSelectedDriver(drv);
                          setPin("");
                          setPinError("");
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "11px 14px",
                          borderRadius: "12px",
                          border: "1px solid var(--line)",
                          background: "var(--surface)",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "background .15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "10px",
                              background: "rgba(124,58,237,.1)",
                              color: "#7c3aed",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 800,
                              fontSize: "14px",
                            }}
                          >
                            <Bike size={18} />
                          </div>
                          <div>
                            <strong style={{ fontSize: "14px", color: "var(--ink)", display: "block" }}>
                              {drv.name}
                            </strong>
                            <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                              {drv.phone || "Toque para digitar seu PIN"}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "#7c3aed",
                            background: "rgba(124,58,237,.08)",
                            padding: "4px 8px",
                            borderRadius: "6px",
                          }}
                        >
                          PIN →
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => setUseLegacyEmail(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      fontSize: "11px",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Entrar com e-mail e senha tradicional
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* FLUXO TRADICIONAL (OU LOJA / ADM): FORMULÁRIO DE ACESSO        */}
        {/* ============================================================== */}
        {(!isDriver || useLegacyEmail) && (
          <div>
            {!isDriver && (
              /* Botão de Destaque Oficial: Entrar com a Takeat */
              <div style={{ marginBottom: "16px" }}>
                <a
                  href="/oauth/authorize"
                  onClick={(e) => {
                    // Se não tiver portal configurado ainda, alerta amigável
                    e.preventDefault();
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
                    textDecoration: "none",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <Store size={18} />
                  <span>Conectar via Takeat Store (1 Clique)</span>
                </a>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "14px 0" }}>
                  <span style={{ flex: 1, height: "1px", background: "var(--line)" }} />
                  <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>
                    ou acesse com e-mail da loja
                  </span>
                  <span style={{ flex: 1, height: "1px", background: "var(--line)" }} />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  {isDriver ? "Usuário ou E-mail" : "E-mail de Acesso da Loja"}
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
                    placeholder={isDriver ? "Digite seu usuário ou e-mail" : "Digite o e-mail da loja"}
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
                    required={!isDriver}
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
                  background: isDriver
                    ? "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)"
                    : "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  boxShadow: isDriver ? "0 4px 16px rgba(124,58,237,.35)" : "0 4px 16px rgba(249,115,22,.35)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Conectando…" : isDriver ? "Entrar como Motoboy" : "Entrar no Painel da Loja"}
              </button>
            </form>

            {isDriver && (
              <div style={{ textAlign: "center", marginTop: "14px" }}>
                <button
                  type="button"
                  onClick={() => setUseLegacyEmail(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#7c3aed",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  ← Voltar para Login rápido por Nome e PIN
                </button>
              </div>
            )}
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
          <CheckCircle2 size={13} color="#16a34a" />
          <span>Isolamento Seguro por Loja · Firebase & Takeat</span>
        </div>
      </section>
    </main>
  );
}
