import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, firebaseConfigured } from "../services/firebase";
import { getUserProfileRTDB, saveUserProfileRTDB } from "../services/realtimeDbService";
import { getStoredUser, setStoredUser } from "../services/authService";
import type { User } from "../types";

type AuthState = {
  firebaseUser: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  error: string;
};

const initialState: AuthState = {
  firebaseUser: null,
  profile: null,
  loading: firebaseConfigured,
  error: "",
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    // Se Firebase não estiver configurado, usa usuário local se houver
    if (!firebaseConfigured || !auth) {
      const local = getStoredUser();
      setState({
        firebaseUser: null,
        profile: local,
        loading: false,
        error: "",
      });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setStoredUser(null);
        setState({ firebaseUser: null, profile: null, loading: false, error: "" });
        return;
      }

      try {
        // Tenta buscar perfil no Realtime Database
        let profile = await getUserProfileRTDB(firebaseUser.uid);

        if (!profile) {
          // Verifica se temos perfil salvo localmente
          const local = getStoredUser();
          const isOwnerAdmin =
            firebaseUser.email?.toLowerCase() === "gleucedias1@gmail.com" ||
            firebaseUser.email?.toLowerCase() === "houseburgertx@gmail.com" ||
            firebaseUser.email?.toLowerCase().includes("house") ||
            firebaseUser.email?.toLowerCase().includes("burger") ||
            firebaseUser.email?.toLowerCase().includes("admin") ||
            firebaseUser.email?.toLowerCase().includes("loja");

          const role = local?.role || (isOwnerAdmin ? "admin" : "driver");
          const name =
            local?.name ||
            firebaseUser.displayName ||
            firebaseUser.email?.split("@")[0].toUpperCase() ||
            "Usuário";

          profile = {
            id: firebaseUser.uid,
            name,
            email: firebaseUser.email || "",
            phone: local?.phone || "",
            role: role as "admin" | "driver",
            companyId: "house-burger-190",
            active: true,
          };

          // Salva no RTDB para persistência permanente
          await saveUserProfileRTDB(firebaseUser.uid, profile);
        }

        setStoredUser(profile);
        setState({
          firebaseUser,
          profile,
          loading: false,
          error: "",
        });
      } catch (err) {
        console.warn("Erro ao sincronizar perfil do usuário:", err);
        const fallback = getStoredUser();
        setState({
          firebaseUser,
          profile: fallback,
          loading: false,
          error: "",
        });
      }
    });

    return unsubscribe;
  }, []);

  return state;
}
