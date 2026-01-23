"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import ErrorDialog from "@/components/ErrorDialog";

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

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "대기" },
  { value: "in_progress", label: "진행" },
  { value: "resolved", label: "완료" },
  { value: "closed", label: "사업 검토" },
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

type UserSummary = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  role?: string | null;
};

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (["open", "new", "pending"].includes(s)) {
    return { label: "대기", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  if (["in_progress", "processing", "assigned"].includes(s)) {
    return { label: "진행", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  }
  if (s == "resolved") return { label: "완료", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s == "closed") return { label: "사업 검토", cls: "bg-slate-100 text-slate-700 border-slate-200" };
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
  const [unassignedStatus, setUnassignedStatus] = useState<string>("all");
  const [myStatus, setMyStatus] = useState<string>("all");
  const [unassignedSearch, setUnassignedSearch] = useState("");
  const [mySearch, setMySearch] = useState("");
  const [unassignedCategory, setUnassignedCategory] = useState("all");
  const [myCategory, setMyCategory] = useState("all");
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [myPage, setMyPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const unassignedTickets = useMemo(() => {
    let list = norm.items.filter((t) => !t.assignee_emp_no);
    if (unassignedStatus !== "all") {
      list = list.filter((t) => t.status === unassignedStatus);
    }
    if (unassignedCategory !== "all") {
      list = list.filter((t) => String(t.category_id ?? "") === unassignedCategory);
    }
    if (unassignedSearch.trim()) {
      list = list.filter((t) => matchesSearch(t, unassignedSearch.trim()));
    }
    return list.sort((a, b) => {
      const sa = STATUS_SORT[a.status] ?? 9;
      const sb = STATUS_SORT[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      return toTime(b.updated_at) - toTime(a.updated_at);
    });
  }, [norm.items, unassignedStatus, unassignedCategory, unassignedSearch]);

  const myTickets = useMemo(() => {
    let list = norm.items.filter((t) => t.assignee_emp_no === me.emp_no);
    if (myStatus !== "all") {
      list = list.filter((t) => t.status === myStatus);
    }
    if (myCategory !== "all") {
      list = list.filter((t) => String(t.category_id ?? "") === myCategory);
    }
    if (mySearch.trim()) {
      list = list.filter((t) => matchesSearch(t, mySearch.trim()));
    }
    return list.sort((a, b) => {
      const sa = STATUS_SORT[a.status] ?? 9;
      const sb = STATUS_SORT[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      const pa = priorityRank(a.priority);
      const pb = priorityRank(b.priority);
      if (pa !== pb) return pa - pb;
      return toTime(b.updated_at) - toTime(a.updated_at);
    });
  }, [norm.items, me.emp_no, myStatus, myCategory, mySearch]);

  const categoryLabel = (c?: number | null) => {
    if (!c) return "-";
    return categoryMap[c] ?? String(c);
  };

  const unassignedPageSize = 5;
  const myPageSize = 10;
  const unassignedPageItems = unassignedTickets.slice((unassignedPage - 1) * unassignedPageSize, unassignedPage * unassignedPageSize);
  const myPageItems = myTickets.slice((myPage - 1) * myPageSize, myPage * myPageSize);

  useEffect(() => {
    setUnassignedPage(1);
  }, [unassignedSearch, unassignedCategory, unassignedStatus]);

  useEffect(() => {
    setMyPage(1);
  }, [mySearch, myCategory, myStatus]);

  const renderFilters = (
    status: string,
    setStatus: (v: string) => void,
    search: string,
    setSearch: (v: string) => void,
    category: string,
    setCategory: (v: string) => void
  ) => (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="hidden md:flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={`px-2 py-1 text-xs rounded ${
              status === o.value ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
            onClick={() => setStatus(o.value)}
            type="button"
          >
            {o.label}
          </button>
        ))}
      </div>
      <select
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
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
      <input
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-slate-300"
        placeholder="제목/요청자 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </div>
  );

  const renderTable = (items: Ticket[], emptyText: string) => (
    <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
      <table className="w-full text-sm text-center">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left p-3 w-20">ID</th>
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
          {items.map((t) => (
            <tr
              key={t.id}
              className="border-t cursor-pointer hover:bg-slate-50"
              onClick={() => router.push(`/admin/tickets/${t.id}`)}
            >
              <td className="p-3 text-left">#{t.id}</td>
              <td className="p-3 text-left">
                <div className="font-medium text-slate-900">{t.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatUser(t.requester, t.requester_emp_no)}</div>
              </td>
              <td className="p-3 text-center">
                <StatusBadge status={t.status} />
              </td>
              <td className="p-3 text-center">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="p-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <select
                  className="w-full min-w-[240px] border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center bg-white"
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
              <td className="p-3 text-center">{workTypeLabel(t.work_type)}</td>
                <td className="p-3 text-center">{categoryLabel(t.category_id)}</td>
              <td className="p-3 text-center text-slate-600 whitespace-nowrap">{formatDate(t.updated_at)}</td>
            </tr>
          ))}
          {!items.length && !isLoading && (
            <tr className="border-t">
              <td className="p-4 text-slate-500 text-center" colSpan={8}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-5 space-y-5">
      <PageHeader
        title="요청 관리"
        meta={
          <span>
            미배정 <span className="text-emerald-700 font-semibold">{unassignedTickets.length}</span>건 / 내 담당{" "}
            <span className="text-emerald-700 font-semibold">{myTickets.length}</span>건
          </span>
        }
      />

      <ErrorDialog message={errorMessage} onClose={() => setErrorMessage(null)} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-slate-900">담당자 미배정 요청</h2>
          {renderFilters(
            unassignedStatus,
            setUnassignedStatus,
            unassignedSearch,
            setUnassignedSearch,
            unassignedCategory,
            setUnassignedCategory
          )}
        </div>
        {renderTable(unassignedPageItems, "미배정 요청이 없습니다.")}
        <Pagination
          page={unassignedPage}
          total={unassignedTickets.length}
          pageSize={unassignedPageSize}
          onChange={setUnassignedPage}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-slate-900">내 담당 요청</h2>
          {renderFilters(myStatus, setMyStatus, mySearch, setMySearch, myCategory, setMyCategory)}
        </div>
        {renderTable(myPageItems, "내 담당 요청이 없습니다.")}
        <Pagination page={myPage} total={myTickets.length} pageSize={myPageSize} onChange={setMyPage} />
      </section>
    </div>
  );
}
