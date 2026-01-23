"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import Pagination from "@/components/Pagination";
import ErrorDialog from "@/components/ErrorDialog";
import { Badge, Card, CardHeader, CardBody } from "@/components/ui";
import { Search } from "lucide-react";

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

type Project = {
  id: number;
  name: string;
};

type UserSummary = {
  emp_no: string;
  kor_name?: string | null;
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
    return { label: "사업 검토", cls: "bg-slate-100 text-slate-700 border-slate-200" };
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

  const categoryLabel = (c?: number | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? String(c);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            목록을 불러오는 중...
          </div>
        </div>
      )}

      {!isLoading && (
        <Card padding="none">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4 w-full px-6 py-4">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                모든 요청
              </h2>

              <div className="flex items-center gap-2 flex-wrap">
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
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                      제목
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      상태
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      우선순위
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
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
                  {pageItems.map((t) => (
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
                      onClick={() => router.push(`/tickets/${t.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="min-h-[40px] flex items-center font-medium" style={{ color: "var(--text-primary)" }}>
                          {t.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <PriorityBadge priority={t.priority} />
                      </td>
                      <td className="px-6 py-4 text-center" style={{ color: "var(--text-secondary)" }}>
                        {workTypeLabel(t.work_type)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        {categoryLabel(t.category_id)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                        {formatDate(t.updated_at)}
                      </td>
                    </tr>
                  ))}
                  {!pageItems.length && !isLoading && (
                    <tr>
                      <td className="px-6 py-12 text-center" colSpan={6} style={{ color: "var(--text-tertiary)" }}>
                        사업 검토 요청이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t" style={{ borderColor: "var(--border-default)" }}>
              <Pagination page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
