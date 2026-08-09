import { Bike, Eye, EyeOff, LockKeyhole, Mail, Route } from "lucide-react";
import { useState, type FormEvent } from "react";

import { friendlyAuthError, signIn, signOut } from "../services/authService";

type LoginViewProps = {
  profileError?: string;
  signedInEmail?: string;
};

export function LoginView({ profileError, signedInEmail }: LoginViewProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      await signIn(String(form.get("email")), String(form.get("password")));
    } catch (reason) {
      setError(friendlyAuthError(reason));
    } finally {
      setLoading(false);
    }
  }

  if (profileError) {
    return <main className="auth-shell"><section className="auth-card auth-message"><div className="auth-brandmark"><Route/></div><h1>Acesso pendente</h1><p>{profileError}</p><small>{signedInEmail}</small><button type="button" onClick={()=>void signOut()}>Usar outra conta</button></section></main>;
  }

  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><div className="auth-brandmark"><Route/></div><div><strong>Rota Certa</strong><span>Central inteligente de entregas</span></div></div><div className="auth-copy"><span className="auth-kicker"><Bike/> Operação mobile</span><h1>Entre para começar sua rota.</h1><p>Acesse entregas, mapas e acompanhamento com sua conta de administrador ou entregador.</p></div><form onSubmit={submit}><label>E-mail<div className="auth-input"><Mail/><input name="email" type="email" inputMode="email" autoComplete="email" placeholder="voce@empresa.com" required/></div></label><label>Senha<div className="auth-input"><LockKeyhole/><input name="password" type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Sua senha" minLength={6} required/><button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Ocultar senha":"Mostrar senha"}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="primary auth-submit" type="submit" disabled={loading}>{loading?"Entrando…":"Entrar"}</button></form><p className="auth-help">Contas são criadas pelo administrador do estabelecimento.</p></section></main>;
}
