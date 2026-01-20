"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { api, apiForm } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { EMPTY_DOC, isEmptyDoc, TiptapDoc } from "@/lib/tiptap";

const TiptapViewer = dynamic(() => import("@/components/TiptapViewer"), { ssr: false });
const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

type Attachment = {
  id: number;
  key: string;
  filename: string;
  content_type: string;
  size: number;
  ticket_id: number | null;
  comment_id: number | null;
  uploaded_emp_no: string;
  created_at?: string | null;
};

type Comment = {
  id: number;
  ticket_id: number;
  author_emp_no: string;
  author?: UserSummary | null;
  title: string;
  body: TiptapDoc;
  created_at?: string;
};

type Event = {
  id: number;
  ticket_id: number;
  actor_emp_no: string;
  type: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at?: string;
};

type Ticket = {
  id: number;
  title: string;
  description: TiptapDoc;
  status: string;
  priority: string;
  category_id: number | null;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  requester?: UserSummary | null;
  requester_emp_no: string;
  assignee?: UserSummary | null;
  assignee_emp_no: string | null;
  created_at: string;
  updated_at?: string | null;
};

type UserSummary = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  role?: string | null;
};

type TicketDetail = {
  ticket: Ticket;
  comments: Comment[];
  events: Event[];
  attachments: Attachment[];
};

const WORK_TYPE_OPTIONS = [
  { value: "incident", label: "장애" },
  { value: "request", label: "요청" },
  { value: "change", label: "변경" },
  { value: "other", label: "기타" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "접수" },
  { value: "in_progress", label: "진행" },
  { value: "resolved", label: "완료" },
  { value: "closed", label: "사업 검토" },
];

const UNSAVED_MESSAGE =
  "이 페이지를 나가시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";

const MAX_COMMENT_FILE_BYTES = 25 * 1024 * 1024;

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (["open", "new", "pending"].includes(s)) {
    return { label: "접수", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (["in_progress", "processing", "assigned"].includes(s)) {
    return { label: "진행", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (s == "resolved") {
    return { label: "완료", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (s == "closed") {
    return { label: "사업 검토", cls: "bg-slate-100 text-slate-700 border-slate-200" };
  }
  return { label: status, cls: "bg-gray-100 text-gray-700 border-gray-200" };
}

function priorityMeta(priority: string) {
  const map: Record<string, { label: string; cls: string }> = {
    low: { label: "낮음", cls: "bg-gray-100 text-gray-700 border-gray-200" },
    medium: { label: "보통", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    high: { label: "높음", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    urgent: { label: "긴급", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  return map[priority] ?? map.medium;
}

function categoryLabel(c: number | null | undefined, map: Record<number, string>) {
  if (!c) return "-";
  return map[c] ?? String(c);
}

function workTypeLabel(value?: string | null) {
  if (!value) return "-";
  const map: Record<string, string> = {
    incident: "장애",
    request: "요청",
    change: "변경",
    other: "기타",
    maintenance: "기타",
    project: "기타",
  };
  return map[value] ?? value;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatUser(user?: UserSummary | null, fallbackEmpNo?: string | null, emptyLabel = "-") {
  if (!user) return fallbackEmpNo || emptyLabel;
  const parts = [user.kor_name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.emp_no || fallbackEmpNo || emptyLabel;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function FieldRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 border-b">
      <div className="col-span-3 bg-gray-50 text-sm text-gray-600 px-3 py-2 border-r">{label}</div>
      <div className="col-span-9 text-sm px-3 py-2">{value ?? "-"}</div>
    </div>
  );
}

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    ticket_created: "요청 접수",
    status_changed: "상태 변경",
    assignee_assigned: "담당자 배정",
    assignee_changed: "담당자 변경",
    requester_updated: "요청 수정",
    category_changed: "카테고리 변경",
    work_type_changed: "작업 구분 변경",
  };
  return map[type] ?? type;
}

function parseEditNote(note?: string | null): { summary: string; before?: any } | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note);
    if (parsed && typeof parsed === "object") {
      return {
        summary: typeof parsed.summary === "string" ? parsed.summary : "-",
        before: parsed.before,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export default function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const { categories, map: categoryMap } = useTicketCategories();
  const ticketId = Number(params.id);
  const isStaff = me.role === "admin";

  const [status, setStatus] = useState("open");
  const [note, setNote] = useState("");
  const [openEventId, setOpenEventId] = useState<number | null>(null);
  const [openCommentId, setOpenCommentId] = useState<number | null>(null);
  const [assigneeEmpNo, setAssigneeEmpNo] = useState<string>("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [workType, setWorkType] = useState<string>("");
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentTitle, setCommentTitle] = useState("");
  const [commentBody, setCommentBody] = useState<TiptapDoc>(EMPTY_DOC);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentNotifyEmail, setCommentNotifyEmail] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);

  const hasUnsavedComment = false;

  useEffect(() => {
    if (!isStaff) {
      router.replace("/home");
    }
  }, [isStaff, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ticket-detail", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}/detail?scope=all`),
    enabled: isStaff,
  });

  const { data: adminUsers = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<UserSummary[]>("/admin/users"),
    staleTime: 30_000,
    enabled: isStaff,
  });

  const staffOptions = useMemo(() => adminUsers.filter((u) => u.role === "admin"), [adminUsers]);

  useEffect(() => {
    if (!data?.ticket) return;
    const t = data.ticket;
    setStatus(t.status);
    setAssigneeEmpNo(t.assignee_emp_no ?? "");
    setCategoryId(t.category_id ?? "");
    setWorkType(t.work_type ?? "");
  }, [data?.ticket]);

  const downloadAttachmentM = useMutation({
    mutationFn: async (attachmentId: number) => {
      const { url } = await api<{ url: string }>(`/attachments/${attachmentId}/download-url`);
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const token = getToken();
      const isAbsolute = /^https?:\/\//i.test(url);
      const targetUrl = isAbsolute ? url : `${apiBase}${url}`;

      if (isAbsolute) {
        const a = document.createElement("a");
        a.href = targetUrl;
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      }

      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Download failed ${res.status}: ${text}`);
      }

      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] ?? `attachment-${attachmentId}`;

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      return true;
    },
  });

  const updateStatusM = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: { status, note: note || undefined },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      setNote("");
    },
  });


  const assignM = useMutation({
    mutationFn: (nextEmpNo: string | null) =>
      api(`/tickets/${ticketId}/assign`, {
        method: "PATCH",
        body: { assignee_emp_no: nextEmpNo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
  });

  const updateMetaM = useMutation({
    mutationFn: (payload: { category_id?: number | null; work_type?: string | null }) =>
      api(`/tickets/${ticketId}/admin-meta`, {
        method: "PATCH",
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
  });

  const deleteM = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticketId}/admin`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      router.replace("/admin/tickets");
    },
  });

  const createCommentM = useMutation({

    mutationFn: async () => {
      const created = await api<{ id: number }>(`/tickets/${ticketId}/comments`, {
        method: "POST",
        body: {
          title: commentTitle.trim(),
          body: commentBody,
          notify_email: commentNotifyEmail,
        },
      });

      if (commentFiles.length) {
        for (const file of commentFiles) {
          const fd = new FormData();
          fd.append("file", file);
          await apiForm(`/tickets/${ticketId}/attachments/upload?comment_id=${created.id}`, fd);
        }
      }

      return created;
    },
    onSuccess: () => {
      setCommentTitle("");
      setCommentBody(EMPTY_DOC);
      setCommentFiles([]);
      setCommentNotifyEmail(false);
      setCommentModalOpen(false);
      setCommentError(null);
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
    },
    onError: (err: any) => {
      setCommentError(err?.message ?? "댓글 등록에 실패했습니다.");
    },
  });

  function addCommentFiles(fileList: FileList | null) {
    if (!fileList) return;
    setCommentError(null);
    setCommentFiles((prev) => {
      const next = [...prev];
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_COMMENT_FILE_BYTES) {
          setCommentError("첨부파일은 25MB 이하만 가능합니다.");
          continue;
        }
        next.push(file);
      }
      return next;
    });
  }

  function removeCommentFile(idx: number) {
    setCommentFiles((prev) => prev.filter((_, i) => i != idx));
  }

  if (isLoading) return <div className="p-6">요청을 불러오는 중입니다...</div>;
  if (error) return <div className="p-6 text-red-600">오류: {(error as any).message}</div>;
  if (!data) return <div className="p-6 text-sm text-gray-500">요청이 없습니다.</div>;

  const t = data.ticket;
  const statusInfo = statusMeta(t.status);
  const priorityInfo = priorityMeta(t.priority);
  const headerMeta = [
    formatUser(t.requester, t.requester_emp_no),
    t.assignee ? formatUser(t.assignee, t.assignee_emp_no) : null,
    `생성 ${formatDate(t.created_at)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const selectedComment = data.comments.find((c) => c.id === openCommentId) ?? null;
  const ticketAttachments = data.attachments.filter((a) => !a.comment_id);
  const selectedAttachments = data.attachments.filter((a) => a.comment_id === openCommentId);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge label={statusInfo.label} cls={statusInfo.cls} />
            <Badge label={priorityInfo.label} cls={priorityInfo.cls} />
            <span className="text-xs text-gray-500">카테고리 {categoryLabel(t.category_id, categoryMap)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{headerMeta}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="border rounded px-3 py-2 text-sm bg-white transition-all hover:bg-slate-50 active:bg-slate-100 hover:shadow-sm active:translate-y-px"
            onClick={() => {
              if (hasUnsavedComment && !confirm(UNSAVED_MESSAGE)) return;
              router.back();
            }}
          >
            돌아가기
          </button>
          <button
            className="border border-red-200 text-red-700 rounded px-3 py-2 text-sm hover:bg-red-50"
            onClick={() => {
              if (!confirm("이 요청을 삭제할까요?")) return;
              deleteM.mutate();
            }}
            disabled={deleteM.isPending}
          >
            {deleteM.isPending ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
<div className="space-y-4">
  <div className="border rounded bg-white">
    <div className="px-4 py-3 border-b text-sm font-semibold">메타 정보</div>
    <div className="divide-y">
      <FieldRow label="요청자" value={formatUser(t.requester, t.requester_emp_no)} />
      <FieldRow
        label="담당자"
        value={
          <select
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
            value={assigneeEmpNo}
            onChange={(e) => {
              const next = e.target.value;
              setAssigneeEmpNo(next);
              assignM.mutate(next || null);
            }}
          >
            <option value="">미배정</option>
            {staffOptions.map((u) => (
              <option key={u.emp_no} value={u.emp_no}>
                {formatUser(u, u.emp_no)}
              </option>
            ))}
          </select>
        }
      />
      <FieldRow
        label="카테고리"
        value={
          <select
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
            value={categoryId}
            onChange={(e) => {
              const next = e.target.value ? Number(e.target.value) : null;
              setCategoryId(e.target.value ? Number(e.target.value) : "");
              if (next) updateMetaM.mutate({ category_id: next });
            }}
          >
            <option value="">카테고리 선택</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />
      <FieldRow
        label="작업 구분"
        value={
          <select
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
            value={workType}
            onChange={(e) => {
              const next = e.target.value;
              setWorkType(next);
              updateMetaM.mutate({ work_type: next || null });
            }}
          >
            <option value="">작업 구분 선택</option>
            {WORK_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />
      <FieldRow label="프로젝트" value={t.project_name ?? "-"} />
      <FieldRow label="생성일" value={formatDate(t.created_at)} />
      <FieldRow label="업데이트" value={formatDate(t.updated_at)} />
    </div>
  </div>

  <div className="border rounded bg-white">
    <div className="px-4 py-3 border-b flex items-center gap-3">
      <span className="text-sm font-semibold">요청 상세</span>
    </div>
    <div className="p-4 space-y-4">
      <section className="space-y-2">
        <div className="text-sm font-semibold">요청 내용</div>
        <div className="border rounded p-3 text-sm">
          <TiptapViewer value={t.description} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-sm font-semibold">첨부파일</div>
        {ticketAttachments.length === 0 ? (
          <div className="text-sm text-gray-500">첨부파일이 없습니다.</div>
        ) : (
          <div className="border rounded divide-y">
            {ticketAttachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2">
                <div className="text-sm">{a.filename}</div>
                <button
                  className="text-sm border rounded px-2 py-1 transition-colors hover:bg-slate-50 active:bg-slate-100"
                  onClick={() => downloadAttachmentM.mutate(a.id)}
                  disabled={downloadAttachmentM.isPending}
                >
                  다운로드
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  </div>

  <div className="border rounded bg-white">
    <div className="px-4 py-3 border-b text-sm font-semibold">메타 정보</div>
    <div className="p-4 space-y-3">
      <select
        className="w-full border rounded px-3 py-2 text-sm"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <textarea
        className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
        placeholder="상태 변경 메모 (선택)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {updateStatusM.isError && (
        <div className="text-xs text-red-600">
          {(updateStatusM.error as any)?.message ?? "상태 변경에 실패했습니다."}
        </div>
      )}
      <button
        className="w-full border rounded px-3 py-2 text-sm bg-white text-black hover:bg-gray-100 disabled:opacity-60"
        onClick={() => updateStatusM.mutate()}
        disabled={updateStatusM.isPending}
      >
        {updateStatusM.isPending ? "변경 중..." : "상태 업데이트"}
      </button>
    </div>
  </div>

  <div className="border rounded bg-white">
    <div className="px-4 py-2 border-b text-sm font-semibold">처리 이력</div>
    {data.events.length === 0 ? (
      <div className="p-4 text-sm text-gray-500">이력이 없습니다.</div>
    ) : (
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b">
            <th className="text-center p-2 w-16">No</th>
            <th className="text-center p-2 w-44">시각</th>
            <th className="text-center p-2 w-28">유형</th>
            <th className="text-center p-2">내용</th>
          </tr>
        </thead>
        <tbody>
          {data.events.map((e, idx) => {
            const editNote = e.type === "requester_updated" ? parseEditNote(e.note) : null;
            const summary = editNote?.summary ?? e.note ?? "-";
            const isExpandable = Boolean(editNote?.before);
            const isOpen = openEventId === e.id;
            const before = editNote?.before ?? {};
            const rowNo = data.events.length - idx;
            return (
              <Fragment key={e.id}>
                <tr
                  className={`border-b ${isExpandable ? "cursor-pointer hover:bg-gray-50" : ""}`}
                  onClick={() => {
                    if (!isExpandable) return;
                    setOpenEventId(isOpen ? null : e.id);
                  }}
                >
                  <td className="p-2 text-center">{rowNo}</td>
                  <td className="p-2 text-center text-gray-600">{formatDate(e.created_at)}</td>
                  <td className="p-2 text-center">{eventLabel(e.type)}</td>
                  <td className="p-2 text-center text-gray-700">{summary}</td>
                </tr>
                {isExpandable && isOpen && (
                  <tr className="border-b bg-gray-50/50">
                    <td className="p-3" colSpan={4}>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="border rounded bg-white">
                          <div className="px-3 py-2 text-xs font-semibold border-b">수정 전 메타정보</div>
                          <div className="divide-y text-xs">
                            <div className="grid grid-cols-12 border-b">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                제목
                              </div>
                              <div className="col-span-9 px-2 py-2">{before.title ?? "-"}</div>
                            </div>
                            <div className="grid grid-cols-12 border-b">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                우선순위
                              </div>
                              <div className="col-span-9 px-2 py-2">
                                {priorityMeta(before.priority ?? "medium").label}
                              </div>
                            </div>
                            <div className="grid grid-cols-12 border-b">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                카테고리
                              </div>
                              <div className="col-span-9 px-2 py-2">
                                {categoryLabel(before.category_id ?? null, categoryMap)}
                              </div>
                            </div>
                            <div className="grid grid-cols-12 border-b">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                작업 구분
                              </div>
                              <div className="col-span-9 px-2 py-2">{workTypeLabel(before.work_type)}</div>
                            </div>
                            <div className="grid grid-cols-12 border-b">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                프로젝트
                              </div>
                              <div className="col-span-9 px-2 py-2">{before.project_name ?? "-"}</div>
                            </div>
                            <div className="grid grid-cols-12 border-b">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                생성일
                              </div>
                              <div className="col-span-9 px-2 py-2">{formatDate(before.created_at)}</div>
                            </div>
                            <div className="grid grid-cols-12">
                              <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">
                                업데이트
                              </div>
                              <div className="col-span-9 px-2 py-2">{formatDate(before.updated_at)}</div>
                            </div>
                          </div>
                        </div>
<div className="border rounded bg-white">
                          <div className="px-3 py-2 text-xs font-semibold border-b">수정 전 요청 상세</div>
                          <div className="p-3 text-sm">
                            <TiptapViewer value={before.description ?? { type: "doc", content: [] }} />
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
</div>
        <aside className="border rounded bg-white h-fit">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">댓글</span>
            <button
              className="text-xs border rounded px-2 py-1"
              onClick={() => setCommentModalOpen(true)}
            >
              등록
            </button>
          </div>
          <div className="p-4 space-y-4">
            {data.comments.length === 0 ? (
              <div className="text-sm text-gray-500">등록된 댓글이 없습니다.</div>
            ) : (
              <div className="border rounded divide-y max-h-[520px] overflow-auto">
                {data.comments.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 transition-colors hover:bg-gray-50 active:bg-gray-100"
                    onClick={() => setOpenCommentId(c.id)}
                  >
                    <div className="text-sm font-semibold text-slate-900">{c.title || "제목 없음"}</div>
                    <div className="text-xs text-slate-600 mt-1">{formatUser(c.author, c.author_emp_no)}</div>
                    <div className="text-xs text-slate-500 mt-1">{formatDate(c.created_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>


      {selectedComment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <div className="text-base font-semibold">{selectedComment.title || "제목 없음"}</div>
                <div className="text-xs text-slate-600 mt-1">
                  {formatUser(selectedComment.author, selectedComment.author_emp_no)}
                </div>
                <div className="text-xs text-slate-500 mt-1">{formatDate(selectedComment.created_at)}</div>
              </div>
              <button className="text-sm border rounded px-3 py-1" onClick={() => setOpenCommentId(null)}>
                닫기
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="border rounded p-3 text-sm">
                <TiptapViewer value={selectedComment.body} />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold">첨부파일</div>
                {selectedAttachments.length === 0 ? (
                  <div className="text-sm text-gray-500">첨부파일이 없습니다.</div>
                ) : (
                  <div className="border rounded divide-y">
                    {selectedAttachments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between px-3 py-2">
                        <div className="text-sm">{a.filename}</div>
                        <button
                          className="text-sm border rounded px-2 py-1 transition-colors hover:bg-slate-50 active:bg-slate-100"
                          onClick={() => downloadAttachmentM.mutate(a.id)}
                          disabled={downloadAttachmentM.isPending}
                        >
                          다운로드
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {commentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <div className="text-base font-semibold">댓글 등록</div>
                <div className="text-xs text-gray-500 mt-1">제목과 내용을 입력해 주세요.</div>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white">
                <div className="grid grid-cols-12 border-b border-slate-200/70">
                  <div className="col-span-3 bg-slate-50 text-sm font-medium text-slate-700 px-3 py-2 border-r border-slate-200/70">
                    제목
                  </div>
                  <div className="col-span-9 px-3 py-2">
                    <input
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={commentTitle}
                      onChange={(e) => setCommentTitle(e.target.value)}
                      placeholder="댓글 제목을 입력하세요."
                      maxLength={200}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-slate-600">파일당 최대 25MB</div>
                <input
                  id="admin-comment-file-input"
                  type="file"
                  multiple
                  className="sr-only"
                  ref={commentFileInputRef}
                  onChange={(e) => {
                    addCommentFiles(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div
                  className="rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-3"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addCommentFiles(e.dataTransfer.files);
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
                      onClick={() => {
                        const input = commentFileInputRef.current;
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
                    <span className="text-sm text-slate-500">여기로 드래그 앤 드롭해도 됩니다.</span>
                    {commentFiles.length > 0 && (
                      <button
                        type="button"
                        className="text-sm text-slate-600 hover:underline"
                        onClick={() => setCommentFiles([])}
                      >
                        모두 제거
                      </button>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {commentFiles.length === 0 && (
                      <p className="text-sm text-slate-500">첨부파일이 없습니다.</p>
                    )}
                    {commentFiles.map((file, idx) => (
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
                          onClick={() => removeCommentFile(idx)}
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
                  value={commentBody}
                  onChange={(doc) => setCommentBody(doc)}
                  onError={setCommentError}
                  placeholder="댓글 내용을 입력하세요."
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={commentNotifyEmail}
                  onChange={(e) => setCommentNotifyEmail(e.target.checked)}
                />
                메일 알림 발송
              </label>

              {commentError && <div className="text-sm text-red-600">{commentError}</div>}

              <div className="flex items-center justify-end gap-2">
                <button
                  className="border rounded px-3 py-1 text-sm transition-colors hover:bg-slate-50 active:bg-slate-100"
                  type="button"
                  onClick={() => {
                    setCommentModalOpen(false);
                    setCommentError(null);
                  }}
                >
                  취소
                </button>
                <button
                  className="border rounded px-3 py-1 text-sm bg-slate-900 text-white transition-colors hover:bg-slate-800 active:bg-slate-900 disabled:opacity-60"
                  type="button"
                  onClick={() => {
                    setCommentError(null);
                    if (!commentTitle.trim()) {
                      setCommentError("댓글 제목을 입력하세요.");
                      return;
                    }
                    if (isEmptyDoc(commentBody)) {
                      setCommentError("댓글 내용을 입력하세요.");
                      return;
                    }
                    createCommentM.mutate();
                  }}
                  disabled={createCommentM.isPending}
                >
                  {createCommentM.isPending ? "등록 중..." : "등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
