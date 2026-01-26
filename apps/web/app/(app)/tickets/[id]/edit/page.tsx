"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, apiForm } from "@/lib/api";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";
import ProjectPickerModal from "@/components/ProjectPickerModal";
import { useMe } from "@/lib/auth-context";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

type Ticket = {
  id: number;
  title: string;
  description: TiptapDoc;
  status: string;
  priority: string;
  category_id: number | null;
  category_ids?: number[] | null;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  requester_emp_no: string;
  updated_at?: string | null;
};

type TicketForm = {
  title: string;
  description: TiptapDoc;
  priority: string;
  category_ids: number[];
  work_type: string | null;
  project_id: number | null;
};

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const READ_KEY = "it_service_desk_ticket_reads";

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

function markLocalRead(ticketId: number, updatedAt?: string | null) {
  if (typeof window === "undefined") return;
  const value = updatedAt ?? new Date().toISOString();
  try {
    const raw = localStorage.getItem(READ_KEY);
    const prev = raw ? JSON.parse(raw) : {};
    const next = { ...(prev ?? {}), [String(ticketId)]: value };
    localStorage.setItem(READ_KEY, JSON.stringify(next));
  } catch {
    localStorage.setItem(READ_KEY, JSON.stringify({ [String(ticketId)]: value }));
  }
}

export default function EditTicketPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const ticketId = Number(params.id);
  const me = useMe();
  const { categories, loading: categoryLoading, error: categoryError } = useTicketCategories();

  const [categoryTouched, setCategoryTouched] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<TicketForm>({
    title: "",
    description: EMPTY_DOC,
    priority: "medium",
    category_ids: [],
    work_type: "",
    project_id: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  useUnsavedChangesWarning(isDirty);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket-edit", ticketId],
    queryFn: () => api<Ticket>(`/tickets/${ticketId}`),
    enabled: Number.isFinite(ticketId),
  });

  useEffect(() => {
    if (!data) return;
    if (data.status !== "open") {
      router.replace(`/tickets/${ticketId}`);
      return;
    }
    const nextCategories =
      data.category_ids && data.category_ids.length > 0
        ? data.category_ids
        : data.category_id
          ? [data.category_id]
          : [];
    setForm({
      title: data.title ?? "",
      description: data.description ?? EMPTY_DOC,
      priority: data.priority ?? "medium",
      category_ids: nextCategories,
      work_type: data.work_type ?? "",
      project_id: data.project_id ?? null,
    });
    setCategoryTouched(nextCategories.length > 0);
    if (data.project_id && data.project_name) {
      setProject({ id: data.project_id, name: data.project_name });
    }
    setIsDirty(false);
  }, [data, router, ticketId]);

  useEffect(() => {
    if (!data) return;
    if (data.requester_emp_no !== me.emp_no) {
      router.replace("/tickets");
    }
  }, [data, me.emp_no, router]);

  useEffect(() => {
    if (categoryTouched) return;
    if (!categoryLoading && categories.length > 0 && form.category_ids.length === 0) {
      setForm((prev) => ({ ...prev, category_ids: [categories[0].id] }));
    }
  }, [categories, categoryLoading, categoryTouched, form.category_ids.length]);

  const updateTicket = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim() || null,
        description: isEmptyDoc(form.description) ? null : form.description,
        priority: form.priority || null,
        category_ids: form.category_ids,
        work_type: form.work_type?.trim() || null,
        project_id: form.project_id ?? null,
      };

      const updated = await api<Ticket>(`/tickets/${ticketId}`, {
        method: "PATCH",
        body: payload,
      });

      if (attachments.length) {
        for (const file of attachments) {
          const fd = new FormData();
          fd.append("file", file);
          await apiForm(`/tickets/${updated.id}/attachments/upload`, fd);
        }
      }

      return updated;
    },
    onSuccess: (updated) => {
      markLocalRead(updated.id, updated.updated_at ?? null);
      setIsDirty(false);
      router.replace(`/tickets/${updated.id}`);
    },
    onError: (err: any) => {
      setError(err?.message ?? "수정에 실패했습니다.");
    },
  });

  function handleChange<K extends keyof TicketForm>(key: K, value: TicketForm[K]) {
    setIsDirty(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(categoryId: number) {
    setIsDirty(true);
    setCategoryTouched(true);
    setForm((prev) => {
      const exists = prev.category_ids.includes(categoryId);
      const next = exists
        ? prev.category_ids.filter((id) => id !== categoryId)
        : [...prev.category_ids, categoryId];
      return { ...prev, category_ids: next };
    });
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    setError(null);
    setIsDirty(true);
    setAttachments((prev) => {
      const next = [...prev];
      for (const file of Array.from(fileList)) {
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

  function handleProjectSelect(selected: Project) {
    setProject(selected);
    setIsDirty(true);
    setForm((prev) => ({ ...prev, project_id: selected.id }));
  }

  if (isLoading) return <div className="p-6">요청을 불러오는 중입니다...</div>;
  if (!data) return <div className="p-6 text-sm text-gray-500">요청이 없습니다.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">요청 수정</h1>
          <p className="text-xs text-gray-500 mt-1">요청 정보를 수정하고 저장하세요.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="border rounded px-3 py-1.5 text-sm"
            onClick={() => router.replace(`/tickets/${ticketId}`)}
          >
            취소
          </button>
          <button
            className="border rounded px-3 py-1.5 text-sm bg-slate-900 text-white disabled:opacity-60"
            onClick={() => {
              setError(null);
              if (!form.title.trim()) {
                setError("제목을 입력하세요.");
                return;
              }
              if (form.category_ids.length === 0) {
                setError("카테고리를 선택하세요.");
                return;
              }
              if (isEmptyDoc(form.description)) {
                setError("요청 내용을 입력하세요.");
                return;
              }
              updateTicket.mutate();
            }}
            disabled={updateTicket.isPending}
          >
            {updateTicket.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 border-b">
          <div className="col-span-3 bg-gray-50 text-xs text-gray-600 px-3 py-2 border-r">제목</div>
          <div className="col-span-9 px-3 py-2">
            <input
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              maxLength={200}
            />
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-3 bg-gray-50 text-xs text-gray-600 px-3 py-2 border-r">프로젝트</div>
          <div className="col-span-9 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="border rounded px-3 py-1.5 text-sm"
                onClick={() => setProjectModalOpen(true)}
              >
                프로젝트 선택
              </button>
              <div className="text-xs text-gray-600">
                {project ? (
                  <>
                    <span>[프로젝트] {project.name}</span>
                    {(project.start_date || project.end_date) && (
                      <span className="ml-2 text-[11px] text-gray-500">
                        {project.start_date ?? "-"} ~ {project.end_date ?? "-"}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-500">선택된 프로젝트가 없습니다.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-3 bg-gray-50 text-xs text-gray-600 px-3 py-2 border-r">우선순위</div>
          <div className="col-span-9 px-3 py-2">
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
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

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-3 bg-gray-50 text-xs text-gray-600 px-3 py-2 border-r">카테고리</div>
          <div className="col-span-9 px-3 py-2 space-y-2">
            <div className="flex flex-wrap gap-3">
              {categories.map((c) => {
                const checked = form.category_ids.includes(c.id);
                return (
                  <label key={c.id} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={checked}
                      onChange={() => toggleCategory(c.id)}
                    />
                    <span>{c.name}</span>
                  </label>
                );
              })}
            </div>
            {categoryError && <div className="text-xs text-red-600">{categoryError}</div>}
            {!categoryLoading && categories.length === 0 && (
              <div className="text-xs text-gray-500">
                카테고리가 비어 있습니다. 관리자에서 먼저 등록하세요.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 border-b">
          <div className="col-span-3 bg-gray-50 text-xs text-gray-600 px-3 py-2 border-r">작업 구분</div>
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
                  />
                  <span>{w.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12">
          <div className="col-span-3 bg-gray-50 text-xs text-gray-600 px-3 py-2 border-r">작업 구분 설명</div>
          <div className="col-span-9 px-3 py-2">
            <ul className="space-y-1 text-xs text-gray-600">
              {workTypeOptions.map((w) => (
                <li key={`${w.value}-desc`}>
                  <span className="font-semibold text-gray-700">{w.label}</span>: {w.description}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] text-gray-500">파일당 최대 25MB</div>
        <input
          id="attachment-input"
          type="file"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          className={`rounded border-2 border-dashed px-4 py-3 transition ${
            dragActive ? "border-emerald-400 bg-emerald-50" : "border-gray-200 bg-white"
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
              className="inline-flex items-center gap-2 rounded border border-gray-200 px-2.5 py-1.5 text-sm bg-white text-gray-700"
              onClick={() => fileInputRef.current?.click()}
            >
              파일 선택
            </button>
            <span className="text-sm text-gray-500">드래그/붙여넣기로 추가할 수 있습니다.</span>
            {attachments.length > 0 && (
              <button
                type="button"
                className="text-sm text-gray-600 hover:underline"
                onClick={() => setAttachments([])}
              >
                모두 제거
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            {attachments.length === 0 && <p className="text-sm text-gray-500">첨부파일이 없습니다.</p>}
            {attachments.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 bg-gray-50"
              >
                <div>
                  <div className="text-xs text-gray-900">{file.name}</div>
                  <div className="text-sm text-gray-600">{formatBytes(file.size)}</div>
                </div>
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => removeFile(idx)}
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
      </div>

      <ProjectPickerModal
        open={projectModalOpen}
        selectedId={project?.id ?? null}
        onClose={() => setProjectModalOpen(false)}
        onSelect={(selected) => {
          handleProjectSelect(selected);
          setProjectModalOpen(false);
        }}
      />
    </div>
  );
}
