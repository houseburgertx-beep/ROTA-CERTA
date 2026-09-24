import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth, firebaseConfigured } from "./firebase";
import { getUserProfileRTDB, saveUserProfileRTDB, saveDriverRTDB } from "./realtimeDbService";
import type { User, Driver } from "../types";

const LOCAL_USER_KEY = "rotacerta_current_user";

export function getStoredUser(): User | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LOCAL_USER_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_USER_KEY);
    }
  } catch {}
}

export function normalizeAuthEmail(input: string, role?: "admin" | "driver"): string {
  const clean = input.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  if (role === "admin") {
    if (clean.includes("house") || clean.includes("burger")) return `${clean}@gmail.com`;
    return `${clean}@houseburger.com`;
  }
  return `${clean}@motoboy.com`;
}

export async function signIn(
  email: string,
  pass: string,
  expectedRole?: "admin" | "driver",
): Promise<User> {
  const cleanEmail = normalizeAuthEmail(email, expectedRole);
  const cleanPass = pass.trim();

  if (!cleanEmail || !cleanPass) {
    throw new Error("Informe o e-mail ou nome de usuário e a senha.");
  }

  // 1. Firebase Authentication
  if (firebaseConfigured && auth) {
    try {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      const uid = credential.user.uid;

      // Busca ou cria o perfil
      let profile = await getUserProfileRTDB(uid);
      const isOwnerAdmin =
        cleanEmail === "gleucedias1@gmail.com" ||
        cleanEmail === "houseburgertx@gmail.com" ||
        cleanEmail.includes("house") ||
        cleanEmail.includes("burger") ||
        cleanEmail.includes("admin") ||
        cleanEmail.includes("loja");
      const targetRole = expectedRole || (isOwnerAdmin ? "admin" : "driver");

      if (!profile) {
        profile = {
          id: uid,
          name: cleanEmail.split("@")[0].toUpperCase(),
          email: cleanEmail,
          phone: "",
          role: targetRole,
          companyId: "house-burger-190",
          active: true,
        };
        await saveUserProfileRTDB(uid, profile);
      } else if (expectedRole && profile.role !== expectedRole) {
        // Atualiza a role se o usuário selecionou explicitamente a aba correspondente
        profile.role = expectedRole;
        await saveUserProfileRTDB(uid, profile);
      }

      setStoredUser(profile);
      return profile;
    } catch (e: unknown) {
      // Re-lança erro legível do Firebase
      throw e;
    }
  }

  // Fallback offline (se Firebase não estiver acessível)
  const isOwnerAdmin =
    cleanEmail === "gleucedias1@gmail.com" ||
    cleanEmail === "houseburgertx@gmail.com" ||
    cleanEmail.includes("house") ||
    cleanEmail.includes("burger") ||
    cleanEmail.includes("admin") ||
    cleanEmail.includes("loja");
  const role = expectedRole || (isOwnerAdmin ? "admin" : "driver");

  const offlineUser: User = {
    id: `usr-${Date.now()}`,
    name: cleanEmail.split("@")[0].toUpperCase(),
    email: cleanEmail,
    phone: "",
    role,
    companyId: "house-burger-190",
    active: true,
  };
  setStoredUser(offlineUser);
  return offlineUser;
}

export async function signUp(
  email: string,
  pass: string,
  name: string,
  role: "admin" | "driver",
  phone = "",
): Promise<User> {
  const cleanEmail = normalizeAuthEmail(email, role);
  const cleanPass = pass.trim();
  const cleanName = name.trim();

  if (!cleanEmail || !cleanPass) {
    throw new Error("Informe e-mail e senha.");
  }
  if (cleanPass.length < 6) {
    throw new Error("A senha precisa ter no mínimo 6 dígitos.");
  }
  if (!cleanName) {
    throw new Error("Informe seu nome ou nome do estabelecimento.");
  }

  if (firebaseConfigured && auth) {
    await setPersistence(auth, browserLocalPersistence);
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
    } catch (err: unknown) {
      const code = typeof err === "object" && err && "code" in err ? String(err.code) : "";
      if (code === "auth/email-already-in-use") {
        // Caso a conta já tenha sido criada no Firebase Auth (ex: tentativa anterior onde o banco falhou)
        // Autentica com a mesma senha e atualiza os dados no banco
        credential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      } else {
        throw err;
      }
    }

    const uid = credential.user.uid;

    const profile: User = {
      id: uid,
      name: cleanName,
      email: cleanEmail,
      phone,
      role,
      companyId: "house-burger-190",
      active: true,
    };

    await saveUserProfileRTDB(uid, profile);

    // Se for motoboy, cadastra automaticamente na equipe da loja no Realtime Database
    if (role === "driver") {
      const driverRecord: Driver = {
        id: `drv-${uid}`,
        name: cleanName,
        email: cleanEmail,
        phone,
        vehicle: "Moto",
        defaultFee: 7.0,
        active: true,
        companyId: "house-burger-190",
        createdAt: new Date().toISOString(),
      };
      await saveDriverRTDB(driverRecord);
    }

    setStoredUser(profile);
    return profile;
  }

  const fallbackUser: User = {
    id: `usr-${Date.now()}`,
    name: cleanName,
    email: cleanEmail,
    phone,
    role,
    companyId: "house-burger-190",
    active: true,
  };
  setStoredUser(fallbackUser);
  return fallbackUser;
}

export async function signOut() {
  setStoredUser(null);
  if (auth) {
    try {
      await firebaseSignOut(auth);
    } catch {}
  }
}

export function friendlyAuthError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) {
    return "E-mail ou senha incorretos.";
  }
  if (code.includes("user-not-found")) {
    return "Nenhuma conta cadastrada com esse e-mail.";
  }
  if (code.includes("email-already-in-use")) {
    return "Este e-mail já está cadastrado. Faça login ou use outro e-mail.";
  }
  if (code.includes("weak-password")) {
    return "Senha muito fraca. Digite ao menos 6 caracteres.";
  }
  if (code.includes("invalid-email")) {
    return "E-mail inválido. Verifique o formato digitado.";
  }
  if (code.includes("too-many-requests")) {
    return "Muitas tentativas bloqueadas temporariamente. Aguarde alguns instantes.";
  }
  if (code.includes("network-request-failed")) {
    return "Sem conexão com a internet. Verifique sua rede.";
  }
  return error instanceof Error ? error.message : "Não foi possível concluir o acesso.";
}
