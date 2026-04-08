import { RequireRole } from "@/components/require-role";

export default function TeacherWorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <RequireRole fallbackHref="/dashboard" role="teacher">
      {children}
    </RequireRole>
  );
}
