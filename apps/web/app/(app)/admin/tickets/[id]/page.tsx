"use client";

import { Fragment, useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import { TiptapDoc } from "@/lib/tiptap";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes";

const TiptapViewer = dynamic(() => import("@/components/TiptapViewer"), { ssr: false });

type Attachment = {
  id: number;
  key: string;
  filename: string;
  content_type: string;
  size: number;
  ticket_id: number | null;
  comment_id: number | null;
  is_internal: boolean;
  uploaded_by: number;
  created_at?: string | null;
};

type Comment = {
  id: number;
  ticket_id: number;
  author_id: number;
  author?: UserSummary | null;
  body: string;
  is_internal: boolean;
  created_at?: string;
};

type Event = {
  id: number;
  ticket_id: number;
  actor_id: number;
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
  category: string;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  requester?: UserSummary | null;
  requester_id: number;
  assignee?: UserSummary | null;
  assignee_id: number | null;
  created_at: string;
  updated_at?: string | null;
};

type UserSummary = {
  id: number;
  employee_no?: string | null;
  name?: string | null;
  title?: string | null;
  department?: string | null;
};

type TicketDetail = {
  ticket: Ticket;
  comments: Comment[];
  events: Event[];
  attachments: Attachment[];
};

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (["open", "new", "pending"].includes(s)) return { label: "대기", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  if (["in_progress", "processing", "assigned"].includes(s))
    return { label: "진행", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "resolved") return { label: "완료", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "closed") return { label: "사업검토", cls: "bg-slate-100 text-slate-700 border-slate-200" };
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

function categoryLabel(c: string | null | undefined, map: Record<string, string>) {
  if (!c) return "-";
  return map[c] ?? c;
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

function formatUser(user?: UserSummary | null, fallbackId?: number | null, emptyLabel = "-") {
  if (!user) return fallbackId ? `#${fallbackId}` : emptyLabel;
  const parts = [user.name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.employee_no ?? (fallbackId ? `#${fallbackId}` : emptyLabel);
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
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
    status_changed: "상태 변경",
    assignee_assigned: "담당자 배정",
    assignee_changed: "담당자 변경",
    assigned: "담당자 배정",
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
  const { map: categoryMap } = useTicketCategories();
  const ticketId = Number(params.id);
  const isStaff = me.role === "admin";

  const [status, setStatus] = useState("open");
  const [note, setNote] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);
  const [openEventId, setOpenEventId] = useState<number | null>(null);
  const hasUnsavedComment = commentBody.trim().length > 0;

  useUnsavedChangesWarning(hasUnsavedComment);

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

  useEffect(() => {
    if (data?.ticket.status) {
      setStatus(data.ticket.status);
    }
  }, [data?.ticket.status]);

  const downloadAttachmentM = useMutation({
    mutationFn: async (attachmentId: number) => {
      const { url } = await api<{ url: string }>(`/attachments/${attachmentId}/download-url`);
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
      const token = getToken();

      const res = await fetch(`${apiBase}${url}`, {
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

  const addCommentM = useMutation({
    mutationFn: () =>
      api(`/tickets/${ticketId}/comments`, {
        method: "POST",
        body: { body: commentBody, is_internal: isStaff ? commentInternal : false },
      }),
    onSuccess: () => {
      setCommentBody("");
      setCommentInternal(false);
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail", ticketId] });
    },
  });

  const customerAttachments = useMemo(() => (data?.attachments ?? []).filter((a) => !a.is_internal), [data]);
  const internalAttachments = useMemo(() => (data?.attachments ?? []).filter((a) => a.is_internal), [data]);

  const customerComments = useMemo(() => (data?.comments ?? []).filter((c) => !c.is_internal), [data]);
  const internalComments = useMemo(() => (data?.comments ?? []).filter((c) => c.is_internal), [data]);

  if (isLoading) return <div className="p-6">요청을 불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-600">오류: {(error as any).message}</div>;
  if (!data) return <div className="p-6 text-sm text-gray-500">요청이 없습니다.</div>;

  const t = data.ticket;
  const statusInfo = statusMeta(t.status);
  const priorityInfo = priorityMeta(t.priority);
  const headerMeta = [
    formatUser(t.requester, t.requester_id),
    t.assignee ? formatUser(t.assignee, t.assignee_id) : null,
    `생성 ${formatDate(t.created_at)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge label={statusInfo.label} cls={statusInfo.cls} />
            <Badge label={priorityInfo.label} cls={priorityInfo.cls} />
            <span className="text-xs text-gray-500">카테고리 {categoryLabel(t.category, categoryMap)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{headerMeta}</div>
        </div>
        <button
          className="border rounded px-3 py-2 text-sm"
          onClick={() => {
            if (hasUnsavedComment && !confirm(UNSAVED_MESSAGE)) return;
            router.back();
          }}
        >
          돌아가기
        </button>
      </div>

      <div className="border rounded bg-white">
        <div className="px-4 py-3 border-b text-sm font-semibold">메타 정보</div>
        <div className="divide-y">
          <FieldRow label="요청자" value={formatUser(t.requester, t.requester_id)} />
          <FieldRow label="담당자" value={formatUser(t.assignee, t.assignee_id, "미배정")} />
          <FieldRow label="카테고리" value={categoryLabel(t.category, categoryMap)} />
          <FieldRow label="작업 구분" value={workTypeLabel(t.work_type)} />
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
            {customerAttachments.length === 0 ? (
              <div className="text-sm text-gray-500">첨부파일이 없습니다.</div>
            ) : (
              <div className="border rounded divide-y">
                {customerAttachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2">
                    <div className="text-sm">{a.filename}</div>
                    <button
                      className="text-sm border rounded px-2 py-1"
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
        <div className="px-4 py-3 border-b text-sm font-semibold">댓글</div>
        <div className="p-4 space-y-4">
          {customerComments.length === 0 ? (
            <div className="text-sm text-gray-500">댓글이 없습니다.</div>
          ) : (
            <div className="border rounded divide-y">
              {customerComments.map((c) => (
                <div key={c.id} className="px-3 py-2 text-sm whitespace-pre-wrap">
                  <div className="text-xs text-gray-500 mb-1">
                    {formatUser(c.author, c.author_id)} · {formatDate(c.created_at)}
                  </div>
                  {c.body}
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 space-y-2">
            <div className="flex items-start gap-2">
              <textarea
                className="flex-1 border rounded px-3 py-2 text-sm min-h-[96px]"
                placeholder="댓글을 작성하세요."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
              <button
                className="h-[96px] w-28 border rounded text-sm bg-white text-black hover:bg-gray-100 disabled:opacity-60"
                onClick={() => addCommentM.mutate()}
                disabled={addCommentM.isPending || commentBody.trim().length === 0}
              >
                {addCommentM.isPending ? "등록 중..." : "등록"}
              </button>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={commentInternal} onChange={(e) => setCommentInternal(e.target.checked)} />
              내부 메모로 저장 (고객 미표시)
            </label>
            {addCommentM.isError && (
              <div className="text-xs text-red-600">
                {(addCommentM.error as any)?.message ?? "등록에 실패했습니다."}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border rounded bg-white">
        <div className="px-4 py-3 border-b text-sm font-semibold">내부 메모/첨부</div>
        <div className="p-4 space-y-4">
          <section className="space-y-2">
            <div className="text-sm font-semibold">내부 메모</div>
            {internalComments.length === 0 ? (
              <div className="text-sm text-gray-500">내부 메모가 없습니다.</div>
            ) : (
              <div className="border rounded divide-y">
                {internalComments.map((c) => (
                  <div key={c.id} className="px-3 py-2 text-sm whitespace-pre-wrap">
                      <div className="text-xs text-gray-500 mb-1">
                        {formatUser(c.author, c.author_id)} · {formatDate(c.created_at)}
                      </div>
                    {c.body}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-sm font-semibold">내부 첨부</div>
            {internalAttachments.length === 0 ? (
              <div className="text-sm text-gray-500">내부 첨부파일이 없습니다.</div>
            ) : (
              <div className="border rounded divide-y">
                {internalAttachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between px-3 py-2">
                    <div className="text-sm">{a.filename}</div>
                    <button
                      className="text-sm border rounded px-2 py-1"
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
        <div className="px-4 py-3 border-b text-sm font-semibold">상태 변경</div>
        <div className="p-4 space-y-3">
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">대기</option>
            <option value="in_progress">진행</option>
            <option value="resolved">완료</option>
            <option value="closed">사업검토</option>
          </select>
          <textarea
            className="w-full border rounded px-3 py-2 text-sm min-h-[80px]"
            placeholder="변경 사유/메모 (선택)"
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
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">제목</div>
                                  <div className="col-span-9 px-2 py-2">{before.title ?? "-"}</div>
                                </div>
                                <div className="grid grid-cols-12 border-b">
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">우선순위</div>
                                  <div className="col-span-9 px-2 py-2">{priorityMeta(before.priority ?? "medium").label}</div>
                                </div>
                                <div className="grid grid-cols-12 border-b">
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">카테고리</div>
                                  <div className="col-span-9 px-2 py-2">{categoryLabel(before.category ?? "-", categoryMap)}</div>
                                </div>
                                <div className="grid grid-cols-12 border-b">
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">작업 구분</div>
                                  <div className="col-span-9 px-2 py-2">{workTypeLabel(before.work_type)}</div>
                                </div>
                                <div className="grid grid-cols-12 border-b">
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">프로젝트</div>
                                  <div className="col-span-9 px-2 py-2">{before.project_name ?? "-"}</div>
                                </div>
                                <div className="grid grid-cols-12 border-b">
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">생성일</div>
                                  <div className="col-span-9 px-2 py-2">{formatDate(before.created_at)}</div>
                                </div>
                                <div className="grid grid-cols-12">
                                  <div className="col-span-3 px-2 py-2 text-gray-600 bg-gray-50 border-r">업데이트</div>
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
  );
}
const UNSAVED_MESSAGE = "이 페이지를 떠나시겠습니까?\n변경사항이 저장되지 않을 수 있습니다.";
