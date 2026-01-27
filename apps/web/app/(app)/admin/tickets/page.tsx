"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
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

type SortDir = "asc" | "desc";
type SortKey = "id" | "title" | "status" | "priority" | "work_type" | "category_id" | "created_at";

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

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info" | "neutral";

type UserSummary = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  role?: string | null;
};

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

function priorityMeta(priority?: string): { label: string; variant: BadgeVariant } {
  const p = (priority || "medium").toLowerCase();
  if (p === "low") return { label: "낮음", variant: "neutral" };
  if (p === "medium") return { label: "보통", variant: "info" };
  if (p === "high") return { label: "높음", variant: "warning" };
  if (p === "urgent") return { label: "긴급", variant: "danger" };
  return { label: "보통", variant: "info" };
}

function formatUser(user?: UserSummary | null, fallbackEmpNo?: string | null, emptyLabel = "-") {
  if (!user) return fallbackEmpNo || emptyLabel;
  const parts = [user.kor_name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.emp_no || fallbackEmpNo || emptyLabel;
}

function normalize(res: TicketListResponse): { items: Ticket[]; total?: number } {
  if (Array.isArray(res)) return { items: res };
  if ("items" in res) return { items: res.items, total: res.total };
  if ("data" in res) return { items: res.data, total: res.total };
  return { items: [] };
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
  return map[value] ?? "기타";
}

function matchesSearch(t: Ticket, term: string) {
  if (!term) return true;
  const lower = term.toLowerCase();
  const requester = formatUser(t.requester, t.requester_emp_no, "").toLowerCase();
  return t.title.toLowerCase().includes(lower) || requester.includes(lower);
}

export default function AdminTicketsPage() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const { categories, map: categoryMap } = useTicketCategories();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (me.role !== "admin") {
    router.replace("/home");
    return null;
  }

  const limit = 100;
  const offset = 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tickets", { limit, offset }],
    queryFn: () => api<TicketListResponse>(`/tickets?scope=all&limit=${limit}&offset=${offset}`),
    staleTime: 5_000,
  });

  const { data: adminUsers = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<UserSummary[]>("/admin/users"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!error) return;
    setErrorMessage((error as any)?.message ?? "요청 목록을 불러오지 못했습니다.");
  }, [error]);

  const staffOptions = useMemo(() => adminUsers.filter((u) => u.role === "admin"), [adminUsers]);

  const assignM = useMutation({
    mutationFn: ({
      ticketId,
      assigneeEmpNo,
    }: {
      ticketId: number;
      assigneeEmpNo: string | null;
    }) =>
      api(`/tickets/${ticketId}/assign`, {
        method: "PATCH",
        body: { assignee_emp_no: assigneeEmpNo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail"] });
    },
  });

  const norm = normalize(data ?? []);

  const filtered = useMemo(() => {
    let list = norm.items.filter((t) => t.assignee_emp_no === me.emp_no);
    if (category !== "all") {
      list = list.filter((t) => String(t.category_id ?? "") === category);
    }
    if (search.trim()) {
      list = list.filter((t) => matchesSearch(t, search.trim()));
    }
    return list;
  }, [norm.items, me.emp_no, category, search]);

  const sorted = useMemo(() => {
    const compareText = (a?: string | null, b?: string | null) => {
      const aa = (a ?? "").toLowerCase();
      const bb = (b ?? "").toLowerCase();
      return aa.localeCompare(bb);
    };

    const base = [...filtered].sort((a, b) => {
      if (sortKey === "id") return a.id - b.id;
      if (sortKey === "title") return compareText(a.title, b.title);
      if (sortKey === "status") {
        const sa = STATUS_SORT[a.status] ?? 9;
        const sb = STATUS_SORT[b.status] ?? 9;
        return sa - sb;
      }
      if (sortKey === "priority") {
        const pa = priorityRank(a.priority);
        const pb = priorityRank(b.priority);
        return pa - pb;
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

    return sortDir === "asc" ? base : base.reverse();
  }, [filtered, sortKey, sortDir, categoryMap]);

  const categoryLabel = (c?: number | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? String(c);
  };

  const pageSize = 10;
  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, category, sortKey, sortDir]);

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
                내 담당 요청
              </h2>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  className="border rounded-lg px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    borderColor: "var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="all">전체 카테고리</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
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
                    placeholder="제목/요청자 검색"
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
                    <th className="text-left px-6 py-3 font-semibold w-20" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("id", "ID")}
                    </th>
                    <th className="text-left px-6 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("title", "제목")}
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("status", "상태")}
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("priority", "우선순위")}
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-40 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      담당자
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-28" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("work_type", "작업 구분")}
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-40 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("category_id", "카테고리")}
                    </th>
                    <th className="text-center px-6 py-3 font-semibold w-44 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("created_at", "작성일")}
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
                        onClick={() => router.push(`/admin/tickets/${t.id}`)}
                      >
                        <td className="px-6 py-4" style={{ color: "var(--text-secondary)" }}>
                          {t.id}
                        </td>
                        <td className="px-6 py-4">
                          <div className="min-h-[40px] flex flex-col justify-center">
                            <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                              {t.title}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                              {formatUser(t.requester, t.requester_emp_no)}
                            </div>
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
                        <td className="px-6 py-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="w-full min-w-[240px] border rounded-lg px-2 py-1.5 text-xs text-center transition-colors"
                            style={{
                              backgroundColor: "var(--bg-input)",
                              borderColor: "var(--border-default)",
                              color: "var(--text-primary)",
                            }}
                            value={t.assignee_emp_no ?? ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const value = e.target.value;
                              const assigneeEmpNo = value || null;
                              assignM.mutate({ ticketId: t.id, assigneeEmpNo });
                            }}
                          >
                            <option value="">미배정</option>
                            {staffOptions.map((u) => (
                              <option key={u.emp_no} value={u.emp_no}>
                                {formatUser(u, u.emp_no, u.emp_no)}
                              </option>
                            ))}
                          </select>
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
                    );
                  })}
                  {!pageItems.length && (
                    <tr>
                      <td className="px-6 py-12 text-center" colSpan={8} style={{ color: "var(--text-tertiary)" }}>
                        내 담당 요청이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t" style={{ borderColor: "var(--border-default)" }}>
              <Pagination page={page} total={sorted.length} pageSize={pageSize} onChange={setPage} />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
