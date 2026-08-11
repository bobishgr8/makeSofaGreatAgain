import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { auth } from "../common/firebase";

type AuthContextValue = { user: User | null; loading: boolean; logout: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, value => { setUser(value); setLoading(false); }), []);
  return <AuthContext.Provider value={{ user, loading, logout: () => signOut(auth) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
