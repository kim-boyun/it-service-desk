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
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "urgent", label: "긴급" },
];

const workTypeOptions = [
  { value: "incident", label: "장애", description: "시스템이 정상적으로 동작하지 않는 경우" },
  { value: "request", label: "요청", description: "새로운 작업이나 지원을 요청하는 경우" },
  { value: "change", label: "변경", description: "기존 설정이나 기능을 수정하는 경우" },
  { value: "other", label: "기타", description: "위 항목에 명확히 해당하지 않는 경우" },
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
        try {
          for (const file of files) {
            const fd = new FormData();
            fd.append("file", file);
            await apiForm(`/tickets/${created.id}/attachments/upload`, fd);
          }
        } catch (err) {
          try {
            await api(`/tickets/${created.id}`, { method: "DELETE" });
          } catch (cleanupError) {
            console.error("ticket cleanup failed after attachment error", cleanupError);
          }
          throw err;
        }
      }

      return created;
    },
    onSuccess: (res) => {
      setIsDirty(false);
      router.replace(`/tickets/${res.id}`);
    },
    onError: (err: any) => {
      const message = err?.message ?? "요청 생성에 실패했습니다.";
      if (message.includes("413")) {
        setError("첨부파일 용량이 서버 제한을 초과했습니다. 25MB 이하로 줄이거나 서버 업로드 제한을 늘려주세요.");
        return;
      }
      setError(message);
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
      setError(err?.message ?? "임시저장에 실패했습니다.");
    },
  });

  function handleChange<K extends keyof TicketFormState>(key: K, value: TicketFormState[K]) {
    setIsDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    setError(null);
    setIsDirty(true);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError("첨부파일은 25MB 이하로만 가능합니다.");
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
      setError("작성 내용이 없습니다.");
      return;
    }

    const title = form.title.trim();
    if (!title) {
      setError("제목을 입력하세요.");
      return;
    }
    if (isEmptyDoc(form.description)) {
      setError("내용을 입력하세요.");
      return;
    }
    if (!form.category_id) {
      setError("카테고리를 선택하세요.");
      return;
    }
    if (!form.work_type) {
      setError("작업 구분을 선택하세요.");
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
      setError("작성 내용이 없습니다.");
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
      <PageHeader title="요청 생성" />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
            disabled={createTicket.isPending}
          >
            {createTicket.isPending ? "등록 중..." : "등록"}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            onClick={onSaveDraft}
            disabled={saveDraft.isPending}
          >
            {saveDraft.isPending ? "임시저장 중..." : "임시저장"}
          </button>
        </div>

        <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              제목
            </div>
            <div className="col-span-9 px-3 py-2">
              <div className="flex items-center gap-3">
                <input
                  className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                  value={form.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="요청 제목을 입력하세요."
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
              프로젝트
            </div>
            <div className="col-span-9 px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => setProjectModalOpen(true)}
                >
                  {project ? "프로젝트 변경" : "프로젝트 선택"}
                </button>
                {project && (
                  <button type="button" className="text-sm text-slate-600 hover:underline" onClick={clearProject}>
                    해제
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
                {!project && <span className="text-sm text-slate-500">미선택 가능</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              우선순위
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
              카테고리
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
                    카테고리를 선택하세요
                  </option>
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
                  placeholder="카테고리 코드(예: it_service)"
                />
              )}
              {categoryError && <div className="text-xs text-red-600">{categoryError}</div>}
              {!categoryLoading && categories.length === 0 && (
                <div className="text-sm text-slate-500">
                  카테고리가 비어 있습니다. 관리자에서 먼저 등록하세요.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-12 border-b border-slate-200/70">
            <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
              작업 구분
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
          <div className="text-sm text-slate-600">파일당 최대 25MB</div>
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
                  const showPicker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
                  if (showPicker) {
                    showPicker.call(input);
                  } else {
                    input.click();
                  }
                }}
              >
                파일 선택
              </button>
              <span className="text-sm text-slate-500">드래그/붙여넣기로 추가할 수 있습니다.</span>
              {attachments.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => setAttachments([])}
                  disabled={createTicket.isPending}
                >
                  모두 제거
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              {attachments.length === 0 && <p className="text-sm text-slate-500">선택된 파일이 없습니다.</p>}
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
                    제거
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
            placeholder="요청 내용을 입력하세요."
          />
          <p className="text-xs text-slate-500">이미지는 드래그/붙여넣기로 추가할 수 있습니다.</p>
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
