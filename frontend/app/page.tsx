"use client";

import { StudentHome } from "@/components/home/student-home";
import { TeacherHome } from "@/components/home/teacher-home";
import { useAuth } from "@/components/auth-context";

export default function HomePage() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <section className="panel">
        <p className="text-sm text-muted">Resolving account role...</p>
      </section>
    );
  }

  return role === "teacher" ? <TeacherHome /> : <StudentHome />;
}
