import { RoleRouteRedirect } from "@/components/role-route-redirect";

export default function ModulesRoutePage() {
  return <RoleRouteRedirect studentHref="/student/modules" teacherHref="/teacher/modules" />;
}
