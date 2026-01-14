"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
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

type TicketListResponse =
  | { items: Ticket[]; total?: number }
  | { data: Ticket[]; total?: number }
  | Ticket[];

type Project = {
  id: number;
  name: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "대기" },
  { value: "in_progress", label: "진행" },
];

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

const READ_KEY = "it_service_desk_ticket_reads";

type UserSummary = {
  id: number;
  employee_no?: string | null;
  name?: string | null;
  title?: string | null;
  department?: string | null;
};

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

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (["open", "new", "pending"].includes(s)) {
    return { label: "대기", cls: "bg-info-50 text-info-700 border-info-200" };
  }
  if (["in_progress", "processing", "assigned"].includes(s)) {
    return { label: "진행", cls: "bg-warning-50 text-warning-700 border-warning-200" };
  }
  if (s === "resolved") {
    return { label: "완료", cls: "bg-success-50 text-success-700 border-success-200" };
  }
  if (s === "closed") {
    return { label: "사업검토", cls: "bg-neutral-100 text-neutral-700 border-neutral-200" };
  }
  return { label: status, cls: "bg-neutral-100 text-neutral-700 border-neutral-200" };
}

function StatusBadge({ status }: { status: string }) {
  const { label, cls } = statusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  const p = (priority || "medium").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    low: { label: "낮음", cls: "bg-neutral-100 text-neutral-700 border-neutral-200" },
    medium: { label: "보통", cls: "bg-info-50 text-info-700 border-info-200" },
    high: { label: "높음", cls: "bg-warning-50 text-warning-700 border-warning-200" },
    urgent: { label: "긴급", cls: "bg-danger-50 text-danger-700 border-danger-200" },
  };
  const v = map[p] ?? map.medium;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${v.cls}`}>
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

function getUpdatedAt(ticket: Ticket) {
  return ticket.updated_at || ticket.created_at;
}

function toTime(value?: string | null) {
  if (!value) return 0;
  const d = new Date(value);
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

export default function TicketsPage() {
  const router = useRouter();
  const { map: categoryMap } = useTicketCategories();

  const limit = 100;
  const offset = 0;

  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [readMap, setReadMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") setReadMap(parsed);
    } catch {
      setReadMap({});
    }
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", { limit, offset }],
    queryFn: () => api<TicketListResponse>(`/tickets?limit=${limit}&offset=${offset}`),
    staleTime: 5_000,
    refetchOnMount: "always",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "mine"],
    queryFn: () => api<Project[]>("/projects?mine=true"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!error) return;
    setErrorMessage((error as any)?.message ?? "요청 목록을 불러오지 못했습니다.");
  }, [error]);

  function markRead(ticket: Ticket) {
    const updated = getUpdatedAt(ticket);
    setReadMap((prev) => {
      const next = { ...prev, [String(ticket.id)]: updated };
      if (typeof window !== "undefined") {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  const norm = normalize(data ?? []);
  const base = norm.items.filter((t) => {
    const s = (t.status || "").toLowerCase();
    return s !== "resolved" && s !== "closed";
  });

  const unreadTickets = useMemo(() => {
    const list = base.filter((t) => {
      const lastRead = readMap[String(t.id)];
      const updated = getUpdatedAt(t);
      if (!lastRead) return true;
      return toTime(updated) > toTime(lastRead);
    });
    return list.sort((a, b) => {
      const sa = STATUS_SORT[a.status] ?? 9;
      const sb = STATUS_SORT[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      return toTime(getUpdatedAt(b)) - toTime(getUpdatedAt(a));
    });
  }, [base, readMap]);

  const readTickets = useMemo(() => {
    const unreadIds = new Set(unreadTickets.map((t) => t.id));
    return base.filter((t) => !unreadIds.has(t.id));
  }, [base, unreadTickets]);

  const filteredAll = useMemo(() => {
    let list = readTickets.slice();
    if (status !== "all") {
      list = list.filter((t) => t.status === status);
    }
    if (projectFilter !== "all") {
      list = list.filter((t) => String(t.project_id ?? "") === projectFilter);
    }
    const term = search.trim().toLowerCase();
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
      return toTime(getUpdatedAt(b)) - toTime(getUpdatedAt(a));
    });
    return list;
  }, [readTickets, status, projectFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [filteredAll.length, status, projectFilter, search]);

  const pageItems = useMemo(
    () => filteredAll.slice((page - 1) * pageSize, page * pageSize),
    [filteredAll, page, pageSize]
  );

  const categoryLabel = (c?: string | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? c;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="처리 현황"
        meta={
          <span className="text-neutral-600">
            총 <span className="text-primary-600 font-semibold">{base.length}</span>건
          </span>
        }
        actions={
          <Link
            href="/tickets/new"
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            작성
          </Link>
        }
      />

      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-neutral-500">목록을 불러오는 중...</div>
        </div>
      )}

      {!isLoading && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">읽지 않은 요청</h2>
            <span className="inline-flex items-center rounded-full bg-danger-100 text-danger-700 px-2.5 py-1 text-xs font-semibold">
              {unreadTickets.length}건
            </span>
          </div>
          <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">제목</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">상태</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">우선순위</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-40 whitespace-nowrap">담당자</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">작업 구분</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-32">카테고리</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-44 whitespace-nowrap">업데이트</th>
                </tr>
              </thead>
              <tbody>
                {unreadTickets.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-neutral-100 last:border-b-0 cursor-pointer hover:bg-neutral-50 transition-colors"
                    onClick={() => {
                      markRead(t);
                      router.push(`/tickets/${t.id}`);
                    }}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-neutral-900">{t.title}</div>
                      <div className="text-xs text-neutral-500 mt-1">{formatUser(t.requester, t.requester_id)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3.5 text-center text-neutral-700 whitespace-nowrap">{formatUser(t.assignee, t.assignee_id, "미배정")}</td>
                    <td className="px-4 py-3.5 text-center text-neutral-700">{workTypeLabel(t.work_type)}</td>
                    <td className="px-4 py-3.5 text-center text-neutral-700">{categoryLabel(t.category)}</td>
                    <td className="px-4 py-3.5 text-center text-neutral-600 whitespace-nowrap">{formatDate(t.updated_at)}</td>
                  </tr>
                ))}
                {!unreadTickets.length && (
                  <tr>
                    <td className="px-4 py-8 text-neutral-500 text-center" colSpan={7}>
                      읽지 않은 요청이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!isLoading && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-neutral-900">모든 요청</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden md:flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-1.5 py-1.5 shadow-sm">
                {STATUS_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      status === o.value ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                    onClick={() => setStatus(o.value)}
                    type="button"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <select
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent md:hidden bg-white"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
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
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white placeholder:text-neutral-400"
                placeholder="제목/ID 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-neutral-700">제목</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">상태</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">우선순위</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-40 whitespace-nowrap">담당자</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-28">작업 구분</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-32">카테고리</th>
                  <th className="text-center px-4 py-3 font-semibold text-neutral-700 w-44 whitespace-nowrap">업데이트</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-neutral-100 last:border-b-0 cursor-pointer hover:bg-neutral-50 transition-colors"
                    onClick={() => {
                      markRead(t);
                      router.push(`/tickets/${t.id}`);
                    }}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-neutral-900">{t.title}</div>
                      <div className="text-xs text-neutral-500 mt-1">{formatUser(t.requester, t.requester_id)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3.5 text-center text-neutral-700 whitespace-nowrap">{formatUser(t.assignee, t.assignee_id, "미배정")}</td>
                    <td className="px-4 py-3.5 text-center text-neutral-700">{workTypeLabel(t.work_type)}</td>
                    <td className="px-4 py-3.5 text-center text-neutral-700">{categoryLabel(t.category)}</td>
                    <td className="px-4 py-3.5 text-center text-neutral-600 whitespace-nowrap">{formatDate(t.updated_at)}</td>
                  </tr>
                ))}
                {!pageItems.length && (
                  <tr>
                    <td className="px-4 py-8 text-neutral-500 text-center" colSpan={7}>
                      조건에 맞는 요청이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={filteredAll.length} pageSize={pageSize} onChange={setPage} />
        </section>
      )}

      <p className="text-xs text-neutral-500">읽음 상태는 현재 기기 기준으로만 저장됩니다.</p>
    </div>
  );
}
