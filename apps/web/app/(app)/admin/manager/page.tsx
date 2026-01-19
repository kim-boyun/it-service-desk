"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import PageHeader from "@/components/PageHeader";
import ErrorDialog from "@/components/ErrorDialog";

type UserSummary = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  role?: string | null;
};

type ContactPerson = {
  emp_no?: string | null;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ContactGroup = {
  category_id: number;
  people: ContactPerson[];
};

export default function AdminManagerPage() {
  const me = useMe();
  const router = useRouter();
  const { categories } = useTicketCategories();
  const [draft, setDraft] = useState<Record<number, { primary: string; secondary: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.role !== "admin") {
      router.replace("/home");
    }
  }, [me.role, router]);

  const { data: adminUsers = [] } = useQuery({
    queryKey: ["manager-admin-users"],
    queryFn: () => api<UserSummary[]>("/admin/users"),
    staleTime: 60_000,
  });

  const adminOnly = useMemo(() => adminUsers.filter((u) => u.role === "admin"), [adminUsers]);

  const { data: assignments = [] } = useQuery({
    queryKey: ["contact-assignments"],
    queryFn: () => api<ContactGroup[]>("/contact-assignments"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!categories.length) return;
    const next: Record<number, { primary: string; secondary: string }> = {};
    for (const category of categories) {
      const group = assignments.find((a) => a.category_id === category.id);
      const people = group?.people ?? [];
      next[category.id] = {
        primary: people[0]?.emp_no ?? "",
        secondary: people[1]?.emp_no ?? "",
      };
    }
    setDraft(next);
  }, [categories, assignments]);

  function updatePrimary(categoryId: number, empNo: string) {
    setDraft((prev) => {
      const next = { ...prev };
      const current = next[categoryId] ?? { primary: "", secondary: "" };
      const secondary = empNo && empNo === current.secondary ? "" : current.secondary;
      next[categoryId] = { primary: empNo, secondary };
      return next;
    });
  }

  function updateSecondary(categoryId: number, empNo: string) {
    setDraft((prev) => {
      const next = { ...prev };
      const current = next[categoryId] ?? { primary: "", secondary: "" };
      if (empNo && empNo === current.primary) {
        return prev;
      }
      next[categoryId] = { primary: current.primary, secondary: empNo };
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api<ContactGroup[]>("/contact-assignments", {
        method: "PUT",
        body: {
          assignments: categories.map((c) => ({
            category_id: c.id,
            emp_nos: Array.from(
              new Set(
                [draft[c.id]?.primary ?? "", draft[c.id]?.secondary ?? ""].filter(Boolean)
              )
            ),
          })),
        },
      });
    } catch (e: any) {
      setError(e.message ?? "고객담당자 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="카테고리 담당자 관리"
        meta={<span className="text-sm text-slate-500">카테고리별 담당자를 지정할 수 있습니다.</span>}
      />

      <ErrorDialog message={error} onClose={() => setError(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {categories.map((category) => (
          <div key={category.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-base font-semibold text-slate-900 mb-3">{category.name}</div>
            <div className="space-y-3">
              {adminOnly.length === 0 ? (
                <div className="text-sm text-slate-500">관리자 계정이 없습니다.</div>
              ) : (
                <>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500">정 담당자</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                      value={draft[category.id]?.primary ?? ""}
                      onChange={(e) => updatePrimary(category.id, e.target.value)}
                    >
                      <option value="">선택 안 함</option>
                      {adminOnly.map((u) => (
                        <option key={`${category.id}-primary-${u.emp_no}`} value={u.emp_no}>
                          {[u.kor_name, u.title, u.department].filter(Boolean).join(" / ") || u.emp_no}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500">부 담당자</div>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                      value={draft[category.id]?.secondary ?? ""}
                      onChange={(e) => updateSecondary(category.id, e.target.value)}
                    >
                      <option value="">선택 안 함</option>
                      {adminOnly
                        .filter((u) => u.emp_no !== (draft[category.id]?.primary ?? ""))
                        .map((u) => (
                          <option key={`${category.id}-secondary-${u.emp_no}`} value={u.emp_no}>
                            {[u.kor_name, u.title, u.department].filter(Boolean).join(" / ") || u.emp_no}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          onClick={save}
          disabled={saving}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
