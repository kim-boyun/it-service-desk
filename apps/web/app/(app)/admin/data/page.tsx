"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { Download, BarChart3, ArrowLeft, Columns } from "lucide-react";

type Ticket = {
  id: number;
  title: string;
  status: string;
  priority: string;
  work_type?: string | null;
  category_id?: number | null;
  category_ids?: number[];
  project_id?: number | null;
  project_name?: string | null;
  requester_emp_no: string;
  assignee_emp_no?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  requester?: { kor_name?: string | null; title?: string | null; department?: string | null } | null;
  assignee?: { kor_name?: string | null } | null;
  assignees?: { kor_name?: string | null }[] | null;
};

const COLUMN_OPTIONS: { key: keyof Ticket | string; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "title", label: "제목" },
  { key: "status", label: "상태" },
  { key: "priority", label: "우선순위" },
  { key: "work_type", label: "작업유형" },
  { key: "project_name", label: "프로젝트" },
  { key: "requester_display", label: "요청자" },
  { key: "assignee_display", label: "담당자" },
  { key: "created_at", label: "생성일시" },
  { key: "updated_at", label: "수정일시" },
];

function getValue(t: Ticket, key: string): string {
  if (key === "requester_display") {
    const r = t.requester;
    if (!r) return t.requester_emp_no;
    const parts = [r.kor_name, r.title, r.department].filter(Boolean);
    return parts.length ? parts.join(" / ") : t.requester_emp_no;
  }
  if (key === "assignee_display") {
    const list = t.assignees ?? (t.assignee ? [t.assignee] : []);
    const names = list.map((a) => a?.kor_name).filter(Boolean);
    return names.length ? names.join(", ") : t.assignee_emp_no ?? "-";
  }
  const v = (t as Record<string, unknown>)[key];
  if (v == null) return "-";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function escapeCsvCell(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default function AdminDataPage() {
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(["id", "title", "status", "priority", "created_at"])
  );
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const { data: tickets = [], isLoading, error } = useQuery({
    queryKey: ["tickets", "all", 1000, statusFilter],
    queryFn: () =>
      api<Ticket[]>(
        `/tickets?scope=all&limit=1000${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`
      ),
  });

  const filteredTickets = useMemo(() => {
    return tickets;
  }, [tickets]);

  const visibleColumns = useMemo(
    () => COLUMN_OPTIONS.filter((c) => selectedColumns.has(c.key)),
    [selectedColumns]
  );

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCsv = () => {
    const headers = visibleColumns.map((c) => c.label);
    const rows = filteredTickets.map((t) =>
      visibleColumns.map((c) => escapeCsvCell(getValue(t, c.key))).join(",")
    );
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `it-desk-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="데이터 추출"
        subtitle="티켓 메타정보를 확인하고 엑셀(CSV)로 다운로드할 수 있습니다"
        icon={<BarChart3 className="h-7 w-7" strokeWidth={2} />}
      />

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-secondary)",
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          대시보드로
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowColumnPicker((p) => !p)}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: showColumnPicker ? "var(--bg-selected)" : "var(--bg-card)",
              color: "var(--text-primary)",
            }}
          >
            <Columns className="h-4 w-4" />
            컬럼 선택
          </button>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{
              borderColor: "var(--border-default)",
              backgroundColor: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
          >
            <option value="">전체 상태</option>
            <option value="open">접수</option>
            <option value="in_progress">진행</option>
            <option value="resolved">완료</option>
            <option value="closed">사업 검토</option>
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleColumns.length === 0 || filteredTickets.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
            }}
          >
            <Download className="h-4 w-4" />
            CSV 다운로드
          </button>
        </div>
      </div>

      {showColumnPicker && (
        <Card padding="md">
          <div className="flex flex-wrap gap-3">
            {COLUMN_OPTIONS.map((c) => (
              <label
                key={c.key}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: selectedColumns.has(c.key) ? "var(--color-primary-500)" : "var(--border-default)",
                  backgroundColor: selectedColumns.has(c.key) ? "var(--bg-selected)" : "var(--bg-card)",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.has(c.key)}
                  onChange={() => toggleColumn(c.key)}
                  className="rounded"
                />
                <span style={{ color: "var(--text-primary)" }}>{c.label}</span>
              </label>
            ))}
          </div>
        </Card>
      )}

      <Card padding="none">
        {isLoading && (
          <div className="py-12 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            로딩 중...
          </div>
        )}
        {error && (
          <div className="py-12 text-center text-sm" style={{ color: "var(--color-danger-600)" }}>
            데이터를 불러오지 못했습니다.
          </div>
        )}
        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-default)", backgroundColor: "var(--bg-elevated)" }}>
                  {visibleColumns.map((c) => (
                    <th
                      key={c.key}
                      className="px-4 py-3 font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTickets.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length} className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
                {filteredTickets.map((t) => (
                  <tr
                    key={t.id}
                    style={{ borderBottom: "1px solid var(--border-default)" }}
                  >
                    {visibleColumns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 max-w-[200px] truncate" style={{ color: "var(--text-primary)" }}>
                        {getValue(t, c.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
