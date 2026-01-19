"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Pagination from "@/components/Pagination";
import ErrorDialog from "@/components/ErrorDialog";

type Role = "requester" | "admin";
type SortDir = "asc" | "desc";
type SortKey = "emp_no" | "kor_name" | "title" | "department" | "pending_total";

type UserRow = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  pending: number;
  total: number;
  role: Role;
};

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, string> = {
    requester: "bg-gray-100 text-gray-700 border-gray-200",
    admin: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${map[role]}`}>
      {role}
    </span>
  );
}

export default function AdminUsersPage() {
  const me = useMe();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("department");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");

  const canChangeRole = me.role === "admin";

  useEffect(() => {
    if (me.role !== "admin") {
      router.replace("/home");
      return;
    }

    let alive = true;
    setLoading(true);
    api<UserRow[]>("/admin/users")
      .then((data) => {
        if (!alive) return;
        setUsers(data);
        setError(null);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(e.message ?? "사용자 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [me.role, router]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const name = (u.kor_name ?? "").toLowerCase();
      const title = (u.title ?? "").toLowerCase();
      const dept = (u.department ?? "").toLowerCase();
      const emp = (u.emp_no ?? "").toLowerCase();
      return name.includes(term) || title.includes(term) || dept.includes(term) || emp.includes(term);
    });
  }, [users, search]);

  const sorted = useMemo(() => {
    const compareText = (a?: string | null, b?: string | null) => {
      const aa = (a ?? "").toLowerCase();
      const bb = (b ?? "").toLowerCase();
      return aa.localeCompare(bb);
    };

    const base = [...filtered].sort((a, b) => {
      if (sortKey === "emp_no") return compareText(a.emp_no, b.emp_no);
      if (sortKey === "kor_name") return compareText(a.kor_name, b.kor_name);
      if (sortKey === "title") return compareText(a.title, b.title);
      if (sortKey === "department") return compareText(a.department, b.department);
      if (sortKey === "pending_total") {
        if (a.pending !== b.pending) return a.pending - b.pending;
        return a.total - b.total;
      }
      return 0;
    });

    return sortDir === "asc" ? base : base.reverse();
  }, [filtered, sortDir, sortKey]);

  const pageSize = 20;
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [page, sorted]);

  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir, users.length]);

  const admins = useMemo(() => users.filter((u) => u.role === "admin"), [users]);

  const adminCandidates = useMemo(() => {
    const term = adminSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const name = (u.kor_name ?? "").toLowerCase();
      const title = (u.title ?? "").toLowerCase();
      const dept = (u.department ?? "").toLowerCase();
      const emp = (u.emp_no ?? "").toLowerCase();
      return name.includes(term) || title.includes(term) || dept.includes(term) || emp.includes(term);
    });
  }, [adminSearch, users]);

  const handleRoleChange = async (empNo: string, role: Role) => {
    if (!canChangeRole) return;
    setSavingId(empNo);
    try {
      const updated = await api<UserRow>(`/admin/users/${empNo}/role`, {
        method: "PATCH",
        body: { role },
      });
      setUsers((prev) => prev.map((u) => (u.emp_no === empNo ? updated : u)));
    } catch (e: any) {
      setError(e.message ?? "권한 변경에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
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
        className={`inline-flex items-center gap-1 ${active ? "text-slate-900" : "text-slate-500"}`}
        onClick={() => toggleSort(key)}
      >
        <span>{label}</span>
        <span className="text-[10px]">{arrow}</span>
      </button>
    );
  };

  if (me.role !== "admin") {
    return null;
  }

  return (
    <div className="p-5 space-y-5">
      <PageHeader
        title="사용자 관리"
        subtitle="권한 설정과 기본 정보를 관리합니다."
        actions={
          <div className="flex items-center gap-2">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
              placeholder="이름/직급/부서/직책/ID 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />

      <ErrorDialog message={error} onClose={() => setError(null)} />

      <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 w-28">{renderSortLabel("emp_no", "ID")}</th>
              <th className="text-left p-3 w-28">{renderSortLabel("kor_name", "이름")}</th>
              <th className="text-left p-3 w-28">{renderSortLabel("title", "직급")}</th>
              <th className="text-left p-3 w-40">{renderSortLabel("department", "부서/직책")}</th>
              <th className="text-left p-3 w-40">
                {renderSortLabel("pending_total", "미처리/등록 요청")}
              </th>
              <th className="text-left p-3 w-20">관리</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="border-t">
                <td className="p-3 text-slate-500" colSpan={6}>
                  사용자 목록을 불러오는 중입니다...
                </td>
              </tr>
            )}
            {!loading &&
              paged.map((u) => (
                <tr key={u.emp_no} className="border-t">
                  <td className="p-3 font-medium text-slate-900">{u.emp_no || "-"}</td>
                  <td className="p-3 font-medium text-slate-900">{u.kor_name || "-"}</td>
                  <td className="p-3">{u.title || "-"}</td>
                  <td className="p-3 text-slate-700">{u.department || "-"}</td>
                  <td className="p-3 text-slate-700">
                    <span className="font-semibold text-amber-700">{u.pending}</span>
                    <span className="text-slate-400"> / </span>
                    <span className="text-slate-700">{u.total}</span>
                  </td>
                  <td className="p-3 text-slate-400">-</td>
                </tr>
              ))}
            {!loading && !paged.length && (
              <tr className="border-t">
                <td className="p-3 text-slate-500" colSpan={6}>
                  검색 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          총 <span className="font-semibold text-slate-900">{sorted.length}</span>명
        </div>
        <button
          type="button"
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          onClick={() => setAdminModalOpen(true)}
          disabled={!canChangeRole}
        >
          admin
        </button>
      </div>

      <Pagination page={page} total={sorted.length} pageSize={pageSize} onChange={setPage} />

      {adminModalOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setAdminModalOpen(false)}
          />
          <div className="absolute inset-x-0 top-16 mx-auto w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">관리자 지정</h2>
                <p className="text-sm text-slate-500">관리자 추가/해제 및 현재 관리자 확인</p>
              </div>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                onClick={() => setAdminModalOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-2">현재 관리자</div>
                <div className="grid grid-cols-2 gap-2">
                  {admins.map((u) => (
                    <div
                      key={u.emp_no}
                      className="border border-emerald-100 bg-emerald-50 rounded-lg px-3 py-2 text-sm text-emerald-900"
                    >
                      {u.kor_name ?? "-"} / {u.title ?? "-"}
                    </div>
                  ))}
                  {!admins.length && (
                    <div className="text-sm text-slate-500">관리자가 없습니다.</div>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs font-semibold text-slate-500">사용자 검색</div>
                  <input
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1"
                    placeholder="이름/직급/부서/직책/ID 검색"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-80 overflow-auto border border-slate-100 rounded-lg">
                  {adminCandidates.map((u) => (
                    <div
                      key={u.emp_no}
                      className="flex items-center justify-between px-3 py-2 border-t first:border-t-0 text-sm"
                    >
                      <div className="text-slate-900">
                        {u.emp_no} · {u.kor_name ?? "-"} / {u.title ?? "-"} /{" "}
                        {u.department ?? "-"}
                      </div>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded-md text-xs border ${
                          u.role === "admin"
                            ? "border-red-200 text-red-700 hover:bg-red-50"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        }`}
                        disabled={savingId === u.emp_no}
                        onClick={() =>
                          handleRoleChange(u.emp_no, u.role === "admin" ? "requester" : "admin")
                        }
                      >
                        {u.role === "admin" ? "관리자 해제" : "관리자 지정"}
                      </button>
                    </div>
                  ))}
                  {!adminCandidates.length && (
                    <div className="px-3 py-4 text-sm text-slate-500">검색 결과가 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
