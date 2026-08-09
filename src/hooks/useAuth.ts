import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

import { auth, db, firebaseConfigured } from "../services/firebase";
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
    if (!firebaseConfigured || !auth || !db) {
      setState({ ...initialState, loading: false });
      return;
    }
    const firestore = db;

    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ firebaseUser: null, profile: null, loading: false, error: "" });
        return;
      }
      try {
        const snapshot = await getDoc(doc(firestore, "users", firebaseUser.uid));
        if (!snapshot.exists()) {
          setState({
            firebaseUser,
            profile: null,
            loading: false,
            error: "Sua conta ainda não possui um perfil de acesso.",
          });
          return;
        }
        setState({
          firebaseUser,
          profile: { id: snapshot.id, ...snapshot.data() } as User,
          loading: false,
          error: "",
        });
      } catch {
        setState({
          firebaseUser,
          profile: null,
          loading: false,
          error: "Não foi possível carregar seu perfil.",
        });
      }
    });
  }, []);

  return state;
}
