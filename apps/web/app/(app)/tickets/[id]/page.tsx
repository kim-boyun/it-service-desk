"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Comment = {
  id: number;
  content: string;
  is_internal: boolean;
  author_id: number;
  created_at: string;
};

type Event = {
  id: number;
  type: string; // 예: "status_changed", "assigned", ...
  message?: string | null;
  actor_id: number;
  created_at: string;
};

type Attachment = {
  id: number;
  filename: string;
  key: string;
  size?: number | null;
  uploaded_by: number;
  created_at: string;
};

type Ticket = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  requester_id: number;
  assignee_id?: number | null;
  created_at: string;
  updated_at: string;
};

type TicketDetail = {
  ticket: Ticket;
  comments: Comment[];
  events: Event[];
  attachments: Attachment[];
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ticketId = useMemo(() => Number(id), [id]);
  const router = useRouter();
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["ticket-detail", ticketId],
    queryFn: () => api<TicketDetail>(`/tickets/${ticketId}/detail`),
    enabled: Number.isFinite(ticketId),
  });

  // 댓글 작성(외부/내부 공용)
  const createCommentM = useMutation({
    mutationFn: (payload: { content: string; is_internal: boolean }) =>
      api<Comment>(`/tickets/${ticketId}/comments`, { method: "POST", body: payload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
    },
  });

  // 상태 변경 (에이전트/관리자만 성공할 것)
  const updateStatusM = useMutation({
    mutationFn: (payload: { status: string }) =>
      api<any>(`/tickets/${ticketId}/status`, { method: "PATCH", body: payload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
    },
  });

  if (detailQ.isLoading) return <div className="p-6">불러오는 중...</div>;
  if (detailQ.error)
    return (
      <div className="p-6 text-red-600 space-y-2">
        <div>에러: {(detailQ.error as any).message}</div>
        <button className="border rounded px-3 py-2" onClick={() => router.back()}>
          뒤로
        </button>
      </div>
    );

  const data = detailQ.data!;
  const { ticket, comments, events, attachments } = data;

  const externalComments = comments.filter((c) => !c.is_internal);
  const internalComments = comments.filter((c) => c.is_internal);

  return (
    <div className="p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm text-gray-500">Ticket #{ticket.id}</div>
          <h1 className="text-2xl font-semibold">{ticket.title}</h1>
          <div className="text-sm text-gray-500">
            상태: <span className="font-medium text-gray-800">{ticket.status}</span> · 업데이트:{" "}
            {ticket.updated_at}
          </div>
        </div>

        <button className="border rounded px-3 py-2" onClick={() => router.back()}>
          목록으로
        </button>
      </div>

      {/* 본문 + 사이드패널 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 좌측 메인 */}
        <div className="lg:col-span-2 space-y-4">
          <section className="border rounded-lg p-4 space-y-2">
            <div className="font-semibold">요청 내용</div>
            <div className="text-sm whitespace-pre-wrap text-gray-800">
              {ticket.description ?? "(내용 없음)"}
            </div>
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <div className="font-semibold">외부 댓글</div>
            <CommentList items={externalComments} emptyText="아직 외부 댓글이 없습니다." />
            <CommentComposer
              placeholder="사용자에게 보이는 답변/추가 질문을 입력하세요..."
              onSubmit={(content) => createCommentM.mutate({ content, is_internal: false })}
              loading={createCommentM.isPending}
            />
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <div className="font-semibold">이벤트 로그</div>
            <EventList items={events} emptyText="이벤트가 없습니다." />
          </section>
        </div>

        {/* 우측 패널 */}
        <div className="space-y-4">
          <section className="border rounded-lg p-4 space-y-3">
            <div className="font-semibold">처리</div>
            <div className="text-sm text-gray-600">
              아래 액션은 권한(에이전트/관리자)에 따라 실패할 수 있어.
            </div>

            <div className="space-y-2">
              <label className="text-sm">상태 변경</label>
              <div className="flex gap-2">
                <select
                  className="border rounded p-2 flex-1"
                  defaultValue={ticket.status}
                  onChange={(e) => updateStatusM.mutate({ status: e.target.value })}
                >
                  {/* 네 백엔드 상태 enum에 맞춰 나중에 조정 */}
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="resolved">resolved</option>
                  <option value="closed">closed</option>
                </select>
              </div>
              {updateStatusM.isError && (
                <div className="text-xs text-red-600">
                  상태 변경 실패: {(updateStatusM.error as any).message}
                </div>
              )}
            </div>
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <div className="font-semibold">첨부파일</div>
            <AttachmentList items={attachments} emptyText="첨부파일이 없습니다." />
            {/* 업로드는 presigned PUT 흐름이 있어서 다음 단계에서 붙임 */}
            <div className="text-xs text-gray-500">
              업로드 UI는 다음 단계에서 presigned PUT/등록 API로 연결할게.
            </div>
          </section>

          <section className="border rounded-lg p-4 space-y-3">
            <div className="font-semibold">내부 메모</div>
            <CommentList items={internalComments} emptyText="아직 내부 메모가 없습니다." />
            <CommentComposer
              placeholder="전산팀 내부 공유 메모(사용자 비공개)..."
              onSubmit={(content) => createCommentM.mutate({ content, is_internal: true })}
              loading={createCommentM.isPending}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function CommentList({ items, emptyText }: { items: Comment[]; emptyText: string }) {
  if (!items.length) return <div className="text-sm text-gray-500">{emptyText}</div>;
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <div key={c.id} className="border rounded p-3">
          <div className="text-xs text-gray-500 flex justify-between">
            <span>작성자 #{c.author_id}</span>
            <span>{c.created_at}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap mt-1">{c.content}</div>
        </div>
      ))}
    </div>
  );
}

function CommentComposer({
  placeholder,
  onSubmit,
  loading,
}: {
  placeholder: string;
  onSubmit: (content: string) => void;
  loading: boolean;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const content = String(fd.get("content") ?? "").trim();
        if (!content) return;
        onSubmit(content);
        (e.currentTarget as HTMLFormElement).reset();
      }}
    >
      <input
        name="content"
        className="border rounded p-2 flex-1"
        placeholder={placeholder}
        disabled={loading}
      />
      <button className="border rounded px-3 py-2 disabled:opacity-60" disabled={loading} type="submit">
        {loading ? "등록중" : "등록"}
      </button>
    </form>
  );
}

function EventList({ items, emptyText }: { items: Event[]; emptyText: string }) {
  if (!items.length) return <div className="text-sm text-gray-500">{emptyText}</div>;
  return (
    <div className="space-y-2">
      {items.map((ev) => (
        <div key={ev.id} className="border rounded p-3">
          <div className="text-xs text-gray-500 flex justify-between">
            <span>{ev.type}</span>
            <span>{ev.created_at}</span>
          </div>
          <div className="text-sm mt-1">
            {ev.message ?? `actor #${ev.actor_id}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttachmentList({ items, emptyText }: { items: Attachment[]; emptyText: string }) {
  if (!items.length) return <div className="text-sm text-gray-500">{emptyText}</div>;
  return (
    <div className="space-y-2">
      {items.map((a) => (
        <div key={a.id} className="border rounded p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{a.filename}</div>
            <div className="text-xs text-gray-500">업로더 #{a.uploaded_by} · {a.created_at}</div>
          </div>
          <button className="border rounded px-3 py-2 text-sm" disabled title="다음 단계에서 presigned GET 연결">
            다운로드
          </button>
        </div>
      ))}
    </div>
  );
}
