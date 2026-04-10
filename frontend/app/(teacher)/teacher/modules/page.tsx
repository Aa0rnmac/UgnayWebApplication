"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  Dispatch,
  FormEvent,
  ReactNode,
  SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { TeacherWorkspaceCard } from "@/components/teacher/workspace-card";
import {
  TeacherModuleCard,
  TeacherModulesCatalog,
  TeacherReportSummary,
  TeacherWeakItem,
  archiveTeacherModule,
  copyTeacherModule,
  createTeacherModule,
  getTeacherModulesCatalog,
  getTeacherReportSummary,
  resolveUploadUrl,
  restoreTeacherModule,
  updateTeacherModule,
  uploadTeacherModuleCover,
} from "@/lib/api";

type EditorState = {
  moduleId: number | null;
  title: string;
  description: string;
  isPublished: boolean;
  isSharedPool: boolean;
  coverFile: File | null;
  coverPreviewUrl: string | null;
};

const EMPTY_EDITOR: EditorState = {
  moduleId: null,
  title: "",
  description: "",
  isPublished: false,
  isSharedPool: false,
  coverFile: null,
  coverPreviewUrl: null,
};

const WEAK_ITEM_PREVIEW_LIMIT = 5;

function getModuleBadge(module: TeacherModuleCard) {
  if (module.module_kind === "system") {
    return `M${String(module.order_index).padStart(2, "0")}`;
  }
  return `C${String(module.id).slice(-2).padStart(2, "0")}`;
}

function getModuleEyebrow(module: TeacherModuleCard) {
  const pieces = [
    module.module_kind === "system" ? "System Template" : "Teacher-Owned",
    module.archived_at ? "Archived" : module.is_published ? "Published" : "Draft",
    `${module.lesson_count} lesson${module.lesson_count === 1 ? "" : "s"}`,
    `${module.activity_count} activit${module.activity_count === 1 ? "y" : "ies"}`,
  ];
  return pieces.join(" | ");
}

function getModuleDescription(module: TeacherModuleCard) {
  if (module.source_module_title) {
    return `${module.description} Source: ${module.source_module_title}.`;
  }
  return module.description;
}

function ownerLabel(module: TeacherModuleCard) {
  if (module.owner_teacher) {
    return module.owner_teacher.full_name;
  }
  return "System Curriculum";
}

function buildEditorFromModule(module: TeacherModuleCard): EditorState {
  return {
    moduleId: module.id,
    title: module.title,
    description: module.description,
    isPublished: module.is_published,
    isSharedPool: module.is_shared_pool,
    coverFile: null,
    coverPreviewUrl: resolveUploadUrl(module.cover_image_url),
  };
}

function SectionEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-black/15 bg-black/5 px-5 py-6">
      <p className="teacher-card-title text-base font-black">{title}</p>
      <p className="teacher-card-copy mt-2 text-sm">{description}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
  countLabel,
  extra,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  countLabel: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandBlue">{eyebrow}</p>
        <h3 className="teacher-panel-heading mt-2 text-2xl font-black">{title}</h3>
        <p className="teacher-panel-copy mt-2 text-sm">{copy}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
          {countLabel}
        </span>
        {extra}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled = false,
  onClick,
  tone = "default",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={[
        "rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition",
        tone === "danger"
          ? "border-red-300 bg-red-500/10 text-red-900 hover:bg-red-500/20"
          : "border-white/60 bg-white/10 text-inherit hover:bg-white/20",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function getWeakItemBadgeLabel(itemsLength: number) {
  if (itemsLength === 0) {
    return "No items";
  }
  return itemsLength > WEAK_ITEM_PREVIEW_LIMIT
    ? `Top ${WEAK_ITEM_PREVIEW_LIMIT}`
    : `Showing ${itemsLength}`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) {
    return "No data";
  }
  return `${value.toFixed(digits)}%`;
}

function getMostAffectedWeakModule(weakItems: TeacherWeakItem[]) {
  if (weakItems.length === 0) {
    return "No module data";
  }

  const moduleMap = new Map<string, { hits: number; worstRate: number }>();
  for (const item of weakItems) {
    const current = moduleMap.get(item.module_title) ?? { hits: 0, worstRate: 0 };
    current.hits += 1;
    current.worstRate = Math.max(current.worstRate, item.wrong_rate_percent);
    moduleMap.set(item.module_title, current);
  }

  const [moduleTitle] = [...moduleMap.entries()].sort((left, right) => {
    if (right[1].hits !== left[1].hits) {
      return right[1].hits - left[1].hits;
    }
    if (right[1].worstRate !== left[1].worstRate) {
      return right[1].worstRate - left[1].worstRate;
    }
    return left[0].localeCompare(right[0]);
  })[0];

  return moduleTitle;
}

function WeakItemSummaryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-black/5 px-3 py-3">
      <p className="teacher-card-kicker text-[11px] uppercase tracking-[0.22em]">{label}</p>
      <p className="teacher-card-title mt-2 text-base font-black">{value}</p>
    </div>
  );
}

function WeakItemsDetailDrawer({
  isOpen,
  onClose,
  weakItems,
}: {
  isOpen: boolean;
  onClose: () => void;
  weakItems: TeacherWeakItem[];
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[220] overflow-y-auto bg-slate-950/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="relative flex min-h-full items-start justify-end p-3 md:p-6">
        <aside
          aria-label="Modules That Need Attention"
          aria-modal="true"
          className="relative w-full max-w-[560px]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[30px] border border-black/10 bg-[#f7f4ef] shadow-2xl md:max-h-[calc(100dvh-3rem)]">
            <div className="border-b border-black/10 bg-[#f7f4ef] px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                    Detail View
                  </p>
                  <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight">
                    Modules That Need Attention
                  </h3>
                  <p className="teacher-card-meta mt-2 text-sm">
                    {weakItems.length} weak item(s) across all active batches and all modules.
                  </p>
                </div>
                <button
                  className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-black/10"
                  onClick={onClose}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {weakItems.length ? (
                <div className="space-y-4">
                  {weakItems.map((item) => (
                    <article
                      key={`${item.activity_key}-${item.item_key}`}
                      className="rounded-[24px] border border-black/10 bg-black/20 px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="teacher-card-title text-base font-black leading-tight">
                            {item.activity_title}
                          </p>
                          <p className="teacher-card-meta mt-2 text-sm">
                            {item.module_title} - {item.attempt_count} attempts
                          </p>
                        </div>
                        <div className="shrink-0 rounded-2xl border border-black/10 bg-white/75 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm">
                          {formatPercent(item.wrong_rate_percent, 2)} wrong rate
                        </div>
                      </div>
                      <p className="teacher-card-copy mt-4 text-base">
                        {item.prompt ?? item.expected_answer ?? item.item_key}
                      </p>
                      <p className="teacher-card-meta mt-3 text-sm">
                        Wrong {item.wrong_count} time(s) across {item.attempt_count} attempts
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                  No weak items were flagged across active batches and modules yet.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body
  );
}

function SharedPoolViewportModal({
  isOpen,
  onClose,
  catalog,
  busyAction,
  onImportShared,
  onImportSystem,
}: {
  isOpen: boolean;
  onClose: () => void;
  catalog: TeacherModulesCatalog | null;
  busyAction: string | null;
  onImportShared: (moduleId: number) => void;
  onImportSystem: (moduleId: number) => void;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const sharedPoolModules = catalog?.shared_pool ?? [];
  const systemTemplateModules = (catalog?.system_templates ?? []).filter(
    (module) => module.is_published
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[230] overflow-y-auto bg-slate-950/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="min-h-full p-2 md:p-4 lg:p-6">
        <section
          aria-label="Available Shared Pool"
          aria-modal="true"
          className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-[1400px] flex-col overflow-hidden rounded-[30px] border border-black/15 bg-[#f7f4ef] shadow-2xl md:h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-3rem)]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <header className="border-b border-black/10 px-5 py-4 md:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
                  Import Modules
                </p>
                <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight md:text-3xl">
                  Available Shared Pool
                </h3>
                <p className="teacher-card-copy mt-2 text-sm">
                  Browse teacher-shared modules and baseline templates, then import what you need into your own module set.
                </p>
              </div>
              <button
                className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-black/10"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
            <div className="space-y-8">
              <section className="space-y-5">
                <SectionHeader
                  copy="These published teacher-owned modules are shared as templates. Import one into your own set to customize it independently."
                  countLabel={`${sharedPoolModules.length} available`}
                  eyebrow="Shared Pool"
                  title="Shared by other teachers"
                />
                {sharedPoolModules.length ? (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {sharedPoolModules.map((module, index) => (
                      <TeacherWorkspaceCard
                        badge={getModuleBadge(module)}
                        ctaLabel="Preview Module"
                        description={getModuleDescription(module)}
                        eyebrow={getModuleEyebrow(module)}
                        footerSlot={
                          <ActionButton
                            disabled={busyAction !== null}
                            onClick={() => onImportShared(module.id)}
                          >
                            Import To My Modules
                          </ActionButton>
                        }
                        href={`/teacher/modules/${module.id}`}
                        key={module.id}
                        mediaImageUrl={resolveUploadUrl(module.cover_image_url)}
                        metadataSlot={
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold uppercase tracking-[0.18em] text-white/85">
                              Shared by {ownerLabel(module)}
                            </p>
                            {module.source_module_title ? (
                              <p className="text-white/80">Based on {module.source_module_title}.</p>
                            ) : null}
                          </div>
                        }
                        themeIndex={index}
                        title={module.title}
                      />
                    ))}
                  </div>
                ) : (
                  <SectionEmpty
                    description="No teacher-shared templates are available yet. Publish one of your own modules to seed the shared pool."
                    title="Shared pool is empty"
                  />
                )}
              </section>

              <section className="space-y-5 border-t border-black/10 pt-8">
                <SectionHeader
                  copy="System templates stay as the baseline curriculum. Copy one into your own set when you want to adapt it under teacher ownership."
                  countLabel={`${systemTemplateModules.length} templates`}
                  eyebrow="System Templates"
                  title="Module templates"
                />
                {systemTemplateModules.length ? (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {systemTemplateModules.map((module, index) => (
                      <TeacherWorkspaceCard
                        badge={getModuleBadge(module)}
                        ctaLabel="Preview Module"
                        description={getModuleDescription(module)}
                        eyebrow={getModuleEyebrow(module)}
                        footerSlot={
                          <ActionButton
                            disabled={busyAction !== null}
                            onClick={() => onImportSystem(module.id)}
                          >
                            Copy As Owned Module
                          </ActionButton>
                        }
                        href={`/teacher/modules/${module.id}`}
                        key={module.id}
                        mediaImageUrl={resolveUploadUrl(module.cover_image_url)}
                        metadataSlot={
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">
                            Baseline curriculum module
                          </p>
                        }
                        themeIndex={index + 2}
                        title={module.title}
                      />
                    ))}
                  </div>
                ) : (
                  <SectionEmpty
                    description="System templates are not available right now."
                    title="No system templates found"
                  />
                )}
              </section>
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

function OwnedModulesViewportModal({
  isOpen,
  onClose,
  loading,
  catalog,
  editor,
  setEditor,
  submitError,
  busyAction,
  onResetEditor,
  onCoverChange,
  onSubmit,
  myActiveModules,
  myArchivedModules,
  onStartEditing,
  onTogglePublish,
  onToggleShare,
  onArchive,
  onRestore,
  onImportShared,
  onImportSystem,
  onOpenModuleCard,
}: {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  catalog: TeacherModulesCatalog | null;
  editor: EditorState;
  setEditor: Dispatch<SetStateAction<EditorState>>;
  submitError: string | null;
  busyAction: string | null;
  onResetEditor: () => void;
  onCoverChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  myActiveModules: TeacherModuleCard[];
  myArchivedModules: TeacherModuleCard[];
  onStartEditing: (module: TeacherModuleCard) => void;
  onTogglePublish: (module: TeacherModuleCard) => void;
  onToggleShare: (module: TeacherModuleCard) => void;
  onArchive: (moduleId: number) => void;
  onRestore: (moduleId: number) => void;
  onImportShared: (moduleId: number) => void;
  onImportSystem: (moduleId: number) => void;
  onOpenModuleCard: (moduleId: number, event?: React.MouseEvent<HTMLElement>) => void;
}) {
  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const sharedPoolModules = catalog?.shared_pool ?? [];
  const systemTemplateModules = (catalog?.system_templates ?? []).filter(
    (module) => module.is_published
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[240] overflow-y-auto bg-slate-950/55 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="min-h-full p-2 md:p-4 lg:p-6">
        <section
          aria-label="My Active Modules"
          aria-modal="true"
          className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-[1500px] flex-col overflow-hidden rounded-[30px] border border-black/15 bg-[#f7f4ef] shadow-2xl md:h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-3rem)]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <header className="border-b border-black/10 px-5 py-4 md:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
                  Module Workspace
                </p>
                <h3 className="teacher-panel-heading mt-1 text-2xl font-black leading-tight md:text-3xl">
                  Manage My Active Modules
                </h3>
                <p className="teacher-card-copy mt-2 text-sm">
                  Create new drafts, update visibility, publish modules for students, and manage archive state in one place.
                </p>
              </div>
              <button
                className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-black/10"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-6">
              <div className="panel order-2 space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brandGreen">
                      {editor.moduleId === null ? "New Draft Module" : "Edit Owned Module"}
                    </p>
                    <h3 className="teacher-panel-heading mt-2 text-2xl font-black">
                      {editor.moduleId === null ? "Create a teacher-owned module card" : "Update module metadata and publishing state"}
                    </h3>
                    <p className="teacher-panel-copy mt-2 text-sm">
                      Build from scratch, or import from templates and update module metadata, cover image, and visibility.
                    </p>
                  </div>
                  {editor.moduleId !== null ? (
                    <button
                      className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition"
                      onClick={onResetEditor}
                      type="button"
                    >
                      Switch To New Draft
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr] lg:items-start">
                  <form className="space-y-4" onSubmit={onSubmit}>
                    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                      <label className="flex w-full flex-col gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandBlue">
                          Module Title
                        </span>
                        <input
                          className="teacher-card-control h-11 w-full"
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, title: event.target.value }))
                          }
                          placeholder="Ex. Teacher Review Set: Numbers Warm-Up"
                          value={editor.title}
                        />
                      </label>

                      <label className="flex w-full flex-col gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brandGreen">
                          Description
                        </span>
                        <textarea
                          className="teacher-card-control min-h-[92px] w-full resize-none"
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, description: event.target.value }))
                          }
                          placeholder="Describe the focus of this module set and how it should be used."
                          rows={3}
                          value={editor.description}
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] lg:items-end">
                      <label className="flex w-full flex-col gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accentWarm">
                          Cover Image
                        </span>
                        <input
                          accept=".png,.jpg,.jpeg,.webp"
                          className="block w-full text-sm"
                          onChange={onCoverChange}
                          type="file"
                        />
                      </label>

                      <div className="rounded-[24px] border border-dashed border-black/10 bg-white/60 p-3">
                        {editor.coverPreviewUrl ? (
                          <img
                            alt="Module cover preview"
                            className="h-28 w-full rounded-[18px] object-cover"
                            src={editor.coverPreviewUrl}
                          />
                        ) : (
                          <div className="flex h-28 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#ece51e] to-[#f7f3a3] text-center text-sm font-semibold text-slate-700">
                            Cover preview appears here
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="teacher-card-copy flex items-center gap-3 text-sm font-semibold">
                        <input
                          checked={editor.isPublished}
                          onChange={(event) =>
                            setEditor((current) => ({
                              ...current,
                              isPublished: event.target.checked,
                              isSharedPool: event.target.checked ? current.isSharedPool : false,
                            }))
                          }
                          type="checkbox"
                        />
                        Publish to my students
                      </label>

                      <label className="teacher-card-copy flex items-center gap-3 text-sm font-semibold">
                        <input
                          checked={editor.isSharedPool}
                          onChange={(event) =>
                            setEditor((current) => ({
                              ...current,
                              isSharedPool: event.target.checked,
                              isPublished: event.target.checked ? true : current.isPublished,
                            }))
                          }
                          type="checkbox"
                        />
                        Share to the teacher pool
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        className="rounded-full bg-brandBlue px-4 py-2 text-xs font-semibold text-white transition hover:bg-brandBlue/90"
                        disabled={busyAction !== null}
                        type="submit"
                      >
                        {busyAction !== null && (busyAction === "create" || busyAction?.startsWith("save-"))
                          ? "Saving..."
                          : editor.moduleId === null
                            ? "Create Draft Module"
                            : "Save Module"}
                      </button>
                      {editor.moduleId !== null ? (
                        <Link
                          className="teacher-card-ghost-button rounded-full border px-4 py-2 text-xs font-semibold transition"
                          href={`/teacher/modules/${editor.moduleId}`}
                        >
                          Preview Module
                        </Link>
                      ) : null}
                    </div>
                  </form>

                  <aside className="space-y-4 rounded-[28px] border border-black/10 bg-black/5 p-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accentWarm">
                        Import Sources
                      </p>
                      <h4 className="teacher-panel-heading mt-2 text-xl font-black">
                        Shared Modules And Templates
                      </h4>
                      <p className="teacher-panel-copy mt-2 text-sm">
                        Import from other teachers or system templates, then edit and publish from this workspace.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brandBlue">
                          Shared Pool
                        </p>
                        <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                          {sharedPoolModules.length}
                        </span>
                      </div>
                      {sharedPoolModules.length ? (
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {sharedPoolModules.map((module) => (
                            <div
                              className="rounded-2xl border border-black/10 bg-white/80 px-3 py-3"
                              key={`owned-modal-shared-${module.id}`}
                            >
                              <p className="teacher-card-title text-sm font-black leading-tight">{module.title}</p>
                              <p className="teacher-card-meta mt-1 text-xs">Shared by {ownerLabel(module)}</p>
                              <div className="mt-2 flex justify-end">
                                <ActionButton
                                  disabled={busyAction !== null}
                                  onClick={() => onImportShared(module.id)}
                                >
                                  Import
                                </ActionButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <SectionEmpty
                          description="No teacher-shared modules available right now."
                          title="Shared pool is empty"
                        />
                      )}
                    </div>

                    <div className="space-y-3 border-t border-black/10 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brandGreen">
                          System Templates
                        </p>
                        <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                          {systemTemplateModules.length}
                        </span>
                      </div>
                      {systemTemplateModules.length ? (
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                          {systemTemplateModules.map((module) => (
                            <div
                              className="rounded-2xl border border-black/10 bg-white/80 px-3 py-3"
                              key={`owned-modal-template-${module.id}`}
                            >
                              <p className="teacher-card-title text-sm font-black leading-tight">{module.title}</p>
                              <p className="teacher-card-meta mt-1 text-xs">System baseline template</p>
                              <div className="mt-2 flex justify-end">
                                <ActionButton
                                  disabled={busyAction !== null}
                                  onClick={() => onImportSystem(module.id)}
                                >
                                  Copy
                                </ActionButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <SectionEmpty
                          description="System templates are not available right now."
                          title="No templates found"
                        />
                      )}
                    </div>
                  </aside>
                </div>

                {submitError ? <p className="text-sm text-red-700">Error: {submitError}</p> : null}
              </div>

              <div className="order-1 space-y-5">
                <SectionHeader
                  copy="These modules belong to you. Publish them for your students, share them for other teachers to copy, or archive them without losing historical attribution."
                  countLabel={`${myActiveModules.length} active`}
                  eyebrow="My Modules"
                  extra={
                    myArchivedModules.length ? (
                      <span className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                        {myArchivedModules.length} archived
                      </span>
                    ) : null
                  }
                  title="Owned module management"
                />

                {loading && myActiveModules.length === 0 ? (
                  <div className="panel">
                    <p className="teacher-panel-copy text-sm">Loading teacher module workspace...</p>
                  </div>
                ) : myActiveModules.length ? (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {myActiveModules.map((module, index) => (
                      <div
                        className="h-full cursor-pointer"
                        key={module.id}
                        onClick={(event) => onOpenModuleCard(module.id, event)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenModuleCard(module.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <TeacherWorkspaceCard
                          badge={getModuleBadge(module)}
                          ctaLabel="Preview Module"
                          description={getModuleDescription(module)}
                          eyebrow={getModuleEyebrow(module)}
                          footerSlot={
                            <>
                              <ActionButton
                                disabled={busyAction !== null}
                                onClick={() => onStartEditing(module)}
                              >
                                Edit
                              </ActionButton>
                              <ActionButton
                                disabled={busyAction !== null}
                                onClick={() => onTogglePublish(module)}
                              >
                                {module.is_published ? "Unpublish" : "Publish"}
                              </ActionButton>
                              <ActionButton
                                disabled={busyAction !== null}
                                onClick={() => onToggleShare(module)}
                              >
                                {module.is_shared_pool ? "Unshare" : "Share"}
                              </ActionButton>
                              <ActionButton
                                disabled={busyAction !== null}
                                onClick={() => onArchive(module.id)}
                                tone="danger"
                              >
                                Archive
                              </ActionButton>
                            </>
                          }
                          href={`/teacher/modules/${module.id}`}
                          mediaImageUrl={resolveUploadUrl(module.cover_image_url)}
                          metadataSlot={
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold uppercase tracking-[0.18em] text-white/85">
                                Owner: {ownerLabel(module)}
                              </p>
                              <p className="text-white/80">
                                {module.is_shared_pool ? "Visible in shared pool." : "Private to your set."}
                              </p>
                            </div>
                          }
                          themeIndex={index}
                          title={module.title}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <SectionEmpty
                    description="Create your first draft module or import one from the shared pool and templates."
                    title="No owned modules yet"
                  />
                )}

                {myArchivedModules.length ? (
                  <div className="space-y-4">
                    <SectionHeader
                      copy="Archived modules stay out of the student flow, but can be restored later."
                      countLabel={`${myArchivedModules.length} archived`}
                      eyebrow="Archived"
                      title="Restore past modules"
                    />
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {myArchivedModules.map((module, index) => (
                        <TeacherWorkspaceCard
                          badge={getModuleBadge(module)}
                          description={getModuleDescription(module)}
                          eyebrow={getModuleEyebrow(module)}
                          footerSlot={
                            <ActionButton
                              disabled={busyAction !== null}
                              onClick={() => onRestore(module.id)}
                            >
                              Restore Draft
                            </ActionButton>
                          }
                          key={module.id}
                          mediaImageUrl={resolveUploadUrl(module.cover_image_url)}
                          metadataSlot={
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">
                              Owner: {ownerLabel(module)}
                            </p>
                          }
                          themeIndex={index + 1}
                          title={module.title}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}

export default function TeacherModulesPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<TeacherModulesCatalog | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [overviewSummary, setOverviewSummary] = useState<TeacherReportSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isWeakItemsDrawerOpen, setIsWeakItemsDrawerOpen] = useState(false);
  const [isSharedPoolViewportOpen, setIsSharedPoolViewportOpen] = useState(false);
  const [isOwnedModulesViewportOpen, setIsOwnedModulesViewportOpen] = useState(false);

  const loadCatalog = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const nextCatalog = await getTeacherModulesCatalog();
      setCatalog(nextCatalog);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load teacher modules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        setSummaryLoading(true);
        setSummaryError(null);
        const nextSummary = await getTeacherReportSummary();
        if (!isActive) {
          return;
        }
        setOverviewSummary(nextSummary);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setSummaryError(error instanceof Error ? error.message : "Unable to load module attention data.");
      } finally {
        if (isActive) {
          setSummaryLoading(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const myActiveModules = useMemo(
    () => catalog?.my_modules.filter((module) => !module.archived_at) ?? [],
    [catalog]
  );
  const myArchivedModules = useMemo(
    () => catalog?.my_modules.filter((module) => Boolean(module.archived_at)) ?? [],
    [catalog]
  );
  const weakItems = overviewSummary?.weak_items ?? [];

  useEffect(() => {
    if (!isWeakItemsDrawerOpen && !isSharedPoolViewportOpen && !isOwnedModulesViewportOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWeakItemsDrawerOpen(false);
        setIsSharedPoolViewportOpen(false);
        setIsOwnedModulesViewportOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOwnedModulesViewportOpen, isSharedPoolViewportOpen, isWeakItemsDrawerOpen]);

  const resetEditor = () => {
    setEditor(EMPTY_EDITOR);
    setSubmitError(null);
  };

  const startEditing = (module: TeacherModuleCard) => {
    setEditor(buildEditorFromModule(module));
    setSubmitError(null);
  };

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setEditor((current) => ({
      ...current,
      coverFile: file,
      coverPreviewUrl: file ? URL.createObjectURL(file) : current.coverPreviewUrl,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor.title.trim() || !editor.description.trim()) {
      setSubmitError("Title and description are required.");
      return;
    }

    setBusyAction(editor.moduleId === null ? "create" : `save-${editor.moduleId}`);
    setSubmitError(null);
    try {
      let savedModule: TeacherModuleCard;
      if (editor.moduleId === null) {
        savedModule = await createTeacherModule({
          title: editor.title.trim(),
          description: editor.description.trim(),
        });
      } else {
        savedModule = await updateTeacherModule(editor.moduleId, {
          title: editor.title.trim(),
          description: editor.description.trim(),
          is_published: editor.isPublished,
          is_shared_pool: editor.isSharedPool,
        });
      }

      if (editor.coverFile) {
        savedModule = await uploadTeacherModuleCover(savedModule.id, editor.coverFile);
      }

      if (editor.moduleId === null && (editor.isPublished || editor.isSharedPool)) {
        await updateTeacherModule(savedModule.id, {
          is_published: editor.isPublished,
          is_shared_pool: editor.isSharedPool,
        });
      }

      await loadCatalog();
      setEditor(
        editor.moduleId === null ? EMPTY_EDITOR : buildEditorFromModule(savedModule)
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to save module.");
    } finally {
      setBusyAction(null);
    }
  };

  const runModuleAction = async (actionKey: string, action: () => Promise<unknown>) => {
    setBusyAction(actionKey);
    setPageError(null);
    try {
      await action();
      await loadCatalog();
      if (editor.moduleId !== null) {
        const updatedCatalog = await getTeacherModulesCatalog();
        setCatalog(updatedCatalog);
        const editedModule = updatedCatalog.my_modules.find((module) => module.id === editor.moduleId);
        setEditor(editedModule ? buildEditorFromModule(editedModule) : EMPTY_EDITOR);
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to update module.");
    } finally {
      setBusyAction(null);
    }
  };

  const openModuleCard = (moduleId: number, event?: React.MouseEvent<HTMLElement>) => {
    if (event) {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, select, textarea, label")) {
        return;
      }
    }
    router.push(`/teacher/modules/${moduleId}`);
  };

  return (
    <section className="space-y-6">
      <div className="panel overflow-hidden">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
          Teacher Modules
        </p>
        <h2 className="teacher-panel-heading mt-3 text-4xl font-black tracking-tight">
          Build your own module set, reuse shared lesson templates, and decide which teacher-owned
          modules students can see.
        </h2>
        <p className="teacher-panel-copy mt-3 max-w-3xl text-sm leading-relaxed">
          System modules stay as the baseline curriculum. Your owned modules can stay private,
          publish to your students, or be shared to the teacher pool for others to copy.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <button
              className={[
                "panel block w-full text-left transition hover:-translate-y-[2px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue focus-visible:ring-offset-2",
                myActiveModules.length === 0
                  ? "border-red-300 bg-red-50/90 text-red-950 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
                  : "",
              ].join(" ")}
              onClick={() => setIsOwnedModulesViewportOpen(true)}
              type="button"
            >
              <p
                className={[
                  "text-xs font-semibold uppercase tracking-[0.3em]",
                  myActiveModules.length === 0 ? "text-red-700" : "text-accent",
                ].join(" ")}
              >
                My Active Modules
              </p>
              <p
                className={[
                  "teacher-panel-value mt-3 text-4xl font-black",
                  myActiveModules.length === 0 ? "text-red-700" : "",
                ].join(" ")}
              >
                {myActiveModules.length}
              </p>
              <p
                className={[
                  "teacher-panel-copy mt-2 text-sm",
                  myActiveModules.length === 0 ? "text-red-800" : "",
                ].join(" ")}
              >
                {myActiveModules.length === 0
                  ? "No active modules yet. Click to create your first draft module."
                  : "Click to open your module workspace to create drafts, publish, share, or archive modules."}
              </p>
            </button>
            <button
              className="panel block w-full text-left transition hover:-translate-y-[2px] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brandBlue focus-visible:ring-offset-2"
              onClick={() => setIsSharedPoolViewportOpen(true)}
              type="button"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accentWarm">Available Shared Pool</p>
              <p className="teacher-panel-value mt-3 text-4xl font-black">{catalog?.shared_pool.length ?? 0}</p>
              <p className="teacher-panel-copy mt-2 text-sm">
                Click to open a full-view importer for shared modules and module templates.
              </p>
            </button>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accentWarm">
              MODULES THAT NEED ATTENTION
            </p>
            <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              {getWeakItemBadgeLabel(weakItems.length)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <WeakItemSummaryStat label="Weak Items" value={`${weakItems.length}`} />
            <WeakItemSummaryStat
              label="Worst Wrong Rate"
              value={weakItems[0] ? formatPercent(weakItems[0].wrong_rate_percent, 2) : "No data"}
            />
            <WeakItemSummaryStat
              label="Most Affected Module"
              value={getMostAffectedWeakModule(weakItems)}
            />
          </div>

          {summaryLoading ? (
            <div className="teacher-card-copy mt-4 rounded-2xl border border-black/10 bg-black/5 px-4 py-4 text-sm">
              Refreshing module attention summary...
            </div>
          ) : null}

          {summaryError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              Error: {summaryError}
            </div>
          ) : null}

          <div className="relative mt-4">
            {weakItems.length ? (
              <>
                <div className="space-y-3">
                  {weakItems.slice(0, WEAK_ITEM_PREVIEW_LIMIT).map((item) => (
                    <div
                      key={`${item.activity_key}-${item.item_key}`}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="teacher-card-title truncate text-sm font-black">
                            {item.activity_title}
                          </p>
                          <p className="teacher-card-meta mt-1 truncate text-xs">{item.module_title}</p>
                        </div>
                        <div className="shrink-0 rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                          {formatPercent(item.wrong_rate_percent, 2)}
                        </div>
                      </div>
                      <p className="teacher-card-copy mt-2 line-clamp-2 text-sm">
                        {item.prompt ?? item.expected_answer ?? item.item_key}
                      </p>
                      <p className="teacher-card-meta mt-2 text-xs">
                        Wrong {item.wrong_count} time(s) - {item.attempt_count} attempts
                      </p>
                    </div>
                  ))}
                </div>
                {weakItems.length > WEAK_ITEM_PREVIEW_LIMIT ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/95 to-white/0" />
                ) : null}
              </>
            ) : (
              <div className="teacher-card-copy rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm">
                No weak items were flagged across active batches and modules yet. Weak items appear
                after at least 5 attempts and a 40% wrong rate.
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/5 pt-4">
            <p className="teacher-card-meta text-xs">Click to open full weak-item details.</p>
            <button
              className="inline-flex rounded-full border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={summaryLoading || !!summaryError || weakItems.length === 0}
              onClick={() => setIsWeakItemsDrawerOpen(true)}
              type="button"
            >
              View all weak items
            </button>
          </div>
        </div>
      </div>

      {pageError ? (
        <div className="panel">
          <p className="text-sm text-red-700">Error: {pageError}</p>
        </div>
      ) : null}

      <WeakItemsDetailDrawer
        isOpen={isWeakItemsDrawerOpen}
        onClose={() => setIsWeakItemsDrawerOpen(false)}
        weakItems={weakItems}
      />
      <SharedPoolViewportModal
        busyAction={busyAction}
        catalog={catalog}
        isOpen={isSharedPoolViewportOpen}
        onClose={() => setIsSharedPoolViewportOpen(false)}
        onImportShared={(moduleId) =>
          void runModuleAction(`copy-shared-${moduleId}`, () => copyTeacherModule(moduleId))
        }
        onImportSystem={(moduleId) =>
          void runModuleAction(`copy-system-${moduleId}`, () => copyTeacherModule(moduleId))
        }
      />
      <OwnedModulesViewportModal
        busyAction={busyAction}
        catalog={catalog}
        editor={editor}
        isOpen={isOwnedModulesViewportOpen}
        loading={loading}
        myActiveModules={myActiveModules}
        myArchivedModules={myArchivedModules}
        onArchive={(moduleId) =>
          void runModuleAction(`archive-${moduleId}`, () => archiveTeacherModule(moduleId))
        }
        onClose={() => setIsOwnedModulesViewportOpen(false)}
        onCoverChange={handleCoverChange}
        onOpenModuleCard={openModuleCard}
        onResetEditor={resetEditor}
        onRestore={(moduleId) =>
          void runModuleAction(`restore-${moduleId}`, () => restoreTeacherModule(moduleId))
        }
        onImportShared={(moduleId) =>
          void runModuleAction(`copy-shared-${moduleId}`, () => copyTeacherModule(moduleId))
        }
        onImportSystem={(moduleId) =>
          void runModuleAction(`copy-system-${moduleId}`, () => copyTeacherModule(moduleId))
        }
        onStartEditing={startEditing}
        onSubmit={handleSubmit}
        onTogglePublish={(module) =>
          void runModuleAction(`publish-${module.id}`, () =>
            updateTeacherModule(module.id, {
              is_published: !module.is_published,
              is_shared_pool: module.is_published ? false : module.is_shared_pool,
            })
          )
        }
        onToggleShare={(module) =>
          void runModuleAction(`share-${module.id}`, () =>
            updateTeacherModule(module.id, {
              is_shared_pool: !module.is_shared_pool,
              is_published: !module.is_shared_pool ? true : module.is_published,
            })
          )
        }
        setEditor={setEditor}
        submitError={submitError}
      />
    </section>
  );
}
