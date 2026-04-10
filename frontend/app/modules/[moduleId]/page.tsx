"use client";

import { useParams } from "next/navigation";

import { ModuleDetailViewer } from "@/components/modules/module-detail-viewer";

export default function ModuleDetailPage() {
  const params = useParams<{ moduleId: string }>();

  return (
    <ModuleDetailViewer
      backHref="/modules"
      backLabel="Back To Weekly Sessions"
      headerEyebrow="Student Session"
      headerTitle="Weekly Learning Session"
      moduleId={Number(params.moduleId)}
      storageScope="student-module-detail"
      viewerRole="student"
    />
  );
}
