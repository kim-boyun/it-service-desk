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
        className="col-span-4 text-sm px-3 py-2 font-medium"
        style={{ 
          backgroundColor: "var(--bg-subtle)", 
          color: "var(--text-secondary)",
          borderRight: "1px solid var(--border-default)"
        }}
      >
        {label}
      </div>
      <div 
        className="col-span-8 text-sm px-3 py-2"
        style={{ color: "var(--text-primary)" }}
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
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentsEndRef = useRef<HTMLDivElement | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticketDetail", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}/detail`),
    enabled: Number.isFinite(ticketId),
  });

  useEffect(() => {
    if (data?.comments && commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [data?.comments]);

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

  const deleteM = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticketId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      router.replace("/tickets");
    },
  });

  const createCommentM = useMutation({
    mutationFn: async () => {
      const created = await api<{ id: number }>(`/tickets/${ticketId}/comments`, {
        method: "POST",
        body: {
          title: "댓글",
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
      qc.invalidateQueries({ queryKey: ["ticketDetail", ticketId] });
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    },
    onError: () => {
      setCommentError("댓글 등록에 실패했습니다.");
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
  const ticketAttachments = data.attachments.filter((a) => !a.comment_id);
  const canEdit = t.status === "open" && t.requester_emp_no === me.emp_no;

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
                  {t.title}
                </h1>
                <div className="flex items-center gap-2 mt-3">
                  <Badge variant={statusInfo.variant} size="md">
                    {statusInfo.label}
                  </Badge>
                  <Badge variant={priorityInfo.variant} size="md">
                    {priorityInfo.label}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
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
                    onClick={() => router.replace(`/tickets/${ticketId}/edit`)}
                  >
                    수정
                  </button>
                )}
                {canEdit && (
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
                )}
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

        <Card>
          <div 
            className="grid grid-cols-1 md:grid-cols-2 overflow-hidden"
            style={{ 
              borderRadius: "var(--radius-lg)"
            }}
          >
            <div 
              className="divide-y"
              style={{ 
                borderColor: "var(--border-default)",
                borderRightWidth: "1px"
              }}
            >
              <FieldRow label="요청자" value={formatUser(t.requester, t.requester_emp_no)} />
              <FieldRow
                label="담당자"
                value={formatAssignees(t.assignees, t.assignee_emp_nos ?? null)}
              />
              <FieldRow
                label="카테고리"
                value={formatCategoryList(
                  t.category_ids ?? (t.category_id ? [t.category_id] : []),
                  categoryMap,
                )}
              />
              <FieldRow label="작업 구분" value={workTypeLabel(t.work_type)} />
            </div>
            <div 
              className="divide-y"
              style={{ borderColor: "var(--border-default)" }}
            >
              <FieldRow label="프로젝트" value={t.project_name ?? "-"} />
              <FieldRow label="생성일" value={formatDate(t.created_at)} />
              <FieldRow label="최근 업데이트" value={formatDate(t.updated_at)} />
              <FieldRow label="" value="" />
            </div>
          </div>
        </Card>

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
                    className="border rounded-lg divide-y"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    {ticketAttachments.map((a) => (
                      <div 
                        key={a.id} 
                        className="flex items-center justify-between px-4 py-3 transition-colors"
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

        <Card>
          <CardHeader>
            <h2 
              className="text-base font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              댓글
            </h2>
          </CardHeader>
          <CardBody padding="lg">
            <div className="space-y-2 max-h-[600px] overflow-y-auto mb-4">
              {data.comments.length === 0 ? (
                <div 
                  className="text-sm text-center py-8"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  아직 댓글이 없습니다.
                </div>
              ) : (
                <>
                  {data.comments.map((c) => {
                    const isMyComment = me.emp_no === c.author_emp_no;
                    const commentAttachments = data.attachments.filter((a) => a.comment_id === c.id);
                    return (
                      <div 
                        key={c.id} 
                        className="w-full"
                      >
                        <div 
                          className="w-full rounded-2xl px-3 py-1.5 shadow-sm"
                          style={{
                            backgroundColor: isMyComment ? "var(--color-primary-50)" : "var(--bg-subtle)",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            borderColor: isMyComment ? "var(--color-primary-200)" : "var(--border-default)",
                          }}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span 
                              className="text-xs font-semibold"
                              style={{ color: isMyComment ? "var(--color-primary-700)" : "var(--text-secondary)" }}
                            >
                              {formatUser(c.author, c.author_emp_no)}
                            </span>
                            <span 
                              className="text-xs"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {formatDate(c.created_at)}
                            </span>
                          </div>
                          <div className="text-sm leading-tight">
                            <TiptapViewer value={c.body} />
                          </div>
                          {commentAttachments.length > 0 && (
                            <div 
                              className="mt-1.5 pt-1.5 space-y-1"
                              style={{ borderTop: "1px solid var(--border-default)" }}
                            >
                              {commentAttachments.map((a) => (
                                <button
                                  key={a.id}
                                  className="flex items-center gap-2 text-xs transition-colors rounded px-2 py-1"
                                  style={{ color: "var(--text-secondary)" }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                  onClick={() => downloadAttachmentM.mutate(a.id)}
                                >
                                  <span>📎 {a.filename}</span>
                                  <span style={{ color: "var(--text-tertiary)" }}>
                                    ({formatBytes(a.size)})
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={commentsEndRef} />
                </>
              )}
            </div>

            <div 
              className="border-t pt-4"
              style={{ borderColor: "var(--border-default)" }}
            >
              <div className="space-y-3">
                <RichTextEditor
                  value={commentBody}
                  onChange={(doc) => setCommentBody(doc)}
                  onError={setCommentError}
                  placeholder="댓글을 입력하세요..."
                  showToolbar={false}
                  minHeight="60px"
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
                    className="text-xs rounded-lg px-4 py-1.5 font-medium transition-all disabled:opacity-60"
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
                        setCommentError("댓글 내용을 입력하세요.");
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
            </div>
          </CardBody>
        </Card>

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
              {data.events.length === 0 ? (
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
                          className="text-center p-3 w-44 font-semibold"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          시각
                        </th>
                        <th 
                          className="text-center p-3 w-28 font-semibold"
                          style={{ color: "var(--text-secondary)" }}
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
                      {data.events.map((e, idx) => {
                        const rowNo = data.events.length - idx;
                        return (
                          <tr 
                            key={e.id} 
                            style={{ borderBottom: "1px solid var(--border-default)" }}
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
                              {e.type}
                            </td>
                            <td 
                              className="p-3 text-center"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {e.note ?? "-"}
                            </td>
                          </tr>
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
    </>
  );
}
