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
import { Badge, Card, CardHeader, CardBody } from "@/components/ui";
import { Plus, Search, Filter } from "lucide-react";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority?: string;
  category_id?: number | null;
  work_type?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  requester?: UserSummary | null;
  requester_emp_no: string;
  assignee?: UserSummary | null;
  assignee_emp_no?: string | null;
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
  emp_no: string;
  kor_name?: string | null;
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

function statusMeta(status: string): { label: string; variant: any } {
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

function priorityMeta(priority?: string): { label: string; variant: any } {
  const p = (priority || "medium").toLowerCase();
  const map: Record<string, { label: string; variant: any }> = {
    low: { label: "낮음", variant: "neutral" },
    medium: { label: "보통", variant: "info" },
    high: { label: "높음", variant: "warning" },
    urgent: { label: "긴급", variant: "danger" },
  };
  return map[p] ?? map.medium;
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

  const categoryLabel = (c?: number | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? String(c);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="처리 현황"
        subtitle="모든 요청을 한눈에 확인하고 관리하세요"
        meta={
          <span style={{ color: "var(--text-secondary)" }}>
            총 <span style={{ color: "var(--color-primary-600)", fontWeight: 600 }}>{base.length}</span>건
          </span>
        }
        actions={
          <Link
            href="/tickets/new"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl"
            style={{
              background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
            }}
          >
            <Plus className="w-4 h-4" />
            작성
          </Link>
        }
      />

      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            목록을 불러오는 중...
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {/* Unread Tickets */}
          <Card padding="none">
            <CardHeader>
              <div className="flex items-center justify-between w-full px-6 py-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  읽지 않은 요청
                </h2>
                <Badge variant="danger" size="md" dot>
                  {unreadTickets.length}건
                </Badge>
              </div>
            </CardHeader>
            <CardBody padding="none">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: "var(--bg-subtle)" }}>
                    <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <th
                        className="text-left px-6 py-3 font-semibold"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        제목
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-28"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        상태
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-28"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        우선순위
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-28"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        작업 구분
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-40 whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        카테고리
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-44 whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        최근 업데이트
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {unreadTickets.map((t) => {
                      const statusInfo = statusMeta(t.status);
                      const priorityInfo = priorityMeta(t.priority);
                      return (
                        <tr
                          key={t.id}
                          className="border-b cursor-pointer transition-colors"
                          style={{ borderColor: "var(--border-default)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                          onClick={() => {
                            markRead(t);
                            router.push(`/tickets/${t.id}`);
                          }}
                        >
                          <td className="px-6 py-4">
                            <div
                              className="min-h-[40px] flex items-center font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {t.title}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant={statusInfo.variant} size="md">
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant={priorityInfo.variant} size="md">
                              {priorityInfo.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-center" style={{ color: "var(--text-secondary)" }}>
                            {workTypeLabel(t.work_type)}
                          </td>
                          <td
                            className="px-6 py-4 text-center whitespace-nowrap"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {categoryLabel(t.category_id)}
                          </td>
                          <td
                            className="px-6 py-4 text-center whitespace-nowrap"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {formatDate(t.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                    {!unreadTickets.length && (
                      <tr>
                        <td className="px-6 py-12 text-center" colSpan={6} style={{ color: "var(--text-tertiary)" }}>
                          읽지 않은 요청이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* All Tickets */}
          <Card padding="none">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4 w-full px-6 py-4">
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  모든 요청
                </h2>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status Filter */}
                  <div
                    className="hidden md:flex items-center gap-1 rounded-lg border px-1.5 py-1.5"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-default)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                        style={{
                          backgroundColor:
                            status === o.value ? "var(--color-primary-600)" : "transparent",
                          color: status === o.value ? "#ffffff" : "var(--text-secondary)",
                        }}
                        onMouseEnter={(e) => {
                          if (status !== o.value) {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (status !== o.value) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                        onClick={() => setStatus(o.value)}
                        type="button"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {/* Project Filter */}
                  <select
                    className="border rounded-lg px-3 py-2 text-sm transition-colors"
                    style={{
                      backgroundColor: "var(--bg-input)",
                      borderColor: "var(--border-default)",
                      color: "var(--text-primary)",
                    }}
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

                  {/* Search */}
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: "var(--text-tertiary)" }}
                    />
                    <input
                      className="border rounded-lg pl-10 pr-3 py-2 text-sm w-52 transition-colors"
                      style={{
                        backgroundColor: "var(--bg-input)",
                        borderColor: "var(--border-default)",
                        color: "var(--text-primary)",
                      }}
                      placeholder="제목/ID 검색"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardBody padding="none">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: "var(--bg-subtle)" }}>
                    <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <th
                        className="text-left px-6 py-3 font-semibold"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        제목
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-28"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        상태
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-28"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        우선순위
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-28"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        작업 구분
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-40 whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        카테고리
                      </th>
                      <th
                        className="text-center px-6 py-3 font-semibold w-44 whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        최근 업데이트
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((t) => {
                      const statusInfo = statusMeta(t.status);
                      const priorityInfo = priorityMeta(t.priority);
                      return (
                        <tr
                          key={t.id}
                          className="border-b cursor-pointer transition-colors"
                          style={{ borderColor: "var(--border-default)" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                          onClick={() => {
                            markRead(t);
                            router.push(`/tickets/${t.id}`);
                          }}
                        >
                          <td className="px-6 py-4">
                            <div
                              className="min-h-[40px] flex items-center font-medium"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {t.title}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant={statusInfo.variant} size="md">
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge variant={priorityInfo.variant} size="md">
                              {priorityInfo.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-center" style={{ color: "var(--text-secondary)" }}>
                            {workTypeLabel(t.work_type)}
                          </td>
                          <td
                            className="px-6 py-4 text-center whitespace-nowrap"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {categoryLabel(t.category_id)}
                          </td>
                          <td
                            className="px-6 py-4 text-center whitespace-nowrap"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {formatDate(t.updated_at)}
                          </td>
                        </tr>
                      );
                    })}
                    {!pageItems.length && (
                      <tr>
                        <td className="px-6 py-12 text-center" colSpan={6} style={{ color: "var(--text-tertiary)" }}>
                          조건에 맞는 요청이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t" style={{ borderColor: "var(--border-default)" }}>
                <Pagination page={page} total={filteredAll.length} pageSize={pageSize} onChange={setPage} />
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        읽음 상태는 현재 기기 기준으로만 저장됩니다.
      </p>
    </div>
  );
}
