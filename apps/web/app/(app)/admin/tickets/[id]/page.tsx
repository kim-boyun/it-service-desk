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
import { Badge, Card, CardHeader, CardBody } from "@/components/ui";

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
  category_ids?: number[] | null;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  requester?: UserSummary | null;
  requester_emp_no: string;
  assignee?: UserSummary | null;
  assignee_emp_no: string | null;
  assignee_emp_nos?: string[] | null;
  assignees?: UserSummary[];
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
  { value: "open", label: "대기" },
  { value: "in_progress", label: "진행" },
  { value: "resolved", label: "완료" },
  { value: "closed", label: "사업 검토" },
];

const UNSAVED_MESSAGE =
  "페이지를 나가면 변경사항이 저장되지 않습니다.\n그래도 이동하시겠습니까?";

const MAX_COMMENT_FILE_BYTES = 25 * 1024 * 1024;

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral";

function statusMeta(status: string): { label: string; variant: BadgeVariant } {
  const s = status.toLowerCase();
  if (["open", "new", "pending"].includes(s)) {
    return { label: "대기", variant: "info" };
  }
  if (["in_progress", "processing", "assigned"].includes(s)) {
    return { label: "진행", variant: "warning" };
  }
  if (s === "resolved") {
    return { label: "완료", variant: "success" };
  }
  if (s === "closed") {
    return { label: "사업 검토", variant: "neutral" };
  }
  return { label: status, variant: "default" };
}

function priorityMeta(priority: string): { label: string; variant: BadgeVariant } {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    low: { label: "낮음", variant: "default" },
    medium: { label: "보통", variant: "info" },
    high: { label: "높음", variant: "warning" },
    urgent: { label: "긴급", variant: "danger" },
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

function formatAssignees(list?: UserSummary[] | null, fallback?: string[] | null) {
  if (list && list.length > 0) {
    return list.map((u) => formatUser(u, u.emp_no)).join(", ");
  }
  if (fallback && fallback.length > 0) {
    return fallback.join(", ");
  }
  return "미배정";
}

function formatCategoryList(ids: number[] | null | undefined, map: Record<number, string>) {
  if (!ids || ids.length === 0) return "-";
  return ids.map((id) => map[id] ?? String(id)).join(", ");
}

function FieldRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div 
      className="grid grid-cols-12 transition-colors"
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <div 
        className="col-span-4 text-sm px-4 py-2.5 font-medium"
        style={{ 
          backgroundColor: "var(--bg-subtle)",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </div>
      <div 
        className="col-span-8 text-sm px-4 py-2.5"
        style={{ 
          backgroundColor: "rgba(0,0,0,0)",
          color: "var(--text-primary)",
          borderLeft: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))",
        }}
      >
        {value ?? "-"}
      </div>
    </div>
  );
}

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) 
    ? "-" 
    : d.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function eventLabel(type: string) {
  const map: Record<string, string> = {
    ticket_created: "요청 접수",
    status_changed: "상태 변경",
    assignee_assigned: "담당자 지정",
    assignee_changed: "담당자 변경",
    requester_updated: "요청 수정",
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
  const rawId = params?.id;
  const ticketId = typeof rawId === "string" ? Number(rawId) : NaN;
  const isTicketIdValid = Number.isSafeInteger(ticketId) && ticketId > 0;
  const isStaff = me.role === "admin";

  const [status, setStatus] = useState("open");
  const [openEventId, setOpenEventId] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [assigneeEmpNos, setAssigneeEmpNos] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [workType, setWorkType] = useState<string>("");
  const [commentBody, setCommentBody] = useState<TiptapDoc>(EMPTY_DOC);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentNotifyEmail, setCommentNotifyEmail] = useState(true);
  const [isEditingAssignees, setIsEditingAssignees] = useState(false);
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [isEditingWorkType, setIsEditingWorkType] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  const hasUnsavedComment = false;

  useEffect(() => {
    if (!isStaff) {
      router.replace("/home");
    }
  }, [isStaff, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-ticket-detail", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}/detail?scope=all`),
    enabled: isStaff && isTicketIdValid,
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
    const nextAssignees =
      t.assignee_emp_nos && t.assignee_emp_nos.length > 0
        ? t.assignee_emp_nos
        : t.assignee_emp_no
          ? [t.assignee_emp_no]
          : [];
    const nextCategories =
      t.category_ids && t.category_ids.length > 0
        ? t.category_ids
        : t.category_id
          ? [t.category_id]
          : [];
    setAssigneeEmpNos(nextAssignees);
    setCategoryIds(nextCategories);
    setWorkType(t.work_type ?? "");
  }, [data?.ticket]);

  const downloadAttachmentM = useMutation({
    mutationFn: async (attachmentId: number) => {
      const { url, filename: apiFilename } = await api<{ url: string; filename?: string }>(`/attachments/${attachmentId}/download-url`);
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const token = getToken();
      const isAbsolute = /^https?:\/\//i.test(url);
      const targetUrl = isAbsolute ? url : `${apiBase}${url}`;

      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Download failed ${res.status}: ${text}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = apiFilename ?? m?.[1] ?? `attachment-${attachmentId}`;

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
    mutationFn: (newStatus?: string) =>
      api(`/tickets/${ticketId}/status`, {
        method: "PATCH",
        body: { status: newStatus ?? status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
  });


  const updateAssigneesM = useMutation({
    mutationFn: (nextEmpNos: string[]) =>
      api(`/tickets/${ticketId}/assignees`, {
        method: "PATCH",
        body: { assignee_emp_nos: nextEmpNos },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    },
  });

  const updateMetaM = useMutation({
    mutationFn: (payload: { category_ids?: number[] | null; work_type?: string | null }) =>
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
          title: "답변",
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
      setCommentBody(EMPTY_DOC);
      setCommentFiles([]);
      setCommentNotifyEmail(false);
      setCommentError(null);
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    onError: (err: any) => {
      setCommentError("답변 등록에 실패했습니다.");
    },
  });

  function addCommentFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList);
    setCommentError(null);
    setCommentFiles((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (file.size > MAX_COMMENT_FILE_BYTES) {
          setCommentError("파일은 25MB 이하여야 합니다.");
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

  if (!isTicketIdValid) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          잘못된 요청 ID입니다.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          요청을 불러오는 중...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: "var(--color-danger-600)" }}>
          오류: {(error as any).message}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          요청이 없습니다.
        </div>
      </div>
    );
  }

  const t = data.ticket;
  if (!t) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          요청을 찾을 수 없습니다.
        </div>
      </div>
    );
  }
  const statusInfo = statusMeta(t.status);
  const priorityInfo = priorityMeta(t.priority);
  const attachments = data.attachments ?? [];
  const comments = data.comments ?? [];
  const ticketAttachments = attachments.filter((a) => !a.comment_id);
  const events = data.events ?? [];

  // Filter events to only show relevant types
  const filteredEvents = useMemo(() => {
    return events.filter((e) => 
      ["ticket_created", "assignee_assigned", "assignee_changed", "status_changed"].includes(e.type)
    );
  }, [events]);

  // 완료일: 상태가 '완료'(resolved)일 때만, status_changed → resolved 이벤트 중 가장 최근 시각
  const resolvedAt = useMemo(() => {
    const evs = (data?.events ?? []).filter(
      (e) => e.type === "status_changed" && e.to_value === "resolved"
    );
    if (evs.length === 0) return null;
    const sorted = [...evs].sort(
      (a, b) => new Date((b as { created_at?: string }).created_at ?? 0).getTime() - new Date((a as { created_at?: string }).created_at ?? 0).getTime()
    );
    return sorted[0]?.created_at ?? null;
  }, [data?.events]);

  return (
    <>
      <div className="flex gap-6 animate-fadeIn relative">
        <div className="flex-1 space-y-6">
        <Card>
          <CardBody padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 
                  className="text-2xl font-semibold" 
                  style={{ color: "var(--text-primary)" }}
                >
                  {t.title}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                    e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                  onClick={() => {
                    if (hasUnsavedComment && !confirm(UNSAVED_MESSAGE)) return;
                    router.back();
                  }}
                >
                  돌아가기
                </button>
                <button
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
                  style={{
                    backgroundColor: "var(--color-danger-50)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: "var(--color-danger-200)",
                    color: "var(--color-danger-700)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-danger-100)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-danger-50)";
                  }}
                  onClick={() => {
                    if (!confirm("요청을 삭제하시겠습니까?")) return;
                    deleteM.mutate();
                  }}
                  disabled={deleteM.isPending}
                >
                  {deleteM.isPending ? "삭제 중.." : "삭제"}
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        <div 
          className="overflow-hidden rounded-xl"
          style={{ 
            border: "1px solid var(--border-default)",
            backgroundColor: "var(--bg-card)",
          }}
        >
            <div className="relative grid grid-cols-1 md:grid-cols-2">
              <div
                className="hidden md:block absolute inset-y-0 left-1/2 w-px"
                style={{ backgroundColor: "var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
              />
              <FieldRow label="요청자" value={formatUser(t.requester, t.requester_emp_no)} />
              <FieldRow
                label="상태"
                value={
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={status}
                      onChange={(e) => {
                        const v = e.target.value;
                        setStatus(v);
                        updateStatusM.mutate(v);
                      }}
                      className="text-sm px-3 py-1.5 rounded-lg border"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-default)",
                        color: "var(--text-primary)",
                        minWidth: "120px",
                      }}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {updateStatusM.isError && (
                      <span className="text-xs" style={{ color: "var(--color-danger-600)" }}>
                        상태 변경에 실패했습니다.
                      </span>
                    )}
                  </div>
                }
              />
            </div>
            <div 
              className="relative grid grid-cols-1 md:grid-cols-2"
              style={{ borderTop: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
            >
              <div
                className="hidden md:block absolute inset-y-0 left-1/2 w-px"
                style={{ backgroundColor: "var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
              />
              <FieldRow
                label="담당자"
                value={
                  <div className="space-y-2">
                    {!isEditingAssignees ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {assigneeEmpNos.length === 0 ? (
                          <span 
                            className="text-sm"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            미배정
                          </span>
                        ) : (
                          staffOptions
                            .filter((u) => assigneeEmpNos.includes(u.emp_no))
                            .map((u) => (
                              <span
                                key={u.emp_no}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                                style={{
                                  backgroundColor: "var(--color-primary-50)",
                                  color: "var(--color-primary-700)",
                                  border: "1px solid var(--color-primary-200)",
                                }}
                              >
                                {formatUser(u, u.emp_no)}
                              </span>
                            ))
                        )}
                        <button
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{
                            color: "var(--color-primary-600)",
                            backgroundColor: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                          }}
                          onClick={() => setIsEditingAssignees(true)}
                        >
                          편집
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {staffOptions.length === 0 && (
                            <span className="text-xs col-span-2" style={{ color: "var(--text-tertiary)" }}>
                              관리자 계정이 없습니다.
                            </span>
                          )}
                          {staffOptions.map((u) => {
                            const checked = assigneeEmpNos.includes(u.emp_no);
                            return (
                              <label key={u.emp_no} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded"
                                  style={{ accentColor: "var(--color-primary-600)" }}
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? assigneeEmpNos.filter((empNo) => empNo !== u.emp_no)
                                      : [...assigneeEmpNos, u.emp_no];
                                    setAssigneeEmpNos(next);
                                    updateAssigneesM.mutate(next);
                                  }}
                                />
                                <span>{formatUser(u, u.emp_no)}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs px-3 py-1 rounded transition-colors font-medium"
                            style={{
                              color: "white",
                              backgroundColor: "var(--color-primary-600)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--color-primary-700)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--color-primary-600)";
                            }}
                            onClick={() => setIsEditingAssignees(false)}
                          >
                            완료
                          </button>
                          {updateAssigneesM.isError && (
                            <div className="text-xs" style={{ color: "var(--color-danger-600)" }}>
                              담당자 변경에 실패했습니다.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                }
              />
              <FieldRow label="프로젝트" value={t.project_name ?? "-"} />
            </div>
            <div 
              className="relative grid grid-cols-1 md:grid-cols-2"
              style={{ borderTop: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
            >
              <div
                className="hidden md:block absolute inset-y-0 left-1/2 w-px"
                style={{ backgroundColor: "var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
              />
              <FieldRow
                label="카테고리"
                value={
                  <div className="space-y-2">
                    {!isEditingCategories ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {categoryIds.length === 0 ? (
                          <span 
                            className="text-sm"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            선택 안 함
                          </span>
                        ) : (
                          categories
                            .filter((c) => categoryIds.includes(c.id))
                            .map((c) => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                                style={{
                                  backgroundColor: "var(--color-info-50)",
                                  color: "var(--color-info-700)",
                                  border: "1px solid var(--color-info-200)",
                                }}
                              >
                                {c.name}
                              </span>
                            ))
                        )}
                        <button
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{
                            color: "var(--color-primary-600)",
                            backgroundColor: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                          }}
                          onClick={() => setIsEditingCategories(true)}
                        >
                          편집
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {categories.length === 0 && (
                            <span className="text-xs col-span-2" style={{ color: "var(--text-tertiary)" }}>
                              카테고리가 없습니다.
                            </span>
                          )}
                          {categories.map((c) => {
                            const checked = categoryIds.includes(c.id);
                            return (
                              <label key={c.id} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded"
                                  style={{ accentColor: "var(--color-primary-600)" }}
                                  checked={checked}
                                  onChange={() => {
                                    const next = checked
                                      ? categoryIds.filter((id) => id !== c.id)
                                      : [...categoryIds, c.id];
                                    setCategoryIds(next);
                                    updateMetaM.mutate({
                                      category_ids: next,
                                      work_type: workType || null,
                                    });
                                  }}
                                />
                                <span>{c.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs px-3 py-1 rounded transition-colors font-medium"
                            style={{
                              color: "white",
                              backgroundColor: "var(--color-primary-600)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--color-primary-700)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--color-primary-600)";
                            }}
                            onClick={() => setIsEditingCategories(false)}
                          >
                            완료
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                }
              />
              <FieldRow label="생성일" value={formatDate(t.created_at)} />
            </div>
            {t.status === "resolved" && resolvedAt && (
              <div
                className="relative grid grid-cols-1 md:grid-cols-2"
                style={{ borderTop: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
              >
                <div
                  className="hidden md:block absolute inset-y-0 left-1/2 w-px"
                  style={{ backgroundColor: "var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
                />
                <FieldRow label="완료일" value={formatDate(resolvedAt)} />
                <FieldRow label="" value="" />
              </div>
            )}
            <div 
              className="relative grid grid-cols-1 md:grid-cols-2"
              style={{ borderTop: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
            >
              <div
                className="hidden md:block absolute inset-y-0 left-1/2 w-px"
                style={{ backgroundColor: "var(--border-subtle, rgba(0, 0, 0, 0.06))" }}
              />
              <FieldRow
                label="작업 구분"
                value={
                  <div className="space-y-2">
                    {!isEditingWorkType ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {!workType ? (
                          <span 
                            className="text-sm"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            선택 안 함
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{
                              backgroundColor: "var(--color-success-50)",
                              color: "var(--color-success-700)",
                              border: "1px solid var(--color-success-200)",
                            }}
                          >
                            {workTypeLabel(workType)}
                          </span>
                        )}
                        <button
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{
                            color: "var(--color-primary-600)",
                            backgroundColor: "var(--bg-elevated)",
                            border: "1px solid var(--border-default)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                          }}
                          onClick={() => setIsEditingWorkType(true)}
                        >
                          편집
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-2">
                          {WORK_TYPE_OPTIONS.map((o) => (
                            <label key={o.value} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="radio"
                                className="h-4 w-4"
                                style={{ accentColor: "var(--color-primary-600)" }}
                                checked={workType === o.value}
                                onChange={() => {
                                  setWorkType(o.value);
                                  updateMetaM.mutate({
                                    category_ids: categoryIds,
                                    work_type: o.value,
                                  });
                                }}
                              />
                              <span>{o.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs px-3 py-1 rounded transition-colors font-medium"
                            style={{
                              color: "white",
                              backgroundColor: "var(--color-primary-600)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--color-primary-700)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "var(--color-primary-600)";
                            }}
                            onClick={() => setIsEditingWorkType(false)}
                          >
                            완료
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                }
              />
              <FieldRow label="" value="" />
            </div>
        </div>

        <Card>
          <CardHeader>
            <h2 
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              요청 상세
            </h2>
          </CardHeader>
          <CardBody padding="lg">
            <div 
              className="rounded-lg border p-4 text-sm"
              style={{ 
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-subtle)"
              }}
            >
              <TiptapViewer value={t.description} />
            </div>
            {ticketAttachments.length > 0 && (
              <>
                <div 
                  className="my-4"
                  style={{ 
                    borderTop: "1px solid var(--border-default)"
                  }}
                />
                <div className="space-y-3">
                  <div 
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    첨부파일
                  </div>
                  <div 
                    className="border rounded-lg"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    {ticketAttachments.map((a, idx) => (
                      <div 
                        key={a.id} 
                        className="flex items-center justify-between px-4 py-3 transition-colors"
                        style={{
                          borderTop: idx > 0 ? "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))" : undefined,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div 
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {a.filename}
                        </div>
                        <button
                          className="text-sm rounded-lg px-3 py-1.5 font-medium transition-all"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderColor: "var(--border-default)",
                            color: "var(--text-primary)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                          }}
                          onClick={() => downloadAttachmentM.mutate(a.id)}
                          disabled={downloadAttachmentM.isPending}
                        >
                          다운로드
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {comments.length === 0 ? (
          <Card>
            <CardBody padding="lg">
              <div 
                className="text-sm text-center py-8"
                style={{ color: "var(--text-tertiary)" }}
              >
                아직 답변이 없습니다. 첫 번째 답변을 작성해보세요.
              </div>
            </CardBody>
          </Card>
        ) : (
          <>
            {comments.map((c, index) => {
              const isMyComment = me.emp_no === c.author_emp_no;
              const commentAttachments = attachments.filter((a) => a.comment_id === c.id);
              return (
                <Card key={c.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3">
                        <span 
                          className="text-sm font-semibold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          답변
                        </span>
                        <span 
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: isMyComment ? "var(--color-primary-100)" : "var(--bg-subtle)",
                            color: isMyComment ? "var(--color-primary-700)" : "var(--text-secondary)",
                          }}
                        >
                          {formatUser(c.author, c.author_emp_no)}
                        </span>
                      </div>
                      <span 
                        className="text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {formatDate(c.created_at)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardBody padding="lg">
                    <div className="prose max-w-none" style={{ color: "var(--text-primary)" }}>
                      <TiptapViewer value={c.body} />
                    </div>
                    
                    {commentAttachments.length > 0 && (
                      <div 
                        className="mt-4 pt-4 space-y-2"
                        style={{ borderTop: "1px solid var(--border-default)" }}
                      >
                        <div 
                          className="text-xs font-medium mb-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          첨부파일 ({commentAttachments.length})
                        </div>
                        {commentAttachments.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between p-3 rounded-lg transition-colors"
                            style={{ 
                              backgroundColor: "var(--bg-subtle)",
                              border: "1px solid var(--border-default)"
                            }}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span style={{ color: "var(--text-secondary)" }}>📎</span>
                              <span 
                                className="text-sm font-medium truncate"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {a.filename}
                              </span>
                              <span 
                                className="text-xs"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                ({formatBytes(a.size)})
                              </span>
                            </div>
                            <button
                              className="text-xs rounded-lg px-3 py-1.5 font-medium transition-all flex-shrink-0 ml-3"
                              style={{
                                backgroundColor: "var(--bg-elevated)",
                                borderWidth: "1px",
                                borderStyle: "solid",
                                borderColor: "var(--border-default)",
                                color: "var(--text-primary)",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                              }}
                              onClick={() => downloadAttachmentM.mutate(a.id)}
                              disabled={downloadAttachmentM.isPending}
                            >
                              다운로드
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
            <div ref={commentsEndRef} />
          </>
        )}

        <div className="space-y-3">
          <RichTextEditor
            value={commentBody}
            onChange={(doc) => setCommentBody(doc)}
            onError={setCommentError}
            placeholder="답변을 입력하세요..."
            minHeight="100px"
          />

          <div className="flex items-center gap-2">
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
                <button
                  type="button"
                  className="text-xs rounded-lg px-3 py-1.5 font-medium transition-all"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  }}
                  onClick={() => commentFileInputRef.current?.click()}
                >
                  📎 파일 첨부
                </button>

                {commentFiles.length > 0 && (
                  <span 
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {commentFiles.length}개 파일
                  </span>
                )}

                <div className="flex-1" />

                <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded"
                    checked={commentNotifyEmail}
                    onChange={(e) => setCommentNotifyEmail(e.target.checked)}
                  />
                  메일 알림
                </label>

                <button
                  className="text-sm rounded-lg px-5 py-2.5 font-medium transition-all disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--color-primary-600)",
                    color: "#ffffff",
                  }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = "var(--color-primary-700)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--color-primary-600)";
                  }}
                  disabled={createCommentM.isPending || isEmptyDoc(commentBody)}
                  onClick={() => {
                    setCommentError(null);
                    if (isEmptyDoc(commentBody)) {
                      setCommentError("답변 내용을 입력하세요.");
                      return;
                    }
                    createCommentM.mutate();
                  }}
                >
                  {createCommentM.isPending ? "등록 중..." : "등록"}
                </button>
              </div>

              {commentFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {commentFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 rounded-lg border px-2 py-1 text-xs"
                      style={{ 
                        borderColor: "var(--border-default)",
                        backgroundColor: "var(--bg-elevated)"
                      }}
                    >
                      <span style={{ color: "var(--text-primary)" }}>{file.name}</span>
                      <span style={{ color: "var(--text-tertiary)" }}>({formatBytes(file.size)})</span>
                      <button
                        type="button"
                        className="hover:underline"
                        style={{ color: "var(--color-danger-600)" }}
                        onClick={() => removeCommentFile(idx)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

          {commentError && (
            <div 
              className="text-xs"
              style={{ color: "var(--color-danger-600)" }}
            >
              {commentError}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <button
              type="button"
              className="w-full flex items-center justify-between cursor-pointer"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            >
              <h2 
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                처리 이력
              </h2>
              <span 
                className="text-lg"
                style={{ color: "var(--text-secondary)" }}
              >
                {isHistoryOpen ? "▼" : "▶"}
              </span>
            </button>
          </CardHeader>
          {isHistoryOpen && (
            <CardBody padding="none">
              {filteredEvents.length === 0 ? (
                <div 
                  className="text-sm text-center py-8"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  처리 이력이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead style={{ backgroundColor: "var(--bg-subtle)" }}>
                      <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                        <th 
                          className="text-center p-3 w-16 font-semibold"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          No
                        </th>
                        <th 
                          className="text-center p-3 font-semibold"
                          style={{ color: "var(--text-secondary)", minWidth: "180px" }}
                        >
                          시각
                        </th>
                        <th 
                          className="text-center p-3 font-semibold"
                          style={{ color: "var(--text-secondary)", minWidth: "140px" }}
                        >
                          유형
                        </th>
                        <th 
                          className="text-center p-3 font-semibold"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          내용
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((e, idx) => {
                        const editNote = e.type === "requester_updated" ? parseEditNote(e.note) : null;
                        const summary = editNote?.summary ?? e.note ?? "-";
                        const isExpandable = Boolean(editNote?.before);
                        const isOpen = openEventId === e.id;
                        const before = editNote?.before ?? {};
                        const rowNo = filteredEvents.length - idx;
                        return (
                          <Fragment key={e.id}>
                            <tr
                              className={`${isExpandable ? "cursor-pointer transition-colors" : ""}`}
                              style={{ borderBottom: "1px solid var(--border-default)" }}
                              onMouseEnter={(e) => {
                                if (isExpandable) {
                                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                              onClick={() => {
                                if (!isExpandable) return;
                                setOpenEventId(isOpen ? null : e.id);
                              }}
                            >
                              <td 
                                className="p-3 text-center"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {rowNo}
                              </td>
                              <td 
                                className="p-3 text-center"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {formatDate(e.created_at)}
                              </td>
                              <td 
                                className="p-3 text-center"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {eventLabel(e.type)}
                              </td>
                              <td 
                                className="p-3 text-center"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {summary}
                              </td>
                            </tr>
                            {isExpandable && isOpen && (
                              <tr 
                                style={{ 
                                  borderBottom: "1px solid var(--border-default)",
                                  backgroundColor: "var(--bg-subtle)"
                                }}
                              >
                                <td className="p-4" colSpan={4}>
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <Card>
                                      <CardHeader>
                                        <h3 
                                          className="text-xs font-semibold"
                                          style={{ color: "var(--text-primary)" }}
                                        >
                                          수정 전 정보
                                        </h3>
                                      </CardHeader>
                                      <CardBody padding="none">
                                        <div 
                                          className="divide-y text-xs"
                                          style={{ borderColor: "var(--border-default)" }}
                                        >
                                          <div 
                                            className="grid grid-cols-12"
                                            style={{ borderBottom: "1px solid var(--border-default)" }}
                                          >
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              제목
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {before.title ?? "-"}
                                            </div>
                                          </div>
                                          <div 
                                            className="grid grid-cols-12"
                                            style={{ borderBottom: "1px solid var(--border-default)" }}
                                          >
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              우선순위
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {priorityMeta(before.priority ?? "medium").label}
                                            </div>
                                          </div>
                                          <div 
                                            className="grid grid-cols-12"
                                            style={{ borderBottom: "1px solid var(--border-default)" }}
                                          >
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              카테고리
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {formatCategoryList(
                                                before.category_ids ??
                                                  (before.category_id ? [before.category_id] : []),
                                                categoryMap,
                                              )}
                                            </div>
                                          </div>
                                          <div 
                                            className="grid grid-cols-12"
                                            style={{ borderBottom: "1px solid var(--border-default)" }}
                                          >
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              작업 구분
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {workTypeLabel(before.work_type)}
                                            </div>
                                          </div>
                                          <div 
                                            className="grid grid-cols-12"
                                            style={{ borderBottom: "1px solid var(--border-default)" }}
                                          >
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              프로젝트
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {before.project_name ?? "-"}
                                            </div>
                                          </div>
                                          <div 
                                            className="grid grid-cols-12"
                                            style={{ borderBottom: "1px solid var(--border-default)" }}
                                          >
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              생성일
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {formatDate(before.created_at)}
                                            </div>
                                          </div>
                                          <div className="grid grid-cols-12">
                                            <div 
                                              className="col-span-3 px-2 py-2 border-r"
                                              style={{ 
                                                color: "var(--text-secondary)",
                                                backgroundColor: "var(--bg-subtle)",
                                                borderColor: "var(--border-default)"
                                              }}
                                            >
                                              최근 업데이트
                                            </div>
                                            <div 
                                              className="col-span-9 px-2 py-2"
                                              style={{ color: "var(--text-primary)" }}
                                            >
                                              {formatDate(before.updated_at)}
                                            </div>
                                          </div>
                                        </div>
                                      </CardBody>
                                    </Card>
                                    <Card>
                                      <CardHeader>
                                        <h3 
                                          className="text-xs font-semibold"
                                          style={{ color: "var(--text-primary)" }}
                                        >
                                          이전 요청 상세
                                        </h3>
                                      </CardHeader>
                                      <CardBody padding="md">
                                        <div className="text-sm">
                                          <TiptapViewer value={before.description ?? { type: "doc", content: [] }} />
                                        </div>
                                      </CardBody>
                                    </Card>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          )}
        </Card>
        </div>
      </div>
    </>
  );
}
