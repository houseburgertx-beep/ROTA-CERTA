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
import { getActiveStore, getStoreCacheKey } from "./storeService";

const getLocalUserKey = () => getStoreCacheKey("rotacerta_current_user");

export function getStoredUser(): User | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(getLocalUserKey()) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(getLocalUserKey(), JSON.stringify(user));
    } else {
      localStorage.removeItem(getLocalUserKey());
    }
  } catch {}
}

export function normalizeAuthEmail(input: string, role?: "admin" | "driver"): string {
  const clean = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (clean.includes("@")) return clean;
  if (role === "admin") {
    if (clean.includes("house") || clean.includes("burger")) return `${clean}@gmail.com`;
    return `${clean}@houseburger.com`;
  }
  const safeSlug = clean.replace(/[^a-z0-9]/g, "");
  return `${safeSlug}@motoboy.com`;
}

export async function signIn(
  email: string,
  pass: string,
  expectedRole?: "admin" | "driver",
): Promise<User> {
  const cleanEmail = normalizeAuthEmail(email, expectedRole);
  // Para motoboy, se a senha veio vazia, assume a senha padrão da loja "123456"
  const cleanPass = pass.trim() || (expectedRole === "driver" ? "123456" : "");

  if (!cleanEmail || !cleanPass) {
    throw new Error("Informe o e-mail ou nome de usuário e a senha.");
  }

  // 1. Firebase Authentication
  if (firebaseConfigured && auth) {
    try {
      await setPersistence(auth, browserLocalPersistence);

      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
      } catch (signInErr: unknown) {
        const code =
          typeof signInErr === "object" && signInErr && "code" in signInErr
            ? String((signInErr as { code: string }).code)
            : "";

        // Se for motoboy e a conta não existir ou falhar com credenciais inválidas:
        if (
          expectedRole === "driver" &&
          (code === "auth/user-not-found" ||
            code === "auth/invalid-credential" ||
            code === "auth/wrong-password")
        ) {
          try {
            // Cria a conta automaticamente no Firebase Auth com a senha informada (ou padrão 123456)
            credential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
          } catch (createErr: unknown) {
            const createCode =
              typeof createErr === "object" && createErr && "code" in createErr
                ? String((createErr as { code: string }).code)
                : "";
            if (createCode === "auth/email-already-in-use") {
              // Se a conta já existe, tenta autenticar com a senha padrão 123456
              if (cleanPass !== "123456") {
                try {
                  credential = await signInWithEmailAndPassword(auth, cleanEmail, "123456");
                } catch {
                  throw signInErr;
                }
              } else {
                throw signInErr;
              }
            } else {
              throw createErr;
            }
          }
        } else {
          throw signInErr;
        }
      }

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

      const rawUsername = cleanEmail.split("@")[0];
      const rawNormalized = rawUsername
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      let driverName = rawUsername.charAt(0).toUpperCase() + rawUsername.slice(1);
      let driverPhone = "";
      let takeatId: number | string | undefined;

      if (targetRole === "driver") {
        try {
          const { getDriversRTDB, saveDriverRTDB } = await import("./realtimeDbService");
          const existingDrivers = await getDriversRTDB();
          const matched = existingDrivers.find((d) => {
            const dEmail = (d.email || "").toLowerCase().trim();
            const dName = (d.name || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();
            return (
              dEmail === cleanEmail ||
              dEmail.split("@")[0] === rawNormalized ||
              dName === rawNormalized ||
              dName.includes(rawNormalized) ||
              rawNormalized.includes(dName)
            );
          });

          if (matched) {
            driverName = matched.name;
            driverPhone = matched.phone || "";
            takeatId = matched.takeatId;
            if (matched.email?.toLowerCase() !== cleanEmail) {
              await saveDriverRTDB({
                ...matched,
                email: cleanEmail,
              });
            }
          } else {
            await saveDriverRTDB({
              id: `drv-${uid}`,
              name: driverName,
              email: cleanEmail,
              phone: "",
              vehicle: "Moto",
              defaultFee: 7.0,
              active: true,
              companyId: getActiveStore().companyId,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn("Aviso ao vincular motorista no RTDB:", err);
        }
      }

      if (!profile) {
        profile = {
          id: uid,
          name: driverName,
          email: cleanEmail,
          phone: driverPhone,
          role: targetRole,
          companyId: getActiveStore().companyId,
          takeatId,
          active: true,
        };
        await saveUserProfileRTDB(uid, profile);
      } else {
        profile.name = driverName;
        profile.role = targetRole;
        if (takeatId) profile.takeatId = takeatId;
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
    companyId: getActiveStore().companyId,
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
      companyId: getActiveStore().companyId,
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
        companyId: getActiveStore().companyId,
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
    companyId: getActiveStore().companyId,
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

/**
 * Retorna o PIN de 4 dígitos configurado para o motoboy (padrão 1234).
 */
export function getDriverDefaultPin(driver: Driver): string {
  if (driver.pin && driver.pin.trim()) {
    return driver.pin.trim();
  }
  return "1234";
}

/**
 * Valida o PIN de 4 dígitos digitado pelo motoboy.
 * Aceita o PIN cadastrado ou "1234" como padrão garantido.
 */
export function verifyDriverPin(driver: Driver, pinAttempt: string): boolean {
  const clean = pinAttempt.trim();
  if (!clean) return false;
  const configured = driver.pin ? driver.pin.trim() : "1234";
  return clean === configured || clean === "1234";
}

/**
 * Autentica o motoboy diretamente no banco através do Nome e PIN de 4 dígitos.
 */
export async function signInWithDriverPin(driver: Driver, pinAttempt: string): Promise<User> {
  const cleanPin = pinAttempt.trim();
  if (!cleanPin) {
    throw new Error("Digite seu PIN de 4 dígitos.");
  }

  if (!verifyDriverPin(driver, cleanPin)) {
    throw new Error("PIN incorreto. Use o PIN 1234 ou o definido pela loja.");
  }

  const email = driver.email || normalizeAuthEmail(driver.name, "driver");
  const user: User = {
    id: driver.id.replace(/^drv-/, ""),
    name: driver.name,
    email,
    phone: driver.phone,
    role: "driver",
    companyId: driver.companyId || getActiveStore().companyId,
    storeId: getActiveStore().id,
    active: true,
    takeatId: driver.takeatId,
  };

  setStoredUser(user);
  return user;
}

/**
 * Busca motoboy pelo nome (ou seleção) e autentica com o PIN de 4 dígitos
 */
export async function signInDriverByNameAndPin(
  driversList: Driver[],
  driverNameInput: string,
  pinAttempt: string,
): Promise<User> {
  const cleanName = driverNameInput
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (!cleanName) {
    throw new Error("Selecione seu nome de motoboy para entrar.");
  }

  const cleanPin = pinAttempt.trim();
  if (!cleanPin) {
    throw new Error("Digite o PIN de 4 dígitos (padrão: 1234).");
  }

  const matched = driversList.find((d) => {
    if (d.active === false) return false;
    const dNorm = d.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    return dNorm === cleanName || dNorm.includes(cleanName) || cleanName.includes(dNorm);
  });

  if (!matched) {
    throw new Error(`Motoboy "${driverNameInput}" não encontrado. Escolha seu nome na lista.`);
  }

  return signInWithDriverPin(matched, cleanPin);
}

/**
 * Autentica uma loja automaticamente no banco com isolamento por Store ID
 */
export async function signInAsStoreDirect(storeId: string, storeName?: string): Promise<User> {
  const store = getActiveStore();
  const name = storeName || store.name || `Loja ${storeId}`;
  const user: User = {
    id: `store-${storeId}`,
    name,
    email: `loja-${storeId}@takeat.app`,
    phone: store.phone || "",
    role: "admin",
    companyId: storeId,
    storeId,
    active: true,
  };

  setStoredUser(user);
  return user;
}

