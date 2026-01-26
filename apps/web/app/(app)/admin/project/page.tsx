"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth-context";

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  created_by_emp_no: string;
  created_at: string;
};

export default function AdminProjectPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-admin"],
    queryFn: () => api<Project[]>("/projects?mine=false"),
  });

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

  const deleteProjectM = useMutation({
    mutationFn: (projectId: number) =>
      api(`/projects/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-admin"] });
    },
  });

  if (me.role !== "admin") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          관리자만 접근할 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">프로젝트 관리</h1>
        <p className="mt-1 text-sm text-slate-600">프로젝트 이름과 기간만 입력해 생성할 수 있습니다.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="text-sm font-semibold text-slate-900">프로젝트 생성</div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label className="text-xs text-slate-600">프로젝트명</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 2026 IT 서비스 개선"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">시작일</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">종료일</label>
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
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

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
          프로젝트 목록
        </div>
        {isLoading && <div className="p-4 text-sm text-slate-500">불러오는 중...</div>}
        {!isLoading && projects.length === 0 && (
          <div className="p-4 text-sm text-slate-500">등록된 프로젝트가 없습니다.</div>
        )}
        {!isLoading && projects.length > 0 && (
          <div className="divide-y divide-slate-200">
            {projects.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">[프로젝트] {p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.start_date ?? "-"} ~ {p.end_date ?? "-"}
                  </div>
                </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
