"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import Pagination from "@/components/Pagination";
import ErrorDialog from "@/components/ErrorDialog";
import PageHeader from "@/components/PageHeader";
import { Badge, Card, CardBody } from "@/components/ui";
import { Search, ListChecks } from "lucide-react";

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
  assignee_emp_nos?: string[] | null;
  assignees?: UserSummary[] | null;
  created_at: string;
  updated_at: string;
};

type TicketListResponse =
  | { items: Ticket[]; total?: number }
  | { data: Ticket[]; total?: number }
  | Ticket[];

type SortDir = "asc" | "desc";
type SortKey = "id" | "title" | "status" | "priority" | "assignee" | "work_type" | "category_id" | "created_at";
type StatusFilter = "all" | "pending" | "resolved" | "closed";

function passesStatusFilter(t: Ticket, filter: StatusFilter): boolean {
  const s = (t.status ?? "").toLowerCase();
  if (filter === "all") return true;
  if (filter === "pending") return s === "open" || s === "in_progress";
  if (filter === "resolved") return s === "resolved";
  if (filter === "closed") return s === "closed";
  return true;
}

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

export default function AdminAllTicketsPage() {
  const me = useMe();
  const router = useRouter();
  const { map: categoryMap } = useTicketCategories();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | "default">("default");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null);
  const qc = useQueryClient();

  if (me.role !== "admin") {
    router.replace("/home");
    return null;
  }

  const limit = 100;
  const offset = 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-tickets-all", { limit, offset }],
    queryFn: () => api<TicketListResponse>(`/tickets?scope=all&limit=${limit}&offset=${offset}`),
    staleTime: 5_000,
  });

  const { data: adminUsers = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<UserSummary[]>("/admin/users"),
    staleTime: 30_000,
  });

  const staffOptions = useMemo(() => adminUsers.filter((u) => u.role === "admin"), [adminUsers]);

  const assignM = useMutation({
    mutationFn: ({
      ticketId,
      assigneeEmpNos,
    }: {
      ticketId: number;
      assigneeEmpNos: string[];
    }) =>
      api(`/tickets/${ticketId}/assign`, {
        method: "PATCH",
        body: { assignee_emp_nos: assigneeEmpNos },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-tickets-all"] });
      qc.invalidateQueries({ queryKey: ["admin-ticket-detail"] });
    },
  });

  useEffect(() => {
    if (!error) return;
    setErrorMessage((error as any)?.message ?? "요청 목록을 불러오지 못했습니다.");
  }, [error]);

  const norm = normalize(data ?? []);

  const filtered = useMemo(() => {
    let list = norm.items.filter((t) => passesStatusFilter(t, statusFilter));
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(term) ||
          String(t.id).includes(term) ||
          String(t.category_id ?? "").includes(term)
      );
    }
    return list;
  }, [norm.items, statusFilter, search]);

  const sorted = useMemo(() => {
    const compareText = (a?: string | null, b?: string | null) => {
      const aa = (a ?? "").toLowerCase();
      const bb = (b ?? "").toLowerCase();
      return aa.localeCompare(bb);
    };

    const base = [...filtered].sort((a, b) => {
      if (sortKey === "default") {
        const sa = STATUS_SORT[a.status] ?? 9;
        const sb = STATUS_SORT[b.status] ?? 9;
        if (sa !== sb) return sa - sb;
        return toTime(a.created_at) - toTime(b.created_at);
      }
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
      if (sortKey === "assignee") {
        const aa = formatUser(a.assignee, a.assignee_emp_no, "");
        const ab = formatUser(b.assignee, b.assignee_emp_no, "");
        return compareText(aa, ab);
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

  const pageItems = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  );

  const categoryLabel = (c?: number | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? String(c);
  };

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sortKey, sortDir]);

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
      <PageHeader
        title="모든 요청 관리"
        subtitle="전체 요청을 검색하고 관리하세요."
        icon={<ListChecks className="w-7 h-7" />}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
              <input
                className="border rounded-lg pl-10 pr-3 py-2 text-sm w-80 transition-colors"
                style={{
                  backgroundColor: "var(--bg-input)",
                  borderColor: "var(--border-default)",
                  color: "var(--text-primary)",
                }}
                placeholder="제목/ID/카테고리 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border overflow-hidden" style={{ borderColor: "var(--border-default)" }}>
              {(["all", "pending", "resolved", "closed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: statusFilter === f ? "var(--color-primary-100)" : "var(--bg-elevated)",
                    color: statusFilter === f ? "var(--color-primary-700)" : "var(--text-secondary)",
                  }}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === "all" ? "전체" : f === "pending" ? "대기,진행" : f === "resolved" ? "완료" : "사업검토"}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            목록을 불러오는 중...
          </div>
        </div>
      )}

      {!isLoading && (
        <Card padding="none">
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
                    <th className="text-center px-6 py-3 font-semibold w-40 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                      {renderSortLabel("assignee", "담당자")}
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
                        <td className="px-6 py-3 text-center relative" style={{ minWidth: "200px" }} onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                              {(() => {
                                const assignees = t.assignees || [];
                                const empNos = t.assignee_emp_nos || (t.assignee_emp_no ? [t.assignee_emp_no] : []);
                                const displayAssignees = assignees.length > 0
                                  ? assignees
                                  : staffOptions.filter((u) => empNos.includes(u.emp_no));
                                
                                if (displayAssignees.length === 0) {
                                  return (
                                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                      미배정
                                    </span>
                                  );
                                }
                                
                                return displayAssignees.map((u) => (
                                  <span
                                    key={u.emp_no}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs whitespace-nowrap"
                                    style={{
                                      backgroundColor: "var(--color-primary-50)",
                                      color: "var(--color-primary-700)",
                                      border: "1px solid var(--color-primary-200)",
                                    }}
                                  >
                                    {u.kor_name || u.emp_no}
                                  </span>
                                ));
                              })()}
                            </div>
                            <button
                              className="text-xs px-1.5 py-0.5 rounded transition-colors"
                              style={{
                                color: "var(--color-primary-600)",
                                backgroundColor: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTicketId(editingTicketId === t.id ? null : t.id);
                              }}
                            >
                              편집
                            </button>
                          </div>
                          {editingTicketId === t.id && (
                            <div 
                              className="absolute z-50 mt-1 p-3 rounded-lg shadow-lg"
                              style={{
                                backgroundColor: "var(--bg-elevated)",
                                border: "1px solid var(--border-default)",
                                top: "100%",
                                right: "0",
                                minWidth: "280px",
                                maxHeight: "300px",
                                overflowY: "auto",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="space-y-2">
                                {staffOptions.length === 0 && (
                                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                    관리자 계정이 없습니다.
                                  </span>
                                )}
                                {staffOptions.map((u) => {
                                  const currentAssignees = t.assignee_emp_nos || (t.assignee_emp_no ? [t.assignee_emp_no] : []);
                                  const checked = currentAssignees.includes(u.emp_no);
                                  return (
                                    <label key={u.emp_no} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-opacity-50 p-1 rounded">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded"
                                        style={{ accentColor: "var(--color-primary-600)" }}
                                        checked={checked}
                                        onChange={() => {
                                          const next = checked
                                            ? currentAssignees.filter((empNo) => empNo !== u.emp_no)
                                            : [...currentAssignees, u.emp_no];
                                          assignM.mutate({ ticketId: t.id, assigneeEmpNos: next });
                                        }}
                                      />
                                      <span>{formatUser(u, u.emp_no)}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="mt-3 pt-2" style={{ borderTop: "1px solid var(--border-default)" }}>
                                <button
                                  className="w-full text-xs px-3 py-1.5 rounded transition-colors font-medium"
                                  style={{
                                    color: "white",
                                    backgroundColor: "var(--color-primary-600)",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--color-primary-700)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "var(--color-primary-600)";
                                  }}
                                  onClick={() => setEditingTicketId(null)}
                                >
                                  완료
                                </button>
                              </div>
                            </div>
                          )}
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
                        요청이 없습니다.
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
