import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { auth } from "../common/firebase";

type Props = {
  children: ReactNode;
  roles?: string[]; // allowed roles
};

export default function ProtectedRoute({ children, roles }: Props) {
  const { user, loading } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (!user) {
        if (mounted) setAuthorized(false);
        return;
      }
      if (!roles || roles.length === 0) {
        if (mounted) setAuthorized(true);
        return;
      }
      try {
        const tokenResult = await auth.currentUser?.getIdTokenResult();
        const claims = tokenResult?.claims ?? {};
        const role = claims.role as string | undefined;
        if (role && roles.includes(role)) {
          if (mounted) setAuthorized(true);
        } else {
          if (mounted) setAuthorized(false);
        }
      } catch (err) {
        if (mounted) setAuthorized(false);
      }
    }
    check();
    return () => {
      mounted = false;
    };
  }, [user, roles]);

  if (loading || authorized === null) return <div>Loading...</div>;
  if (!user || !authorized) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
