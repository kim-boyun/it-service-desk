"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "@tanstack/react-query";
import { api, apiForm } from "@/lib/api";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import ProjectPickerModal from "@/components/ProjectPickerModal";
import PageHeader from "@/components/PageHeader";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

type TicketCreateIn = {
  title: string;
  description: TiptapDoc;
  priority: string;
  category_id: number;
  work_type: string | null;
  project_id: number | null;
};

type TicketFormState = {
  title: string;
  description: TiptapDoc;
  priority: string;
  category_id: string;
  work_type: string | null;
  project_id: number | null;
};

type TicketOut = {
  id: number;
  title: string;
};

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const priorities = [
  { value: "low", label: "??쓬" },
  { value: "medium", label: "蹂댄넻" },
  { value: "high", label: "?믪쓬" },
  { value: "urgent", label: "湲닿툒" },
];

const workTypeOptions = [
  { value: "incident", label: "?μ븷", description: "?쒖뒪?쒖씠 ?뺤긽?곸쑝濡??숈옉?섏? ?딅뒗 寃쎌슦" },
  { value: "request", label: "?붿껌", description: "?덈줈???묒뾽?대굹 吏?먯쓣 ?붿껌?섎뒗 寃쎌슦" },
  { value: "change", label: "蹂寃?, description: "湲곗〈 ?ㅼ젙?대굹 湲곕뒫???섏젙?섎뒗 寃쎌슦" },
  { value: "other", label: "湲고?", description: "????ぉ??紐낇솗???대떦?섏? ?딅뒗 寃쎌슦" },
];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export default function NewTicketPage() {
  const router = useRouter();
  const { categories, loading: categoryLoading, error: categoryError } = useTicketCategories();
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const [form, setForm] = useState<TicketFormState>({
    title: "",
    description: EMPTY_DOC,
    priority: "low",
    category_id: "",
    work_type: "",
    project_id: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  useUnsavedChangesWarning(isDirty);



  const createTicket = useMutation({
    mutationFn: async ({ form: payload, files }: { form: TicketCreateIn; files: File[] }) => {
      const created = await api<TicketOut>("/tickets", {
        method: "POST",
        body: payload,
      });

      if (files.length) {
        for (const file of files) {
          const fd = new FormData();
          fd.append("file", file);
          await apiForm(`/tickets/${created.id}/attachments/upload`, fd);
        }
      }

      return created;
    },
    onSuccess: (res) => {
      setIsDirty(false);
      router.replace(`/tickets/${res.id}`);
    },
    onError: (err: any) => {
      setError(err?.message ?? "?붿껌 ?앹꽦???ㅽ뙣?덉뒿?덈떎.");
    },
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim() || null,
        description: isEmptyDoc(form.description) ? null : form.description,
        priority: form.priority || null,
        category_id: categoryTouched && form.category_id ? Number(form.category_id) : null,
        work_type: form.work_type?.trim() || null,
        project_id: form.project_id ?? null,
      };

      return await api<{ id: number }>("/draft-tickets", {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      setIsDirty(false);
      router.push("/tickets/drafts");
    },
    onError: (err: any) => {
      setError(err?.message ?? "?꾩떆??μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
    },
  });

  function handleChange<K extends keyof TicketFormState>(key: K, value: TicketFormState[K]) {
    setIsDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    setIsDirty(true);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_FILE_BYTES) {
          setError("泥⑤??뚯씪? 25MB ?댄븯濡쒕쭔 媛?ν빀?덈떎.");
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }

  function removeFile(idx: number) {
    setIsDirty(true);
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isDirty) {
      setError("?묒꽦 ?댁슜???놁뒿?덈떎.");
      return;
    }

    const title = form.title.trim();
    if (!title) {
      setError("?쒕ぉ???낅젰?섏꽭??");
      return;
    }
    if (isEmptyDoc(form.description)) {
      setError("?댁슜???낅젰?섏꽭??");
      return;
    }
    if (!form.category_id) {
      setError("移댄뀒怨좊━瑜??좏깮?섏꽭??");
      return;
    }
    if (!form.work_type) {
      setError("?묒뾽 援щ텇???좏깮?섏꽭??");
      return;
    }

    createTicket.mutate({
      form: {
        title,
        description: form.description,
        priority: form.priority,
        category_id: Number(form.category_id),
        work_type: form.work_type?.trim() || null,
        project_id: form.project_id ?? null,
      },
      files: attachments,
    });
  }

  function onSaveDraft() {
    setError(null);
    if (!isDirty) {
      setError("?묒꽦 ?댁슜???놁뒿?덈떎.");
      return;
    }
    saveDraft.mutate();
  }

  function handleProjectSelect(selected: Project) {
    setProject(selected);
    setIsDirty(true);
    setForm((prev) => ({ ...prev, project_id: selected.id }));
    setProjectModalOpen(false);
  }

  function clearProject() {
    setProject(null);
    setIsDirty(true);
    setForm((prev) => ({ ...prev, project_id: null }));
  }

  return (
    <div className="p-5 space-y-5">
      <PageHeader title="?붿껌 ?앹꽦" />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            disabled={createTicket.isPending}
          >
            {createTicket.isPending ? "?깅줉 以?.." : "?깅줉"}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={onSaveDraft}
            disabled={saveDraft.isPending}
          >
            {saveDraft.isPending ? "?꾩떆???以?.." : "?꾩떆???}
          </button>
        </div>

        <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              ?쒕ぉ
            </div>
            <div className="col-span-9 px-3 py-2">
              <div className="flex items-center gap-3">
                <input
                  className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                  value={form.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="?붿껌 ?쒕ぉ???낅젰?섏꽭??"
                  required
                  maxLength={200}
                  minLength={3}
                />
                <span className="text-[11px] text-slate-500 whitespace-nowrap">{form.title.length}/200</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              ?꾨줈?앺듃
            </div>
            <div className="col-span-9 px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => setProjectModalOpen(true)}
                >
                  {project ? "?꾨줈?앺듃 蹂寃? : "?꾨줈?앺듃 ?좏깮"}
                </button>
                {project && (
                  <button type="button" className="text-sm text-slate-600 hover:underline" onClick={clearProject}>
                    ?댁젣
                  </button>
                )}
                {project && (
                  <div className="text-sm text-slate-700">
                    {project.name}
                    {project.start_date || project.end_date ? (
                      <span className="ml-2 text-sm text-slate-500">
                        {project.start_date ?? "-"} ~ {project.end_date ?? "-"}
                      </span>
                    ) : null}
                  </div>
                )}
                {!project && <span className="text-sm text-slate-500">誘몄꽑??媛??/span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              ?곗꽑?쒖쐞
            </div>
            <div className="col-span-9 px-3 py-2">
              <select
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                value={form.priority}
                onChange={(e) => handleChange("priority", e.target.value)}
              >
                {priorities.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              移댄뀒怨좊━
            </div>
            <div className="col-span-9 px-3 py-2 space-y-1.5">
              {categories.length > 0 ? (
                <select
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                  value={form.category_id}
                  onChange={(e) => {
                    setCategoryTouched(true);
                    handleChange("category_id", e.target.value);
                  }}
                  required
                >
                  <option value="" disabled>
                    移댄뀒怨좊━瑜??좏깮?섏꽭??                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                  value={form.category_id}
                  onChange={(e) => {
                    setCategoryTouched(true);
                    handleChange("category_id", e.target.value);
                  }}
                  placeholder="移댄뀒怨좊━ 肄붾뱶(?? it_service)"
                />
              )}
              {categoryError && <div className="text-xs text-red-600">{categoryError}</div>}
              {!categoryLoading && categories.length === 0 && (
                <div className="text-sm text-slate-500">
                  移댄뀒怨좊━媛 鍮꾩뼱 ?덉뒿?덈떎. 愿由ъ옄?먯꽌 癒쇱? ?깅줉?섏꽭??
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              ?묒뾽 援щ텇
            </div>
            <div className="col-span-9 px-3 py-2">
              <div className="flex flex-wrap gap-4 text-sm">
                {workTypeOptions.map((w) => (
                  <label key={w.value} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="work_type"
                      value={w.value}
                      checked={form.work_type === w.value}
                      onChange={(e) => handleChange("work_type", e.target.value)}
                      required
                    />
                    <span>{w.label}</span>
                  </label>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {workTypeOptions.map((w) => (
                  <li key={`${w.value}-desc`}>
                    <span className="font-semibold text-slate-700">{w.label}</span>: {w.description}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm text-slate-600">?뚯씪??理쒕? 25MB</div>
          <input
            id="attachment-input"
            type="file"
            multiple
            className="sr-only"
            ref={fileInputRef}
            onChange={(e) => {
              addFiles(e.currentTarget.files);
              e.currentTarget.value = "";
            }}
          />
          <div
            className={`rounded-2xl border-2 border-dashed px-4 py-3 transition ${
              dragActive ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                onClick={() => {
                  const input = fileInputRef.current;
                  if (!input) return;
                  input.value = "";
                  if ("showPicker" in input) {
                    (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
                  } else {
                    input.click();
                  }
                }}
              >
                파일 선택
              </button>
              <span className="text-sm text-slate-500">?쒕옒洹?遺숈뿬?ｊ린濡?異붽??????덉뒿?덈떎.</span>
              {attachments.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => setAttachments([])}
                  disabled={createTicket.isPending}
                >
                  紐⑤몢 ?쒓굅
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {attachments.length === 0 && <p className="text-sm text-slate-500">?좏깮???뚯씪???놁뒿?덈떎.</p>}
              {attachments.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1 bg-slate-50"
                >
                  <div>
                    <div className="text-xs text-slate-900">{file.name}</div>
                    <div className="text-sm text-slate-600">{formatBytes(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-red-600 hover:underline"
                    onClick={() => removeFile(idx)}
                    disabled={createTicket.isPending}
                  >
                    ?쒓굅
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <RichTextEditor
            value={form.description}
            onChange={(doc) => handleChange("description", doc)}
            onError={setError}
            placeholder="?붿껌 ?댁슜???낅젰?섏꽭??"
          />
          <p className="text-xs text-slate-500">?대?吏???쒕옒洹?遺숈뿬?ｊ린濡?異붽??????덉뒿?덈떎.</p>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
      </form>

      <ProjectPickerModal
        open={projectModalOpen}
        selectedId={project?.id ?? null}
        onClose={() => setProjectModalOpen(false)}
        onSelect={handleProjectSelect}
      />
    </div>
  );
}
