import {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { auth } from "./firebase";

export async function signIn(email: string, password: string) {
  if (!auth) throw new Error("Firebase não está configurado.");
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOut() {
  if (!auth) return;
  await firebaseSignOut(auth);
}

export function friendlyAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
  if (code.includes("invalid-credential")) return "E-mail ou senha incorretos.";
  if (code.includes("too-many-requests")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (code.includes("network-request-failed")) return "Sem conexão. Verifique sua internet e tente novamente.";
  return error instanceof Error ? error.message : "Não foi possível entrar agora.";
}
