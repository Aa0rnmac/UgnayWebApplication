"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { UserRole, useAuth } from "@/components/auth-context";

export function RequireRole({
  children,
  fallbackHref,
  role,
  roles,
}: {
  children: React.ReactNode;
  fallbackHref: string;
  role?: UserRole;
  roles?: UserRole[];
}) {
  const router = useRouter();
  const { loading, role: currentRole } = useAuth();
  const allowedRoles = roles && roles.length > 0 ? roles : role ? [role] : [];
  const hasAccess = allowedRoles.includes(currentRole);

  useEffect(() => {
    if (loading || hasAccess) {
      return;
    }

    router.replace(fallbackHref);
  }, [currentRole, fallbackHref, hasAccess, loading, router]);

  if (loading) {
    return (
      <section className="panel">
        <p className="text-sm text-muted">Checking access...</p>
      </section>
    );
  }

  if (!hasAccess) {
    return (
      <section className="panel">
        <p className="text-sm text-muted">Redirecting to the correct workspace...</p>
      </section>
    );
  }

  return <>{children}</>;
}
