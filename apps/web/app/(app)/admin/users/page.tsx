"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/auth-context";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import ErrorDialog from "@/components/ErrorDialog";

type Role = "requester" | "admin";

type UserRow = {
  id: number;
  employee_no?: string | null;
  name?: string | null;
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
  const [savingId, setSavingId] = useState<number | null>(null);

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
      const name = (u.name ?? "").toLowerCase();
      const title = (u.title ?? "").toLowerCase();
      const dept = (u.department ?? "").toLowerCase();
      const emp = (u.employee_no ?? "").toLowerCase();
      return name.includes(term) || title.includes(term) || dept.includes(term) || emp.includes(term);
    });
  }, [users, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const deptA = (a.department ?? "").toLowerCase();
      const deptB = (b.department ?? "").toLowerCase();
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      const nameA = (a.name ?? "").toLowerCase();
      const nameB = (b.name ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [filtered]);

  const handleRoleChange = async (userId: number, role: Role) => {
    if (!canChangeRole) return;
    setSavingId(userId);
    try {
      const updated = await api<UserRow>(`/admin/users/${userId}/role`, {
        method: "PATCH",
        body: { role },
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (e: any) {
      setError(e.message ?? "권한 변경에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
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
          <input
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
            placeholder="이름/직급/부서/직책/ID 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
      />

      <ErrorDialog message={error} onClose={() => setError(null)} />

      <div className="border border-slate-200/70 rounded-2xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left p-3 w-28">ID</th>
              <th className="text-left p-3 w-28">이름</th>
              <th className="text-left p-3 w-28">직급</th>
              <th className="text-left p-3 w-40">부서/직책</th>
              <th className="text-left p-3 w-40">미처리/등록 요청</th>
              <th className="text-left p-3 w-32">권한</th>
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
              sorted.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium text-slate-900">{u.employee_no || "-"}</td>
                  <td className="p-3 font-medium text-slate-900">{u.name || "-"}</td>
                  <td className="p-3">{u.title || "-"}</td>
                  <td className="p-3 text-slate-700">{u.department || "-"}</td>
                  <td className="p-3 text-slate-700">
                    <span className="font-semibold text-amber-700">{u.pending}</span>
                    <span className="text-slate-400"> / </span>
                    <span className="text-slate-700">{u.total}</span>
                  </td>
                  <td className="p-3">
                    {canChangeRole ? (
                      <select
                        className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
                        value={u.role}
                        disabled={savingId === u.id}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                      >
                        <option value="requester">requester</option>
                        <option value="admin">admin</option>
                      </select>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                </tr>
              ))}
            {!loading && !sorted.length && (
              <tr className="border-t">
                <td className="p-3 text-slate-500" colSpan={6}>
                  검색 결과가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
