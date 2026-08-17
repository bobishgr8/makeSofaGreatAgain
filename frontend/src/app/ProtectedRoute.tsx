import { ReactNode, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
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
        const tokenResult =
          await user.getIdTokenResult();

        const role =
          tokenResult.claims.role as string | undefined;

        const approval =
          tokenResult.claims.approval as string | undefined;

        console.log("===== ROUTE AUTH =====");
        console.log("UID:", user.uid);
        console.log("Role:", role);
        console.log("Approval:", approval);
        console.log("Allowed roles:", roles);
        console.log("======================");

        // Check role
        if (
          roles &&
          roles.length > 0 &&
          (!role || !roles.includes(role))
        ) {
          if (mounted) setAuthorized(false);
          return;
        }

        // Social workers may additionally require admin approval
        if (
          requireApproval &&
          role === "social_worker" &&
          approval !== "approved"
        ) {
          if (mounted) setAuthorized(false);
          return;
        }

        if (mounted) {
          setAuthorized(true);
        }
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
    return <Navigate to="/login" replace />;
  }

  // Authenticated but insufficient permissions
  if (!authorized) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}