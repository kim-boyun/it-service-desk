"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "@/lib/auth-context";

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
  description: string;
  status: string;
  priority: string;
  category: string;
  requester_id: number;
  assignee_id: number | null;
  created_at: string;
};

type TicketDetail = {
  ticket: Ticket;
  comments: Comment[];
  events: Event[];
  attachments: Attachment[];
};

const STATUS_OPTIONS = [
  { value: "open", label: "대기" },
  { value: "in_progress", label: "진행" },
  { value: "resolved", label: "해결" },
  { value: "closed", label: "종결" },
];

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

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const waiting = ["open", "new", "pending"].includes(s);
  const doing = ["in_progress", "processing", "assigned"].includes(s);
  const cls = waiting
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : doing
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const label = waiting ? "대기" : doing ? "진행" : "완료";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    low: { label: "낮음", cls: "bg-gray-100 text-gray-700 border-gray-200" },
    medium: { label: "보통", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    high: { label: "높음", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    urgent: { label: "긴급", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const v = map[priority] ?? map.medium;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const ticketId = Number(params.id);
  const isStaff = me.role === "agent" || me.role === "admin";

  const [tab, setTab] = useState<"customer" | "agent">("customer");
  const [status, setStatus] = useState("open");
  const [note, setNote] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticketDetail", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}/detail`),
    onSuccess: (res) => setStatus(res.ticket.status),
  });

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
      qc.invalidateQueries({ queryKey: ["ticketDetail", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
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
      qc.invalidateQueries({ queryKey: ["ticketDetail", ticketId] });
    },
  });

  const customerAttachments = useMemo(() => (data?.attachments ?? []).filter((a) => !a.is_internal), [data]);
  const internalAttachments = useMemo(() => (data?.attachments ?? []).filter((a) => a.is_internal), [data]);

  const customerComments = useMemo(() => (data?.comments ?? []).filter((c) => !c.is_internal), [data]);
  const internalComments = useMemo(() => (data?.comments ?? []).filter((c) => c.is_internal), [data]);

  if (isLoading) return <div className="p-6">티켓을 불러오는 중...</div>;
  if (error) return <div className="p-6 text-red-600">오류: {(error as any).message}</div>;
  if (!data) return <div className="p-6 text-sm text-gray-500">데이터가 없습니다.</div>;

  const t = data.ticket;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-gray-500">Ticket #{t.id}</div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <span className="text-xs text-gray-500">카테고리 {t.category}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            요청자 #{t.requester_id} · 담당자 {t.assignee_id ?? "미배정"} · 생성 {formatDate(t.created_at)}
          </div>
        </div>
        <button className="border rounded px-3 py-2 text-sm" onClick={() => router.push("/tickets")}>
          목록으로
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border rounded bg-white lg:col-span-2">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <span className="text-sm font-semibold">요청 상세</span>
          </div>
          <div className="p-4 space-y-4">
            <section className="space-y-2">
              <div className="text-sm font-semibold">요청 내용</div>
              <div className="border rounded p-3 text-sm whitespace-pre-wrap">{t.description}</div>
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

            <section className="space-y-2">
              <div className="text-sm font-semibold">댓글</div>
              {customerComments.length === 0 ? (
                <div className="text-sm text-gray-500">댓글이 없습니다.</div>
              ) : (
                <div className="border rounded divide-y">
                  {customerComments.map((c) => (
                    <div key={c.id} className="px-3 py-2 text-sm whitespace-pre-wrap">
                      <div className="text-xs text-gray-500 mb-1">작성자 #{c.author_id} · {formatDate(c.created_at)}</div>
                      {c.body}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border rounded bg-white">
            <div className="px-4 py-3 border-b text-sm font-semibold">메타 정보</div>
            <div className="divide-y">
              <FieldRow label="요청자" value={`#${t.requester_id}`} />
              <FieldRow label="담당자" value={t.assignee_id ?? "미배정"} />
              <FieldRow label="카테고리" value={t.category} />
              <FieldRow label="작성일" value={formatDate(t.created_at)} />
            </div>
          </div>

          {isStaff && (
            <div className="border rounded bg-white">
              <div className="px-4 py-3 border-b text-sm font-semibold">상태 변경</div>
              <div className="p-4 space-y-3">
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
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
                  className="w-full border rounded px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  onClick={() => updateStatusM.mutate()}
                  disabled={updateStatusM.isPending}
                >
                  {updateStatusM.isPending ? "변경 중..." : "상태 업데이트"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded bg-white">
          <div className="px-4 py-3 border-b text-sm font-semibold">댓글/메모 추가</div>
          <div className="p-4 space-y-3">
            <textarea
              className="w-full border rounded px-3 py-2 text-sm min-h-[100px]"
              placeholder="처리 내용이나 메모를 입력하세요."
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
            />
            {isStaff && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={commentInternal}
                  onChange={(e) => setCommentInternal(e.target.checked)}
                />
                내부 메모로 남기기 (고객 미표시)
              </label>
            )}
            {addCommentM.isError && (
              <div className="text-xs text-red-600">
                {(addCommentM.error as any)?.message ?? "등록에 실패했습니다."}
              </div>
            )}
            <button
              className="w-full border rounded px-3 py-2 text-sm bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={() => addCommentM.mutate()}
              disabled={addCommentM.isPending || commentBody.trim().length === 0}
            >
              {addCommentM.isPending ? "등록 중..." : "등록"}
            </button>
          </div>
        </div>

        <div className="border rounded bg-white">
          <div className="px-4 py-3 border-b text-sm font-semibold">내부 첨부/메모</div>
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
                        작성자 #{c.author_id} · {formatDate(c.created_at)}
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
      </div>

      <div className="border rounded bg-white">
        <div className="px-4 py-2 border-b text-sm font-semibold">처리 이력</div>
        {data.events.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">이력이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="text-left p-2 w-16">No</th>
                <th className="text-left p-2 w-44">시각</th>
                <th className="text-left p-2 w-28">유형</th>
                <th className="text-left p-2">내용</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e, idx) => (
                <tr key={e.id} className="border-b">
                  <td className="p-2">{idx + 1}</td>
                  <td className="p-2 text-gray-600">{formatDate(e.created_at)}</td>
                  <td className="p-2">{e.type}</td>
                  <td className="p-2 text-gray-700">{e.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
