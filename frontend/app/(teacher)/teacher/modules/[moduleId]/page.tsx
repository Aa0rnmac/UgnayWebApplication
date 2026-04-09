"use client";

import { useParams } from "next/navigation";

import { ModuleDetailViewer } from "@/components/modules/module-detail-viewer";

export default function TeacherModuleDetailPage() {
  const params = useParams<{ moduleId: string }>();

  return (
    <ModuleDetailViewer
      backHref="/teacher/modules"
      backLabel="Back To Modules"
      headerEyebrow="Teacher Module Preview"
      moduleId={Number(params.moduleId)}
      readOnly
      readOnlyNote="Teacher preview only. Lesson browsing here does not save student progress or activity attempts."
      storageScope="teacher-module-detail"
      viewerRole="teacher"
    />
  );
}
