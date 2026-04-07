"use client";

import { useParams } from "next/navigation";

import { RoleRouteRedirect } from "@/components/role-route-redirect";

export default function ModuleDetailRoutePage() {
  const params = useParams<{ moduleId: string }>();

  return (
    <RoleRouteRedirect
      studentHref={`/student/modules/${params.moduleId}`}
      teacherHref="/teacher/modules"
    />
  );
}
