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

type SortDir = "asc" | "desc";
type SortKey = "title" | "status" | "work_type" | "category_id" | "created_at";

const STATUS_SORT: Record<string, number> = {
  open: 0,
  in_progress: 1,
  resolved: 2,
  closed: 3,
};


function formatDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
}

function toTime(v?: string | null) {
  if (!v) return 0;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
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

function StatusBadge({ status }: { status: string }) {
  const { label, variant } = statusMeta(status);
  return (
    <Badge variant={variant} size="md">
      {label}
    </Badge>
  );
}


export default function ResolvedTicketsPage() {
  const router = useRouter();
  const { map: categoryMap } = useTicketCategories();
  const status = "resolved";
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, error } = useQuery({
    queryKey: ["resolved-tickets"],
    queryFn: () => api<Ticket[]>(`/tickets?status=${status}&limit=100&offset=0`),
    staleTime: 5_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-mine-false"],
    queryFn: () => api<Project[]>("/projects?mine=false"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!error) return;
    setErrorMessage((error as any)?.message ?? "요청 목록을 불러오지 못했습니다.");
  }, [error]);

  const filtered = useMemo(() => {
    let list = Array.isArray(data) ? data : [];
    if (projectFilter !== "all") {
      list = list.filter((t) => String(t.project_id ?? "") === projectFilter);
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(term) || String(t.id).includes(term)
      );
    }

    const compareText = (a?: string | null, b?: string | null) => {
      const aa = (a ?? "").toLowerCase();
      const bb = (b ?? "").toLowerCase();
      return aa.localeCompare(bb);
    };

    const sorted = [...list].sort((a, b) => {
      if (sortKey === "title") return compareText(a.title, b.title);
      if (sortKey === "status") {
        const sa = STATUS_SORT[a.status] ?? 9;
        const sb = STATUS_SORT[b.status] ?? 9;
        return sa - sb;
      }
      if (sortKey === "work_type") return compareText(a.work_type, b.work_type);
      if (sortKey === "category_id") {
        const ca = categoryMap[a.category_id ?? 0] ?? "";
        const cb = categoryMap[b.category_id ?? 0] ?? "";
        return compareText(ca, cb);
      }
      if (sortKey === "created_at") return toTime(a.created_at) - toTime(b.created_at);
      return 0;
    });

    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [data, search, projectFilter, sortKey, sortDir, categoryMap]);

  useEffect(() => {
    setPage(1);
  }, [filtered.length, search, projectFilter, sortKey, sortDir]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const categoryLabel = (c?: number | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? String(c);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const renderSortLabel = (key: SortKey, label: string) => {
    const active = sortKey === key;
    const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "↕";
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 transition-colors"
        style={{
          color: active ? "var(--text-primary)" : "var(--text-secondary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = active ? "var(--text-primary)" : "var(--text-secondary)";
        }}
        onClick={() => toggleSort(key)}
      >
        <span>{label}</span>
        <span className="text-[10px]">{arrow}</span>
      </button>
    );
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
                처리 완료
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
              <table className="w-full text-sm whitespace-nowrap">
                <thead style={{ backgroundColor: "var(--bg-subtle)" }}>
                  <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("title", "제목")}
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("status", "상태")}
                    </th>
                    
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("work_type", "작업 구분")}
                    </th>
                    <th
                      className="text-center px-6 py-3 font-semibold w-40 whitespace-nowrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {renderSortLabel("category_id", "카테고리")}
                    </th>
                    <th
                      className="text-center px-6 py-3 font-semibold w-44 whitespace-nowrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {renderSortLabel("created_at", "작성일")}
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
                      <td className="px-6 py-4 text-center" style={{ color: "var(--text-secondary)" }}>
                        {workTypeLabel(t.work_type)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        {categoryLabel(t.category_id)}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                        {formatDate(t.created_at)}
                      </td>
                    </tr>
                  ))}
                  {!pageItems.length && !isLoading && (
                    <tr>
                      <td className="px-6 py-12 text-center" colSpan={5} style={{ color: "var(--text-tertiary)" }}>
                        처리 완료 요청이 없습니다.
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
