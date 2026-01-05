"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority?: string;
  category?: string;
  requester_id: number;
  assignee_id?: number | null;
  created_at: string;
  updated_at: string;
};

type TicketListOut =
  | { items: Ticket[]; total: number; limit: number; offset: number }
  | { data: Ticket[]; total: number; limit: number; offset: number };

type TicketListResponse =
  | { items: Ticket[]; total?: number }
  | { data: Ticket[]; total?: number }
  | Ticket[];

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "대기" },
  { value: "in_progress", label: "진행" },
  { value: "resolved", label: "완료(해결)" },
  { value: "closed", label: "종결" },
];

function normalize(res: TicketListResponse): { items: Ticket[]; total?: number } {
  if (Array.isArray(res)) return { items: res };
  if ("items" in res) return { items: res.items, total: res.total };
  if ("data" in res) return { items: res.data, total: res.total };
  return { items: [] };
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

function PriorityBadge({ priority }: { priority?: string }) {
  const p = (priority || "medium").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    low: { label: "낮음", cls: "bg-gray-100 text-gray-700 border-gray-200" },
    medium: { label: "보통", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    high: { label: "높음", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    urgent: { label: "긴급", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const v = map[p] ?? map.medium;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${v.cls}`}>
      {v.label}
    </span>
  );
}

export default function TicketsPage() {
  const router = useRouter();

  const limit = 50;
  const offset = 0;

  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", { limit, offset, status }],
    queryFn: () =>
      api<TicketListResponse>(
        `/tickets?limit=${limit}&offset=${offset}${status !== "all" ? `&status=${status}` : ""}`
      ),
    staleTime: 5_000,
    refetchOnMount: "always",
  });

  const norm = normalize(data ?? []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return norm.items;
    return norm.items.filter((t) => t.title.toLowerCase().includes(term) || String(t.id).includes(term));
  }, [norm.items, search]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 bg-gradient-to-r from-sky-500/10 via-emerald-500/10 to-purple-500/10 border border-sky-100 rounded-xl px-4 py-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">티켓</h1>
          <p className="text-sm text-gray-600">
            총 <span className="text-emerald-700 font-semibold">{norm.total ?? norm.items.length}</span>건
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="border rounded px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="제목/ID 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <div className="text-sm text-gray-500">목록을 불러오는 중...</div>}
      {error && (
        <div className="text-sm text-red-600">
          오류: {(error as any).message ?? "불러오기에 실패했습니다."}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 w-20">ID</th>
              <th className="text-left p-3">제목</th>
              <th className="text-left p-3 w-28">상태</th>
              <th className="text-left p-3 w-28">우선순위</th>
              <th className="text-left p-3 w-32">카테고리</th>
              <th className="text-left p-3 w-40">업데이트</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={t.id}
                className="border-t cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/tickets/${t.id}`)}
              >
                <td className="p-3">#{t.id}</td>
                <td className="p-3">
                  <div className="font-medium text-gray-900">{t.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    요청자 #{t.requester_id} · 담당자 {t.assignee_id ?? "미배정"}
                  </div>
                </td>
                <td className="p-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="p-3">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="p-3">{t.category ?? "-"}</td>
                <td className="p-3 text-gray-600">{formatDate(t.updated_at)}</td>
              </tr>
            ))}
            {!filtered.length && !isLoading && (
              <tr className="border-t">
                <td className="p-4 text-gray-500 text-center" colSpan={6}>
                  조건에 맞는 티켓이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
