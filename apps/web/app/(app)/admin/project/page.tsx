"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";
import PageHeader from "@/components/PageHeader";
import { Folder, ChevronDown, ChevronRight, Pencil } from "lucide-react";

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  created_by_emp_no: string;
  created_at: string;
  sort_order: number;
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isPastProject(p: Project): boolean {
  if (!p.end_date) return false;
  return new Date(p.end_date) < startOfToday();
}

export default function AdminProjectPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; start_date: string; end_date: string } | null>(null);
  const [pastOpen, setPastOpen] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-admin"],
    queryFn: () => api<Project[]>("/projects?mine=false"),
  });

  const activeProjects = useMemo(
    () => projects.filter((p) => !isPastProject(p)),
    [projects]
  );
  const pastProjects = useMemo(
    () => projects.filter((p) => isPastProject(p)),
    [projects]
  );

  useEffect(() => {
    setLocalProjects(activeProjects);
  }, [activeProjects]);

  const reorderProjectsM = useMutation({
    mutationFn: (orderedIds: number[]) =>
      api("/projects/reorder", {
        method: "POST",
        body: { project_ids: orderedIds },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-admin"] });
    },
  });

  function handleDragStart(id: number) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, overId: number) {
    e.preventDefault();
    if (draggingId === null || draggingId === overId) return;
    setLocalProjects((prev) => {
      const currentIndex = prev.findIndex((p) => p.id === draggingId);
      const overIndex = prev.findIndex((p) => p.id === overId);
      if (currentIndex === -1 || overIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
  }

  function handleDrop() {
    if (draggingId === null) return;
    setDraggingId(null);
    if (localProjects.length === 0) return;
    reorderProjectsM.mutate(localProjects.map((p) => p.id));
  }

  const createProjectM = useMutation({
    mutationFn: () =>
      api<Project>("/projects", {
        method: "POST",
        body: {
          name: name.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-admin"] });
      setError(null);
      setName("");
      setStartDate("");
      setEndDate("");
    },
    onError: (err: any) => {
      setError(err?.message ?? "프로젝트 생성에 실패했습니다.");
    },
  });

  const updateProjectM = useMutation({
    mutationFn: ({
      id,
      name,
      start_date,
      end_date,
    }: {
      id: number;
      name: string;
      start_date: string;
      end_date: string;
    }) =>
      api<Project>(`/projects/${id}`, {
        method: "PATCH",
        body: {
          name: name.trim() || undefined,
          start_date: start_date || null,
          end_date: end_date || null,
        },
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditForm(null);
      qc.invalidateQueries({ queryKey: ["projects-admin"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "프로젝트 수정에 실패했습니다.");
    },
  });

  const deleteProjectM = useMutation({
    mutationFn: (projectId: number) =>
      api(`/projects/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditForm(null);
      qc.invalidateQueries({ queryKey: ["projects-admin"] });
    },
  });

  function openEdit(p: Project) {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
    });
    setError(null);
  }

  function saveEdit() {
    if (!editingId || !editForm) return;
    if (!editForm.name.trim()) {
      setError("프로젝트명을 입력하세요.");
      return;
    }
    updateProjectM.mutate({
      id: editingId,
      name: editForm.name,
      start_date: editForm.start_date,
      end_date: editForm.end_date,
    });
  }

  if (me.role !== "admin") {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div
          className="rounded-xl border p-6 text-sm shadow-sm"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-secondary)",
          }}
        >
          관리자만 접근할 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="프로젝트 관리"
        subtitle="프로젝트 이름과 기간을 입력해 생성할 수 있습니다."
        icon={<Folder className="w-7 h-7" />}
      />

      <div
        className="rounded-xl border p-6 shadow-sm space-y-4"
        style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
      >
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          프로젝트 생성
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
              프로젝트명
            </label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2026 IT 서비스 개선"
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
              시작일
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
              종료일
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-input)",
                color: "var(--text-primary)",
              }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-lg border px-4 py-2 text-sm font-semibold"
              style={{
                borderColor: "var(--color-primary-600)",
                backgroundColor: "var(--color-primary-600)",
                color: "var(--text-inverse)",
              }}
              onClick={() => {
                setError(null);
                if (!name.trim()) {
                  setError("프로젝트명을 입력하세요.");
                  return;
                }
                createProjectM.mutate();
              }}
              disabled={createProjectM.isPending}
            >
              {createProjectM.isPending ? "생성 중..." : "프로젝트 생성"}
            </button>
          </div>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div
        className="rounded-xl border shadow-sm overflow-hidden"
        style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-card)" }}
      >
        <div
          className="border-b px-4 py-3 text-sm font-semibold"
          style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
        >
          프로젝트 목록
        </div>
        {isLoading && (
          <div className="p-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
            불러오는 중...
          </div>
        )}
        {!isLoading && localProjects.length === 0 && pastProjects.length === 0 && (
          <div className="p-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
            등록된 프로젝트가 없습니다.
          </div>
        )}
        {!isLoading && localProjects.length > 0 && (
          <div className="divide-y" style={{ borderColor: "var(--border-default)" }}>
            {localProjects.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-move"
                draggable
                onDragStart={() => handleDragStart(p.id)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDrop={handleDrop}
              >
                {editingId === p.id && editForm ? (
                  <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        프로젝트명
                      </label>
                      <input
                        className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-input)",
                          color: "var(--text-primary)",
                        }}
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                      />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        시작일
                      </label>
                      <input
                        type="date"
                        className="mt-0.5 rounded border px-2 py-1.5 text-sm"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-input)",
                          color: "var(--text-primary)",
                        }}
                        value={editForm.start_date}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                      />
                    </div>
                    <div>
                      <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        종료일
                      </label>
                      <input
                        type="date"
                        className="mt-0.5 rounded border px-2 py-1.5 text-sm"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-input)",
                          color: "var(--text-primary)",
                        }}
                        value={editForm.end_date}
                        onChange={(e) => setEditForm((f) => (f ? { ...f, end_date: e.target.value } : f))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: "var(--color-primary-600)",
                          backgroundColor: "var(--color-primary-600)",
                          color: "var(--text-inverse)",
                        }}
                        onClick={saveEdit}
                        disabled={updateProjectM.isPending}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-primary)",
                        }}
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                          setError(null);
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {p.name}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {p.start_date ?? "-"} ~ {p.end_date ?? "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
                        style={{
                          borderColor: "var(--border-default)",
                          backgroundColor: "var(--bg-hover)",
                          color: "var(--text-primary)",
                        }}
                        onClick={() => openEdit(p)}
                        disabled={!!editingId}
                      >
                        <Pencil className="w-3 h-3" />
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600"
                        onClick={() => {
                          if (!confirm("해당 프로젝트를 삭제하시겠습니까?")) return;
                          deleteProjectM.mutate(p.id);
                        }}
                        disabled={deleteProjectM.isPending}
                      >
                        삭제
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!isLoading && pastProjects.length > 0 && (
          <div className="border-t" style={{ borderColor: "var(--border-default)" }}>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold transition-colors"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setPastOpen((o) => !o)}
            >
              <span>지난 프로젝트</span>
              {pastOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />
              )}
            </button>
            {pastOpen && (
              <div
                className="divide-y border-t"
                style={{ borderColor: "var(--border-default)" }}
              >
                {pastProjects.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    style={{ backgroundColor: "var(--bg-subtle)" }}
                  >
                    {editingId === p.id && editForm ? (
                      <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            프로젝트명
                          </label>
                          <input
                            className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm"
                            style={{
                              borderColor: "var(--border-default)",
                              backgroundColor: "var(--bg-input)",
                              color: "var(--text-primary)",
                            }}
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                          />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            시작일
                          </label>
                          <input
                            type="date"
                            className="mt-0.5 rounded border px-2 py-1.5 text-sm"
                            style={{
                              borderColor: "var(--border-default)",
                              backgroundColor: "var(--bg-input)",
                              color: "var(--text-primary)",
                            }}
                            value={editForm.start_date}
                            onChange={(e) => setEditForm((f) => (f ? { ...f, start_date: e.target.value } : f))}
                          />
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            종료일
                          </label>
                          <input
                            type="date"
                            className="mt-0.5 rounded border px-2 py-1.5 text-sm"
                            style={{
                              borderColor: "var(--border-default)",
                              backgroundColor: "var(--bg-input)",
                              color: "var(--text-primary)",
                            }}
                            value={editForm.end_date}
                            onChange={(e) => setEditForm((f) => (f ? { ...f, end_date: e.target.value } : f))}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                            style={{
                              borderColor: "var(--color-primary-600)",
                              backgroundColor: "var(--color-primary-600)",
                              color: "var(--text-inverse)",
                            }}
                            onClick={saveEdit}
                            disabled={updateProjectM.isPending}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                            style={{
                              borderColor: "var(--border-default)",
                              backgroundColor: "var(--bg-elevated)",
                              color: "var(--text-primary)",
                            }}
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                              setError(null);
                            }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            {p.name}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                            {p.start_date ?? "-"} ~ {p.end_date ?? "-"}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-lg border px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
                            style={{
                              borderColor: "var(--border-default)",
                              backgroundColor: "var(--bg-hover)",
                              color: "var(--text-primary)",
                            }}
                            onClick={() => openEdit(p)}
                            disabled={!!editingId}
                          >
                            <Pencil className="w-3 h-3" />
                            수정
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600"
                            onClick={() => {
                              if (!confirm("해당 프로젝트를 삭제하시겠습니까?")) return;
                              deleteProjectM.mutate(p.id);
                            }}
                            disabled={deleteProjectM.isPending}
                          >
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
