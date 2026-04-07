"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { UserRole, useAuth } from "@/components/auth-context";

export function RequireRole({
  children,
  fallbackHref,
  role,
}: {
  children: React.ReactNode;
  fallbackHref: string;
  role: UserRole;
}) {
  const router = useRouter();
  const { loading, role: currentRole } = useAuth();

  useEffect(() => {
    if (loading || currentRole === role) {
      return;
    }

    router.replace(fallbackHref);
  }, [currentRole, fallbackHref, loading, role, router]);

  if (loading) {
    return (
      <section className="panel">
        <p className="text-sm text-muted">Checking access...</p>
      </section>
    );
  }

  if (currentRole !== role) {
    return (
      <section className="panel">
        <p className="text-sm text-muted">Redirecting to the correct workspace...</p>
      </section>
    );
  }

  return <>{children}</>;
}
