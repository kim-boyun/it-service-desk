"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import PageHeader from "@/components/PageHeader";
import ErrorDialog from "@/components/ErrorDialog";
import { Tags } from "lucide-react";

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

type TicketCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
};

type CategoryDraft = {
  name: string;
  description: string;
  empNos: string[];
};

export default function AdminManagerPage() {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const { categories, loading: categoriesLoading, error: categoriesError, refetch: refetchCategories } =
    useTicketCategories();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, CategoryDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

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
    const next: Record<number, CategoryDraft> = {};
    for (const category of categories) {
      const group = assignments.find((a) => a.category_id === category.id);
      const empNos = (group?.people ?? []).map((p) => p.emp_no).filter(Boolean) as string[];
      next[category.id] = {
        name: category.name,
        description: category.description ?? "",
        empNos,
      };
    }
    setDrafts(next);
  }, [categories, assignments]);

  function toggleEmpNo(categoryId: number, empNo: string) {
    setDrafts((prev) => {
      const current = prev[categoryId] ?? { name: "", description: "", empNos: [] };
      const next = new Set(current.empNos);
      if (next.has(empNo)) {
        next.delete(empNo);
      } else {
        next.add(empNo);
      }
      return { ...prev, [categoryId]: { ...current, empNos: Array.from(next) } };
    });
  }

  async function saveCategory(category: TicketCategory) {
    const draft = drafts[category.id];
    if (!draft?.name.trim()) {
      setError("카테고리 이름을 입력해 주세요.");
      return;
    }
    if (!confirm("변경을 저장하시겠습니까?")) return;
    setSavingId(category.id);
    setError(null);
    try {
      await api(`/ticket-categories/${category.id}`, {
        method: "PATCH",
        body: {
          name: draft.name.trim(),
          description: draft.description?.trim() || null,
        },
      });
      await api<ContactGroup[]>("/contact-assignments", {
        method: "PUT",
        body: {
          assignments: [
            {
              category_id: category.id,
              emp_nos: draft.empNos,
            },
          ],
        },
      });
      await qc.invalidateQueries({ queryKey: ["contact-assignments"] });
      await qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      await refetchCategories();
    } catch (e: any) {
      setError(e.message ?? "카테고리 저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteCategory(category: TicketCategory) {
    if (!confirm(`"${category.name}" 카테고리를 삭제하시겠습니까?`)) return;
    setDeletingId(category.id);
    setError(null);
    try {
      await api(`/ticket-categories/${category.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["contact-assignments"] });
      await qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      await refetchCategories();
      setExpandedId(null);
    } catch (e: any) {
      setError(e.message ?? "카테고리 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function createCategory() {
    if (!newCode.trim() || !newName.trim()) {
      setError("코드와 이름을 모두 입력해 주세요.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await api("/ticket-categories", {
        method: "POST",
        body: {
          code: newCode.trim(),
          name: newName.trim(),
          description: newDesc.trim() || null,
        },
      });
      setNewCode("");
      setNewName("");
      setNewDesc("");
      await qc.invalidateQueries({ queryKey: ["ticket-categories"] });
      await refetchCategories();
    } catch (e: any) {
      setError(e.message ?? "카테고리 추가에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="카테고리 관리"
        subtitle="카테고리 및 담당자를 관리할 수 있습니다."
        icon={<Tags className="w-7 h-7" />}
      />

      <ErrorDialog
        message={error ?? categoriesError}
        onClose={() => setError(null)}
      />

      <div
        className="rounded-2xl border p-4"
        style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
      >
        <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
          카테고리 추가
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-input)", color: "var(--text-primary)" }}
            placeholder="카테고리 코드"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            maxLength={50}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-input)", color: "var(--text-primary)" }}
            placeholder="카테고리 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-input)", color: "var(--text-primary)" }}
            placeholder="설명 (선택)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-primary-600)",
              color: "var(--text-inverse)",
            }}
            onClick={createCategory}
            disabled={creating}
          >
            {creating ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>

      {categoriesLoading ? (
        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          카테고리를 불러오는 중입니다...
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((category) => {
            const draft = drafts[category.id];
            const isOpen = expandedId === category.id;
            return (
              <div
                key={category.id}
                className="rounded-2xl border"
                style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
              >
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => setExpandedId(isOpen ? null : category.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      {category.name}
                    </span>
                    <span
                      className="text-xs rounded-full border px-2 py-0.5"
                      style={{ borderColor: "var(--border-default)", color: "var(--text-tertiary)" }}
                    >
                      {category.code}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {isOpen ? "접기" : "열기"}
                  </span>
                </button>

                {isOpen && (
                  <div
                    className="border-t px-4 py-4 space-y-4"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>
                          카테고리 이름
                        </div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-input)", color: "var(--text-primary)" }}
                          value={draft?.name ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [category.id]: {
                                ...(prev[category.id] ?? { name: "", description: "", empNos: [] }),
                                name: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>
                          설명
                        </div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-input)", color: "var(--text-primary)" }}
                          value={draft?.description ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [category.id]: {
                                ...(prev[category.id] ?? { name: "", description: "", empNos: [] }),
                                description: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>
                        담당자 지정
                      </div>
                      {adminOnly.length === 0 ? (
                        <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                          관리자 계정이 없습니다.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {adminOnly.map((u) => {
                            const label =
                              [u.kor_name, u.title, u.department].filter(Boolean).join(" / ") || u.emp_no;
                            const checked = (draft?.empNos ?? []).includes(u.emp_no);
                            return (
                              <label
                                key={`${category.id}-${u.emp_no}`}
                                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                                style={{
                                  borderColor: "var(--border-default)",
                                  backgroundColor: "var(--bg-input)",
                                  color: "var(--text-primary)",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleEmpNo(category.id, u.emp_no)}
                                />
                                <span>{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                        onClick={() => deleteCategory(category)}
                        disabled={deletingId === category.id}
                      >
                        {deletingId === category.id ? "삭제 중..." : "삭제"}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-4 py-2 text-sm disabled:opacity-60"
                        style={{
                          backgroundColor: "var(--color-primary-600)",
                          color: "var(--text-inverse)",
                        }}
                        onClick={() => saveCategory(category)}
                        disabled={savingId === category.id}
                      >
                        {savingId === category.id ? "저장 중..." : "저장"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
