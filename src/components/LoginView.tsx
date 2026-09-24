import {
  Bike,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  LockKeyhole,
  Mail,
  Route,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { friendlyAuthError, signIn, signOut } from "../services/authService";
import type { User } from "../types";

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
      if (search.includes("role=admin") || search.includes("portal=loja") || search.includes("loja") || hash.includes("loja") || hash.includes("adm")) {
        return "admin";
      }
      if (search.includes("role=driver") || search.includes("portal=motoboy") || search.includes("motoboy") || hash.includes("motoboy")) {
        return "driver";
      }
    }
    return "driver";
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRoleChange = (role: "driver" | "admin") => {
    setSelectedRole(role);
    setError("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("role", role);
      window.history.replaceState(null, "", url.toString());
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await signIn(email, password, selectedRole);
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
                {isDriver ? "Área do Motoboy" : "Área da Loja"}
              </strong>
              <span style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginTop: "2px" }}>
                {isDriver ? "Rota Certa • Suas Corridas" : "Rota Certa • Painel de Controle"}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              color: "#16a34a",
              background: "rgba(34,197,94,.1)",
              padding: "4px 10px",
              borderRadius: "99px",
              fontWeight: 700,
            }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 3px rgba(34,197,94,.2)" }} />
            Online
          </div>
        </div>

        {/* Role Selector Tabs (SEPARAÇÃO TOTAL DE LOGIN) */}
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
              Ver minhas entregas
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
              Gerenciar restaurante
            </span>
          </button>
        </div>

        {/* Dynamic Context Header */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "12px",
            background: isDriver ? "rgba(124,58,237,.08)" : "rgba(249,115,22,.08)",
            border: `1px solid ${isDriver ? "rgba(124,58,237,.2)" : "rgba(249,115,22,.2)"}`,
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 800,
                color: isDriver ? "#7c3aed" : "#ea580c",
                textTransform: "uppercase",
                letterSpacing: ".4px",
              }}
            >
              {isDriver ? "🛵 Espaço Exclusivo do Entregador" : "🏪 Gestão do Restaurante"}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text)", lineHeight: "1.4" }}>
            {isDriver
              ? "Você só verá as corridas atribuídas ao seu nome pelo Takeat ou pela loja. Mapa e ganhos da sua noite."
              : "Painel administrativo para acompanhar todos os pedidos, despachar para os motoboys e sincronizar com o Takeat."}
          </p>
        </div>

        {/* Form */}
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
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 700 }}>Senha de Acesso</label>
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
                lineHeight: "1.4",
              }}
            >
              ⚠️ {error}
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
              transition: "transform .1s ease",
            }}
          >
            {loading ? (
              <span>Conectando ao Firebase…</span>
            ) : (
              <span>{isDriver ? "Entrar como Motoboy 🛵" : "Entrar no Painel da Loja 🏪"}</span>
            )}
          </button>
        </form>

        {/* Quick Switch Link */}
        <div style={{ textAlign: "center", marginTop: "14px" }}>
          <button
            type="button"
            onClick={() => handleRoleChange(isDriver ? "admin" : "driver")}
            style={{
              background: "none",
              border: "none",
              color: isDriver ? "#7c3aed" : "#ea580c",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {isDriver
              ? "🏪 É gerente ou dono da loja? Acessar Portal da Loja / ADM →"
              : "🛵 É entregador / motoboy? Acessar Portal do Motoboy →"}
          </button>
        </div>

        {/* Security & Cloud badge footer */}
        <div
          style={{
            marginTop: "16px",
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
          <span>Banco em Tempo Real · Firebase Auth & RTDB</span>
        </div>
      </section>
    </main>
  );
}
