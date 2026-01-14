"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import ErrorDialog from "@/components/ErrorDialog";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority?: string;
  category?: string;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  requester?: UserSummary | null;
  requester_id: number;
  assignee?: UserSummary | null;
  assignee_id?: number | null;
  created_at: string;
  updated_at: string;
};

type Project = {
  id: number;
  name: string;
};

type UserSummary = {
  id: number;
  employee_no?: string | null;
  name?: string | null;
  title?: string | null;
  department?: string | null;
};

const STATUS_SORT: Record<string, number> = {
  open: 0,
  in_progress: 1,
  resolved: 2,
  closed: 3,
};

const PRIORITY_SORT: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

function toTime(v?: string | null) {
  if (!v) return 0;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function priorityRank(priority?: string) {
  return PRIORITY_SORT[(priority || "medium").toLowerCase()] ?? 9;
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

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (["open", "new", "pending"].includes(s)) {
    return { label: "대기", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (["in_progress", "processing", "assigned"].includes(s)) {
    return { label: "진행", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (s === "resolved") {
    return { label: "완료", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (s === "closed") {
    return { label: "사업검토", cls: "bg-slate-100 text-slate-700 border-slate-200" };
  }
  return { label: status, cls: "bg-gray-100 text-gray-700 border-gray-200" };
}

function StatusBadge({ status }: { status: string }) {
  const { label, cls } = statusMeta(status);
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

function formatUser(user?: UserSummary | null, fallbackId?: number | null, emptyLabel = "-") {
  if (!user) return fallbackId ? `#${fallbackId}` : emptyLabel;
  const parts = [user.name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.employee_no ?? (fallbackId ? `#${fallbackId}` : emptyLabel);
}

export default function ReviewTicketsPage() {
  const router = useRouter();
  const { map: categoryMap } = useTicketCategories();
  const status = "closed";
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", { status, page: "review" }],
    queryFn: () => api<Ticket[]>(`/tickets?status=${status}&limit=100&offset=0`),
    staleTime: 5_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "mine"],
    queryFn: () => api<Project[]>("/projects?mine=true"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!error) return;
    setErrorMessage((error as any)?.message ?? "사업 검토 요청을 불러오지 못했습니다.");
  }, [error]);

  useEffect(() => {
    setPage(1);
  }, [search, projectFilter, data?.length]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = (data ?? []).slice();
    if (projectFilter !== "all") {
      list = list.filter((t) => String(t.project_id ?? "") === projectFilter);
    }
    if (term) {
      list = list.filter((t) => t.title.toLowerCase().includes(term) || String(t.id).includes(term));
    }
    list.sort((a, b) => {
      const sa = STATUS_SORT[a.status] ?? 9;
      const sb = STATUS_SORT[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      return toTime(b.updated_at) - toTime(a.updated_at);
    });
    return list;
  }, [data, search, projectFilter]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const categoryLabel = (c?: string | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? c;
  };

  return (
    <div className="p-5 space-y-5">
      <PageHeader
        title="사업 검토"
        meta={
          <span>
            총 <span className="text-emerald-700 font-semibold">{filtered.length}</span>건
          </span>
        }
      />

      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      {isLoading && <div className="text-sm text-slate-500">목록을 불러오는 중...</div>}

      <div className="flex items-center justify-end flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">전체 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
            placeholder="제목/ID 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm text-center">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3">제목</th>
              <th className="text-center p-3 w-28">상태</th>
              <th className="text-center p-3 w-28">우선순위</th>
              <th className="text-center p-3 w-40 whitespace-nowrap">담당자</th>
              <th className="text-center p-3 w-28">작업 구분</th>
              <th className="text-center p-3 w-32">카테고리</th>
              <th className="text-center p-3 w-44 whitespace-nowrap">업데이트</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((t) => (
              <tr key={t.id} className="border-t cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/tickets/${t.id}`)}>
                <td className="p-3 text-left">
                  <div className="font-medium text-slate-900">{t.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{formatUser(t.requester, t.requester_id)}</div>
                </td>
                <td className="p-3 text-center">
                  <StatusBadge status={t.status} />
                </td>
                <td className="p-3 text-center">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="p-3 text-center whitespace-nowrap">{formatUser(t.assignee, t.assignee_id, "미배정")}</td>
                <td className="p-3 text-center">{workTypeLabel(t.work_type)}</td>
                <td className="p-3 text-center">{categoryLabel(t.category)}</td>
                <td className="p-3 text-center text-slate-600 whitespace-nowrap">{formatDate(t.updated_at)}</td>
              </tr>
            ))}
            {!pageItems.length && !isLoading && (
              <tr className="border-t">
                <td className="p-4 text-slate-500 text-center" colSpan={7}>
                  사업 검토 요청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />
    </div>
  );
}
