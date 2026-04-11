"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/auth-context";

export function RoleRouteRedirect({
  studentHref,
  teacherHref,
}: {
  studentHref: string;
  teacherHref: string;
}) {
  const router = useRouter();
  const { role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(role === "student" ? studentHref : teacherHref);
  }, [loading, role, router, studentHref, teacherHref]);

  return (
    <section className="panel">
      <p className="text-sm text-muted">Routing to your role workspace...</p>
    </section>
  );
}
