"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiForm } from "@/lib/api";
import { getToken } from "@/lib/auth";
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
  reopen_id: number | null;
  uploaded_emp_no: string;
  created_at?: string | null;
};

type Comment = {
  id: number;
  ticket_id: number;
  reopen_id: number | null;
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

type Reopen = {
  id: number;
  ticket_id: number;
  description: TiptapDoc;
  requester_emp_no: string;
  created_at: string;
};

type TicketDetail = {
  ticket: Ticket;
  comments: Comment[];
  events: Event[];
  attachments: Attachment[];
  reopens: Reopen[];
};

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

function workTypeLabel(value?: string | null) {
  if (!value) return null;
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  ticket_created: "요청 접수",
  status_changed: "상태 변경",
  reopened: "재요청 접수",
};

function eventLabel(type: string) {
  return EVENT_TYPE_LABELS[type] ?? type;
}

const STATUS_LABELS_FOR_EVENT: Record<string, string> = {
  open: "대기",
  in_progress: "진행",
  resolved: "완료",
  closed: "사업 검토",
};

/** 처리이력 내용: 요청 접수·상태 변경·재요청만 */
function eventContent(e: Event): string {
  if (e.type === "ticket_created") return "요청이 접수되었습니다.";
  if (e.type === "reopened") return "재요청이 접수되었습니다.";
  if (e.type === "status_changed") {
    const n = e.note?.trim();
    if (n) return n;
    const from = e.from_value ? (STATUS_LABELS_FOR_EVENT[e.from_value] ?? e.from_value) : "미정";
    const to = e.to_value ? (STATUS_LABELS_FOR_EVENT[e.to_value] ?? e.to_value) : "미정";
    return `${from} → ${to}`;
  }
  return e.note?.trim() || "-";
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

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const { map: categoryMap } = useTicketCategories();
  const ticketId = Number(params.id);

  const [commentBody, setCommentBody] = useState<TiptapDoc>(EMPTY_DOC);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentNotifyEmail, setCommentNotifyEmail] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [bodyTab, setBodyTab] = useState<"initial" | number>("initial");
  const initialTabSetForTicket = useRef<number | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticketDetail", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}/detail`),
    enabled: Number.isFinite(ticketId),
  });

  useEffect(() => {
    if (!data?.ticket?.id) return;
    if (initialTabSetForTicket.current === data.ticket.id) return;
    initialTabSetForTicket.current = data.ticket.id;
    if ((data.reopens?.length ?? 0) > 0 && data.ticket.status === "open") {
      setBodyTab(data.reopens.length - 1);
    } else {
      setBodyTab("initial");
    }
  }, [data?.ticket?.id, data?.reopens?.length, data?.ticket?.status]);

  // 처리이력: 요청 접수·상태 변경·재요청만, 시간순(과거 → 현재) 정렬
  const filteredEvents = useMemo(() => {
    if (!data?.events) return [];
    return [...data.events]
      .filter((e) => e.type === "ticket_created" || e.type === "status_changed" || e.type === "reopened")
      .sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
  }, [data?.events]);

  const reopens = data?.reopens ?? [];
  const currentReopenId = bodyTab === "initial" ? null : reopens[bodyTab]?.id ?? null;
  const bodyContent =
    bodyTab === "initial"
      ? data?.ticket?.description
      : reopens[bodyTab]?.description;
  const ticketAttachmentsFiltered = useMemo(() => {
    if (!data?.attachments) return [];
    const list = data.attachments.filter((a) => !a.comment_id);
    if (reopens.length === 0) return list;
    if (bodyTab === "initial") return list.filter((a) => !(a as Attachment).reopen_id);
    return list.filter((a) => (a as Attachment).reopen_id === currentReopenId);
  }, [data?.attachments, bodyTab, currentReopenId, reopens.length]);
  const commentsFiltered = useMemo(() => {
    if (!data?.comments) return [];
    if (reopens.length === 0) return data.comments;
    if (bodyTab === "initial") return data.comments.filter((c) => !c.reopen_id);
    return data.comments.filter((c) => c.reopen_id === currentReopenId);
  }, [data?.comments, bodyTab, currentReopenId, reopens.length]);

  // 완료일: 상태가 '완료'(resolved)일 때, status_changed → resolved 이벤트 중 가장 최근 시각
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

  const createCommentM = useMutation({
    mutationFn: async () => {
      const created = await api<{ id: number }>(`/tickets/${ticketId}/comments`, {
        method: "POST",
        body: {
          title: "답변",
          body: commentBody,
          notify_email: commentNotifyEmail,
          reopen_id: currentReopenId ?? undefined,
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
      qc.invalidateQueries({ queryKey: ["ticketDetail", ticketId] });
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    onError: () => {
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
    setCommentFiles((prev) => prev.filter((_, i) => i !== idx));
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
  const statusInfo = statusMeta(t.status);
  const priorityInfo = priorityMeta(t.priority);

  // 제목 표시: 최초 요청 탭이면 [재요청] 제거, 재요청 탭이면 [재요청] 추가
  const displayTitle = useMemo(() => {
    const baseTitle = t.title.replace(/^\[재요청\]\s*/, "");
    if (bodyTab === "initial") {
      return baseTitle;
    }
    return `[재요청] ${baseTitle}`;
  }, [t.title, bodyTab]);

  return (
    <>
      <div className="space-y-6 animate-fadeIn">
        <Card>
          <CardBody padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1
                  className="text-2xl font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {displayTitle}
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
                  onClick={() => router.back()}
                >
                  돌아가기
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
                  <Badge variant={statusInfo.variant} size="md">
                    {statusInfo.label}
                  </Badge>
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
                  (t.assignees?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {t.assignees!.map((u) => (
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
                      ))}
                    </div>
                  ) : (t.assignee_emp_nos?.length ?? 0) > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {t.assignee_emp_nos!.map((empNo) => (
                        <span
                          key={empNo}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                          style={{
                            backgroundColor: "var(--color-primary-50)",
                            color: "var(--color-primary-700)",
                            border: "1px solid var(--color-primary-200)",
                          }}
                        >
                          {empNo}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                      미배정
                    </span>
                  )
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
                  (() => {
                    const ids = t.category_ids ?? (t.category_id ? [t.category_id] : []);
                    if (!ids.length) return <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>-</span>;
                    return (
                      <div className="flex flex-wrap items-center gap-2">
                        {ids.map((id) => (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{
                              backgroundColor: "var(--color-info-50)",
                              color: "var(--color-info-700)",
                              border: "1px solid var(--color-info-200)",
                            }}
                          >
                            {categoryMap[id] ?? String(id)}
                          </span>
                        ))}
                      </div>
                    );
                  })()
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
                  !t.work_type ? (
                    <span style={{ color: "var(--text-tertiary)" }}>선택 안 함</span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
                      style={{
                        backgroundColor: "var(--color-success-50)",
                        color: "var(--color-success-700)",
                        border: "1px solid var(--color-success-200)",
                      }}
                    >
                      {workTypeLabel(t.work_type)}
                    </span>
                  )
                }
              />
              <FieldRow label="" value="" />
            </div>
        </div>

        <Card>
          <CardHeader>
            {reopens.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b pb-3 mb-3" style={{ borderColor: "var(--border-default)" }}>
                <button
                  type="button"
                  onClick={() => setBodyTab("initial")}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: bodyTab === "initial" ? "var(--color-primary-100)" : "var(--bg-subtle)",
                    color: bodyTab === "initial" ? "var(--color-primary-700)" : "var(--text-secondary)",
                  }}
                >
                  최초 요청
                </button>
                {reopens.map((_, idx) => (
                  <button
                    key={reopens[idx].id}
                    type="button"
                    onClick={() => setBodyTab(idx)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: bodyTab === idx ? "var(--color-primary-100)" : "var(--bg-subtle)",
                      color: bodyTab === idx ? "var(--color-primary-700)" : "var(--text-secondary)",
                    }}
                  >
                    재요청 #{idx + 1}
                  </button>
                ))}
              </div>
            )}
            <h2
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              요청 상세
            </h2>
          </CardHeader>
          <CardBody padding="lg">
            <div className="prose max-w-none text-sm" style={{ color: "var(--text-primary)" }}>
              <TiptapViewer value={bodyContent ?? EMPTY_DOC} />
            </div>

            {ticketAttachmentsFiltered.length > 0 && (
              <>
                <div 
                  className="border-t my-4"
                  style={{ borderColor: "var(--border-default)" }}
                />
                <div className="space-y-2">
                  <div 
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    첨부파일
                  </div>
                  <div 
                    className="border rounded-lg"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    {ticketAttachmentsFiltered.map((a, idx) => (
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
                        <div>
                          <div 
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {a.filename}
                          </div>
                          <div 
                            className="text-xs mt-0.5"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {formatBytes(a.size)}
                          </div>
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

        {commentsFiltered.length === 0 ? (
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
            {commentsFiltered.map((c) => {
              const isMyComment = me.emp_no === c.author_emp_no;
              const commentAttachments = data.attachments.filter((a) => a.comment_id === c.id);
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
              id="comment-file-input"
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
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
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
                    backgroundColor: "var(--bg-elevated)",
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
            <div className="text-xs" style={{ color: "var(--color-danger-600)" }}>
              {commentError}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <button
              className="flex items-center justify-between w-full cursor-pointer"
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            >
              <h2 
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                처리 이력
              </h2>
              <span 
                className="text-sm transition-transform"
                style={{ 
                  color: "var(--text-secondary)",
                  transform: isHistoryOpen ? "rotate(90deg)" : "rotate(0deg)"
                }}
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
                      {filteredEvents.map((e, idx) => (
                        <tr
                          key={e.id}
                          style={{ borderBottom: "1px solid var(--border-default)" }}
                        >
                          <td
                            className="p-3 text-center"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {idx + 1}
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
                            className="p-3 text-left px-3"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {eventContent(e)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          )}
        </Card>
      </div>
    </>
  );
}
