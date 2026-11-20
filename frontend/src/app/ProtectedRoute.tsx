import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";

type Props = {
  children: ReactNode;
  roles?: string[];
  requireApproval?: boolean;
};

export default function ProtectedRoute({
  children,
  roles,
  requireApproval = false,
}: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  const [authorized, setAuthorized] =
    useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAuthorization() {
      if (!user) {
        if (mounted) setAuthorized(false);
        return;
      }

      try {
        // Claims (role, approval) live in the ID token, which Firebase caches
        // for up to an hour. When the cached token says no, fetch a fresh one
        // once: an admin may just have assigned the role or approved the account.
        const allowed = (claims: Record<string, unknown>) => {
          const role = claims.role as string | undefined;
          const approval = claims.approval as string | undefined;
          if (roles && roles.length > 0 && (!role || !roles.includes(role))) {
            return false;
          }
          return !(requireApproval && role === "social_worker" && approval !== "approved");
        };

        let ok = allowed((await user.getIdTokenResult()).claims);
        if (!ok) ok = allowed((await user.getIdTokenResult(true)).claims);

        if (mounted) setAuthorized(ok);
      } catch (err) {
        console.error(
          "Authorization check failed:",
          err,
        );

        if (mounted) {
          setAuthorized(false);
        }
      }
    }

    checkAuthorization();

    return () => {
      mounted = false;
    };
  }, [user, roles, requireApproval]);

  if (loading || authorized === null) {
    return <div>Loading...</div>;
  }

  // Not authenticated
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  // Authenticated but insufficient permissions
  if (!authorized) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}