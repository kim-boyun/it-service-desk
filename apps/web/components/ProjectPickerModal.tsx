"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  created_by_emp_no: string;
  created_at: string;
};

type Props = {
  open: boolean;
  selectedId: number | null;
  onClose: () => void;
  onSelect: (project: Project) => void;
};

function formatPeriod(project: Project) {
  if (!project.start_date && !project.end_date) return "기간 미정";
  return `${project.start_date ?? "-"} ~ ${project.end_date ?? "-"}`;
}

function isProjectActive(project: Project) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (project.start_date) {
    const start = new Date(`${project.start_date}T00:00:00`);
    if (today < start) return false;
  }
  if (project.end_date) {
    const end = new Date(`${project.end_date}T23:59:59`);
    if (today > end) return false;
  }
  return true;
}

export default function ProjectPickerModal({ open, selectedId, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", search],
    queryFn: () =>
      api<Project[]>(
        `/projects?mine=false${search.trim() ? `&query=${encodeURIComponent(search.trim())}` : ""}`,
      ),
    enabled: open,
  });

  const visibleProjects = useMemo(() => projects.filter(isProjectActive), [projects]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm text-gray-500">프로젝트 선택</div>
            <div className="text-base font-semibold">진행 중인 프로젝트 목록</div>
          </div>
          <button type="button" className="text-sm text-gray-600 hover:underline" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="flex-1 min-w-[200px] border rounded px-3 py-2 text-sm"
              placeholder="프로젝트 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="rounded border divide-y max-h-64 overflow-auto">
            {isLoading && <div className="p-3 text-sm text-gray-500">프로젝트를 불러오는 중...</div>}
            {!isLoading && visibleProjects.length === 0 && (
              <div className="p-3 text-sm text-gray-500">등록된 프로젝트가 없습니다.</div>
            )}
            {!isLoading &&
              visibleProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 transition ${
                    selectedId === p.id ? "bg-emerald-50 border-l-4 border-emerald-400" : "hover:bg-gray-50"
                  }`}
                  onClick={() => onSelect(p)}
                >
                  <div className="text-sm font-medium text-gray-900">[프로젝트] {p.name}</div>
                  <div className="text-xs text-gray-500">{formatPeriod(p)}</div>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
