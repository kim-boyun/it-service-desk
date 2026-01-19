"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Project = {
  id: number;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  created_by_emp_no: string;
  created_at: string;
};

type UserSummary = {
  emp_no: string;
  kor_name?: string | null;
  title?: string | null;
  department?: string | null;
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

function formatUser(user: UserSummary) {
  const parts = [user.kor_name, user.title, user.department].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return user.emp_no;
}

export default function ProjectPickerModal({ open, selectedId, onClose, onSelect }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<UserSummary[]>([]);
  const [members, setMembers] = useState<UserSummary[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", search],
    queryFn: () =>
      api<Project[]>(`/projects?mine=true${search.trim() ? `&query=${encodeURIComponent(search.trim())}` : ""}`),
    enabled: open,
  });

  const createProjectM = useMutation({
    mutationFn: () =>
      api<Project>("/projects", {
        method: "POST",
        body: {
          name: name.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          member_emp_nos: members.map((m) => m.emp_no),
        },
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setError(null);
      setShowCreate(false);
      setName("");
      setStartDate("");
      setEndDate("");
      setMembers([]);
      setMemberQuery("");
      setMemberResults([]);
      onSelect(created);
    },
    onError: (err: any) => {
      setError(err?.message ?? "프로젝트 생성에 실패했습니다.");
    },
  });

  useEffect(() => {
    if (!open || !showCreate) return;
    const q = memberQuery.trim();
    if (!q) {
      setMemberResults([]);
      return;
    }

    let active = true;
    const t = setTimeout(async () => {
      setMemberLoading(true);
      try {
        const results = await api<UserSummary[]>(`/users/search?query=${encodeURIComponent(q)}&limit=8`);
        if (active) setMemberResults(results);
      } finally {
        if (active) setMemberLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [memberQuery, open, showCreate]);

  const selectableMembers = useMemo(() => {
    const selectedEmpNos = new Set(members.map((m) => m.emp_no));
    return memberResults.filter((m) => !selectedEmpNos.has(m.emp_no));
  }, [memberResults, members]);

  function addMember(member: UserSummary) {
    setMembers((prev) => [...prev, member]);
    setMemberQuery("");
    setMemberResults([]);
  }

  function removeMember(empNo: string) {
    setMembers((prev) => prev.filter((m) => m.emp_no !== empNo));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm text-gray-500">프로젝트 선택</div>
            <div className="text-base font-semibold">내 프로젝트 목록</div>
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
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm bg-white hover:bg-gray-50"
              onClick={() => setShowCreate((prev) => !prev)}
            >
              {showCreate ? "목록 보기" : "새 프로젝트"}
            </button>
          </div>

          {showCreate && (
            <div className="rounded border bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">프로젝트명</label>
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 학사시스템 개선"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">시작</label>
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-600">종료</label>
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-600">프로젝트 참여자 추가</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="사번 또는 이름으로 검색"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
                {memberQuery.trim() && (
                  <div className="rounded border bg-white p-2 text-xs">
                    {memberLoading && <div className="text-gray-500">검색 중...</div>}
                    {!memberLoading && selectableMembers.length === 0 && (
                      <div className="text-gray-500">검색 결과가 없습니다.</div>
                    )}
                    {!memberLoading &&
                      selectableMembers.map((m) => (
                        <button
                          key={m.emp_no}
                          type="button"
                          className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-gray-50"
                          onClick={() => addMember(m)}
                        >
                          <span>{formatUser(m)}</span>
                          <span className="text-gray-400">{m.emp_no}</span>
                        </button>
                      ))}
                  </div>
                )}

                {members.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => (
                      <span key={m.emp_no} className="inline-flex items-center gap-1 rounded-full bg-white border px-2 py-1 text-xs">
                        {formatUser(m)}
                        <button type="button" className="text-gray-500 hover:text-gray-700" onClick={() => removeMember(m.emp_no)}>
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {error && <div className="text-xs text-red-600">{error}</div>}
              <button
                type="button"
                className="w-full rounded border bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
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
          )}

          <div className="rounded border divide-y max-h-64 overflow-auto">
            {isLoading && <div className="p-3 text-sm text-gray-500">프로젝트를 불러오는 중...</div>}
            {!isLoading && projects.length === 0 && (
              <div className="p-3 text-sm text-gray-500">등록된 프로젝트가 없습니다.</div>
            )}
            {!isLoading &&
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 transition ${
                    selectedId === p.id ? "bg-emerald-50 border-l-4 border-emerald-400" : "hover:bg-gray-50"
                  }`}
                  onClick={() => onSelect(p)}
                >
                  <div className="text-sm font-medium text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-500">{formatPeriod(p)}</div>
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
