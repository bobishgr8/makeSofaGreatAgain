import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { auth } from "../common/firebase";

export type Role = "donor" | "social_worker" | "admin";

type AuthContextValue = {
  user: User | null;
  // From the ID token's custom claims; null while signed out or before a role is chosen.
  role: Role | null;
  approval: string | null;
  loading: boolean;
  logout: () => Promise<void>;
  // Re-read the claims, e.g. after registering picks a role.
  refreshClaims: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [approval, setApproval] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const readClaims = useCallback(async (value: User | null, force = false) => {
    if (!value) {
      setRole(null);
      setApproval(null);
      return;
    }
    try {
      const { claims } = await value.getIdTokenResult(force);
      setRole((claims.role as Role | undefined) ?? null);
      setApproval((claims.approval as string | undefined) ?? null);
    } catch {
      setRole(null);
      setApproval(null);
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (value) => {
        setUser(value);
        await readClaims(value);
        setLoading(false);
      }),
    [readClaims],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        approval,
        loading,
        logout: () => signOut(auth),
        refreshClaims: () => readClaims(auth.currentUser, true),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
