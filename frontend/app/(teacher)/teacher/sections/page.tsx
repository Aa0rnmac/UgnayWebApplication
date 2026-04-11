"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  createTeacherModuleItem,
  createTeacherSectionModule,
  getTeacherCertificateTemplates,
  getTeacherSection,
  getTeacherSectionModules,
  getTeacherSections,
  type LmsSection,
  type TeacherSectionModule,
  type TeacherSectionSummary,
  uploadTeacherCertificateTemplate,
  uploadTeacherModuleItemResource,
  updateTeacherModule
} from "@/lib/api";

const ITEM_TYPES = [
  "readable",
  "video_resource",
  "document_resource",
  "interactive_resource",
  "external_link_resource",
  "multiple_choice_assessment",
  "identification_assessment",
  "signing_lab_assessment"
] as const;

export default function TeacherSectionsPage() {
  const params = useSearchParams();
  const sectionQuery = params.get("section");
  const [sections, setSections] = useState<TeacherSectionSummary[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState(sectionQuery ?? "");
  const [selectedSection, setSelectedSection] = useState<LmsSection | null>(null);
  const [modules, setModules] = useState<TeacherSectionModule[]>([]);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newModuleDescription, setNewModuleDescription] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<(typeof ITEM_TYPES)[number]>("readable");
  const [itemContent, setItemContent] = useState("");
  const [itemInstructions, setItemInstructions] = useState("");
  const [itemQuestion, setItemQuestion] = useState("");
  const [itemChoices, setItemChoices] = useState("");
  const [itemAnswer, setItemAnswer] = useState("");
  const [itemResourceUrl, setItemResourceUrl] = useState("");
  const [itemResourceFile, setItemResourceFile] = useState<File | null>(null);

  const selectedModule = useMemo(
    () => modules.find((module) => String(module.id) === selectedModuleId) ?? null,
    [modules, selectedModuleId]
  );

  async function refreshSection(sectionId: string) {
    if (!sectionId) {
      setSelectedSection(null);
      setModules([]);
      return;
    }
    const [sectionData, moduleData, certificateData] = await Promise.all([
      getTeacherSection(Number(sectionId)),
      getTeacherSectionModules(Number(sectionId)),
      getTeacherCertificateTemplates()
    ]);
    setSelectedSection(sectionData);
    setModules(moduleData);
    setCertificates(certificateData.filter((item) => item.section_id === Number(sectionId)));
    if (moduleData.length > 0 && !selectedModuleId) {
      setSelectedModuleId(String(moduleData[0].id));
    }
  }

  useEffect(() => {
    getTeacherSections()
      .then((data) => {
        setSections(data);
        const initial = sectionQuery || (data[0] ? String(data[0].section.id) : "");
        setSelectedSectionId(initial);
        if (initial) {
          void refreshSection(initial);
        }
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, [sectionQuery]);

  async function onCreateModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSectionId) {
      return;
    }
    setError(null);
    try {
      await createTeacherSectionModule(Number(selectedSectionId), {
        title: newModuleTitle,
        description: newModuleDescription
      });
      setNewModuleTitle("");
      setNewModuleDescription("");
      await refreshSection(selectedSectionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create module.");
    }
  }

  async function onCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModuleId) {
      setError("Choose a module first.");
      return;
    }
    const config =
      itemType === "multiple_choice_assessment"
        ? {
            question: itemQuestion,
            choices: itemChoices.split(",").map((value) => value.trim()).filter(Boolean),
            correct_answer: itemAnswer
          }
        : itemType === "identification_assessment"
          ? {
              question: itemQuestion,
              correct_answer: itemAnswer,
              accepted_answers: itemAnswer.split(",").map((value) => value.trim()).filter(Boolean)
            }
          : itemType === "signing_lab_assessment"
            ? {
                question: itemQuestion,
                expected_answer: itemAnswer,
                helper_text: "Open the signing lab and enter the detected sign."
              }
            : itemType === "external_link_resource"
              ? {
                  resource_kind: "external_link",
                  resource_url: itemResourceUrl
                }
            : {};

    try {
      const moduleId = Number(selectedModuleId);
      if (
        (itemType === "video_resource" ||
          itemType === "document_resource" ||
          itemType === "interactive_resource") &&
        !itemResourceFile
      ) {
        setError("Select a file for this resource item.");
        return;
      }
      if (itemType === "external_link_resource" && !itemResourceUrl.trim()) {
        setError("Provide a valid resource link.");
        return;
      }
      const updated =
        itemType === "video_resource" || itemType === "document_resource" || itemType === "interactive_resource"
          ? await uploadTeacherModuleItemResource(moduleId, {
              title: itemTitle,
              item_type: itemType,
              file: itemResourceFile as File,
              instructions: itemInstructions,
              content_text: itemContent || undefined
            })
          : await createTeacherModuleItem(moduleId, {
              title: itemTitle,
              item_type: itemType,
              content_text: itemType === "readable" ? itemContent : undefined,
              instructions: itemInstructions,
              config
            });

      setModules((current) => current.map((module) => (module.id === updated.id ? updated : module)));
      setItemTitle("");
      setItemContent("");
      setItemInstructions("");
      setItemQuestion("");
      setItemChoices("");
      setItemAnswer("");
      setItemResourceUrl("");
      setItemResourceFile(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create module item.");
    }
  }

  async function onPublishToggle(module: TeacherSectionModule) {
    try {
      const updated = await updateTeacherModule(module.id, { is_published: !module.is_published });
      setModules((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update module.");
    }
  }

  async function onUploadCertificate(file: File | null) {
    if (!file || !selectedSectionId) {
      return;
    }
    try {
      await uploadTeacherCertificateTemplate(Number(selectedSectionId), file);
      await refreshSection(selectedSectionId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to upload certificate template.");
    }
  }

  return (
    <section className="space-y-6">
      <div className="panel">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">Teacher LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Section Builder</h2>
      </div>

      {error ? <p className="rounded-xl border border-brandRed/35 bg-brandRedLight px-4 py-3 text-sm text-brandRed">{error}</p> : null}

      <div className="panel">
        <label className="block text-sm font-semibold text-slate-800">
          Choose Section
          <select className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => { setSelectedSectionId(event.target.value); void refreshSection(event.target.value); }} value={selectedSectionId}>
            <option value="">Choose a section</option>
            {sections.map((entry) => (
              <option key={entry.section.id} value={entry.section.id}>
                {entry.section.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedSection ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <form className="panel space-y-4" onSubmit={onCreateModule}>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Create Module</p>
              <label className="block text-sm font-semibold text-slate-800">
                Module Title
                <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setNewModuleTitle(event.target.value)} required value={newModuleTitle} />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Description
                <textarea className="mt-1 min-h-28 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setNewModuleDescription(event.target.value)} value={newModuleDescription} />
              </label>
              <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" type="submit">
                Add Module
              </button>

              <div className="rounded-xl border border-brandBorder bg-brandOffWhite px-4 py-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Certificate Template</p>
                <p className="mt-2">Upload one certificate template for this section. Students can download certificates after completing all modules.</p>
                <input className="mt-3 block w-full text-sm" onChange={(event) => void onUploadCertificate(event.target.files?.[0] ?? null)} type="file" />
                <div className="mt-3 space-y-2">
                  {certificates.map((item) => (
                    <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700" key={item.id}>
                      {item.original_file_name} - <span className="font-semibold capitalize">{item.status}</span>
                    </p>
                  ))}
                </div>
              </div>
            </form>

            <div className="panel">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Modules</p>
              <div className="mt-4 grid gap-3">
                {modules.map((module) => (
                  <article className="rounded-2xl border border-brandBorder bg-white p-4" key={module.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Module {module.order_index}</p>
                        <h3 className="mt-2 text-lg font-bold text-slate-900">{module.title}</h3>
                        <p className="mt-2 text-sm text-slate-700">{module.description}</p>
                      </div>
                      <button className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${module.is_published ? "bg-brandRed" : "bg-brandBlue"}`} onClick={() => void onPublishToggle(module)} type="button">
                        {module.is_published ? "Unpublish" : "Publish"}
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedModuleId === String(module.id) ? "border-brandBlue bg-brandBlueLight text-brandBlue" : "border-brandBorder bg-white text-slate-700"}`} onClick={() => setSelectedModuleId(String(module.id))} type="button">
                        Edit Items
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          {selectedModule ? (
            <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
              <form className="panel space-y-4" onSubmit={onCreateItem}>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Add Item to {selectedModule.title}</p>
                <label className="block text-sm font-semibold text-slate-800">
                  Item Type
                  <select className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemType(event.target.value as (typeof ITEM_TYPES)[number])} value={itemType}>
                    {ITEM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-800">
                  Title
                  <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemTitle(event.target.value)} required value={itemTitle} />
                </label>
                <label className="block text-sm font-semibold text-slate-800">
                  Instructions
                  <textarea className="mt-1 min-h-24 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemInstructions(event.target.value)} value={itemInstructions} />
                </label>
                {itemType === "readable" ? (
                  <label className="block text-sm font-semibold text-slate-800">
                    Reading Content
                    <textarea className="mt-1 min-h-36 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemContent(event.target.value)} value={itemContent} />
                  </label>
                ) : itemType === "video_resource" || itemType === "document_resource" || itemType === "interactive_resource" ? (
                  <>
                    <label className="block text-sm font-semibold text-slate-800">
                      Resource Description
                      <textarea className="mt-1 min-h-24 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemContent(event.target.value)} value={itemContent} />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800">
                      Upload File
                      <input
                        className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm"
                        onChange={(event) => setItemResourceFile(event.target.files?.[0] ?? null)}
                        required
                        type="file"
                      />
                    </label>
                    <p className="text-xs text-slate-600">
                      Supported examples: recorded videos, PDFs/slides/documents, and interactive or SCORM package files.
                    </p>
                  </>
                ) : itemType === "external_link_resource" ? (
                  <>
                    <label className="block text-sm font-semibold text-slate-800">
                      Link
                      <input
                        className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2"
                        onChange={(event) => setItemResourceUrl(event.target.value)}
                        placeholder="https://..."
                        required
                        value={itemResourceUrl}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-slate-800">
                      Link Description
                      <textarea className="mt-1 min-h-24 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemContent(event.target.value)} value={itemContent} />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-semibold text-slate-800">
                      Prompt / Question
                      <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemQuestion(event.target.value)} value={itemQuestion} />
                    </label>
                    {itemType === "multiple_choice_assessment" ? (
                      <label className="block text-sm font-semibold text-slate-800">
                        Choices (comma separated)
                        <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemChoices(event.target.value)} value={itemChoices} />
                      </label>
                    ) : null}
                    <label className="block text-sm font-semibold text-slate-800">
                      Correct / Expected Answer
                      <input className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2" onChange={(event) => setItemAnswer(event.target.value)} value={itemAnswer} />
                    </label>
                  </>
                )}
                <button className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white" type="submit">
                  Add Item
                </button>
              </form>

              <div className="panel">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] label-accent">Module Items</p>
                <div className="mt-4 space-y-3">
                  {selectedModule.items.map((item) => (
                    <article className="rounded-2xl border border-brandBorder bg-white p-4" key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                            Item {item.order_index} - {item.item_type.replaceAll("_", " ")}
                          </p>
                          <h4 className="mt-2 text-base font-bold text-slate-900">{item.title}</h4>
                          <p className="mt-2 text-sm text-slate-700">{item.instructions || "No instructions yet."}</p>
                        </div>
                        <span className="rounded-full bg-brandBlueLight px-3 py-1 text-xs font-semibold text-brandBlue">
                          {item.is_published ? "Live" : "Hidden"}
                        </span>
                      </div>
                      {item.content_text ? <p className="mt-3 rounded-xl bg-brandOffWhite px-3 py-3 text-sm text-slate-700">{item.content_text}</p> : null}
                      {Object.keys(item.config || {}).length > 0 ? (
                        <pre className="mt-3 overflow-x-auto rounded-xl bg-brandNavy p-3 text-xs text-white">{JSON.stringify(item.config, null, 2)}</pre>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
