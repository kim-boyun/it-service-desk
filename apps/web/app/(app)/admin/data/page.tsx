"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTicketCategories } from "@/lib/use-ticket-categories";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { Download, BarChart3, ArrowLeft, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import {
  COLUMN_DEFS,
  getValue,
  dayOfYear,
  escapeCsvCell,
  loadPresetsFromStorage,
  savePresetsToStorage,
  STATUS_LABELS,
  type Ticket,
  type FilterRule,
  type DataExtractPreset,
} from "./data-extract-types";
import Pagination from "@/components/Pagination";
import { PresetBar } from "./PresetBar";
import { FilterBuilder } from "./FilterBuilder";
import { ColumnConfig } from "./ColumnConfig";

const defaultColumnOrder = COLUMN_DEFS.map((c) => c.key);

function applyFilters(
  tickets: Ticket[],
  opts: {
    createdYearInclude: string[];
    createdDayRangePercent: [number, number];
    filterRules: FilterRule[];
    categoryMap: Record<number, string>;
  }
): Ticket[] {
  const { createdYearInclude, createdDayRangePercent, filterRules, categoryMap } = opts;
  const [startPct, endPct] = createdDayRangePercent;
  const startDay = Math.round(1 + (365 * startPct) / 100);
  const endDay = Math.round(1 + (365 * endPct) / 100);

  return tickets.filter((t) => {
    if (t.created_at) {
      const d = new Date(t.created_at);
      if (!Number.isNaN(d.getTime())) {
        if (createdYearInclude.length > 0 && !createdYearInclude.includes(String(d.getFullYear())))
          return false;
        const doy = dayOfYear(d);
        if (doy < startDay || doy > endDay) return false;
      }
    } else {
      if (createdYearInclude.length > 0) return false;
      if (startDay > 1 || endDay < 366) return false;
    }

    for (const rule of filterRules) {
      const val = getValue(t, rule.field, { categoryMap }) || "-";
      if (rule.mode === "include_only") {
        if (rule.values.length > 0 && !rule.values.includes(val)) return false;
      } else {
        if (rule.values.includes(val)) return false;
      }
    }
    return true;
  });
}

export default function AdminDataPage() {
  const { map: categoryMap = {} } = useTicketCategories();
  const [presets, setPresets] = useState<DataExtractPreset[]>([]);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);
  const [createdYearInclude, setCreatedYearInclude] = useState<string[]>([]);
  const [createdDayRangePercent, setCreatedDayRangePercent] = useState<[number, number]>([0, 100]);
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(() => new Set(defaultColumnOrder));
  const [columnOrder, setColumnOrder] = useState<string[]>(() => defaultColumnOrder);
  const tablePageSize = 20;
  const [tablePage, setTablePage] = useState(1);

  useEffect(() => {
    setPresets(loadPresetsFromStorage());
  }, []);

  const { data: tickets = [], isLoading, error } = useQuery({
    queryKey: ["tickets", "all", 1000],
    queryFn: () => api<Ticket[]>("/tickets?scope=all&limit=1000"),
  });

  const distinctValues = useMemo(() => {
    const dv: Record<string, string[]> = {};
    const statusSet = new Set<string>();
    const workTypeSet = new Set<string>();
    const projectSet = new Set<string>();
    const categorySet = new Set<string>();
    const requesterTitleSet = new Set<string>();
    const requesterDeptSet = new Set<string>();
    const assigneeSet = new Set<string>();
    const yearSet = new Set<number>();

    for (const t of tickets) {
      if (t.status) statusSet.add(STATUS_LABELS[t.status] ?? t.status);
      const wt = t.work_type || "-";
      workTypeSet.add(wt);
      const pn = t.project_name || "-";
      projectSet.add(pn);
      categorySet.add(getValue(t, "category_display", { categoryMap }));
      const rt = t.requester?.title ?? "-";
      requesterTitleSet.add(rt);
      const rd = t.requester?.department ?? "-";
      requesterDeptSet.add(rd);
      assigneeSet.add(getValue(t, "assignee_display"));
      if (t.created_at) {
        const d = new Date(t.created_at);
        if (!Number.isNaN(d.getTime())) yearSet.add(d.getFullYear());
      }
    }

    dv.status = Array.from(statusSet).sort((a, b) => (a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b)));
    dv.work_type = Array.from(workTypeSet).sort((a, b) => (a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b)));
    dv.project_name = Array.from(projectSet).sort((a, b) => (a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b)));
    dv.category_display = Array.from(categorySet).filter((x) => x !== "-").sort((a, b) => a.localeCompare(b));
    dv.requester_title = Array.from(requesterTitleSet).sort((a, b) => (a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b)));
    dv.requester_department = Array.from(requesterDeptSet).sort((a, b) => (a === "-" ? 1 : b === "-" ? -1 : a.localeCompare(b)));
    dv.assignee_display = Array.from(assigneeSet).filter((x) => x !== "-").sort();
    dv.created_at_year = Array.from(yearSet).sort((a, b) => a - b).map(String);
    return dv;
  }, [tickets, categoryMap]);

  const filteredTickets = useMemo(
    () =>
      applyFilters(tickets, {
        createdYearInclude,
        createdDayRangePercent,
        filterRules,
        categoryMap,
      }),
    [tickets, createdYearInclude, createdDayRangePercent, filterRules, categoryMap]
  );

  const tableTotal = filteredTickets.length;
  const tablePageCount = Math.max(1, Math.ceil(tableTotal / tablePageSize));
  const tablePageSafe = Math.min(tablePageCount, Math.max(1, tablePage));
  const tablePageItems = useMemo(
    () => filteredTickets.slice((tablePageSafe - 1) * tablePageSize, tablePageSafe * tablePageSize),
    [filteredTickets, tablePageSafe, tablePageSize]
  );

  useEffect(() => {
    if (tablePage > tablePageCount && tablePageCount >= 1) setTablePage(1);
  }, [tablePageCount, tablePage]);

  const visibleColDefs = useMemo(() => {
    const order = columnOrder.length ? columnOrder : defaultColumnOrder;
    return order
      .filter((k) => selectedColumns.has(k))
      .map((k) => COLUMN_DEFS.find((c) => c.key === k))
      .filter((c): c is (typeof COLUMN_DEFS)[number] => !!c);
  }, [columnOrder, selectedColumns]);

  const saveCurrentPreset = useCallback(
    (name: string) => {
      const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preset: DataExtractPreset = {
        id,
        name: name.trim() || "저장된 설정",
        createdAt: new Date().toISOString(),
        createdYearInclude,
        createdDayRangePercent,
        filterRules,
        selectedColumns: Array.from(selectedColumns),
        columnOrder: columnOrder.length ? columnOrder : defaultColumnOrder,
      };
      setPresets((prev) => [...prev, preset]);
      savePresetsToStorage([...presets, preset]);
      setCurrentPresetId(id);
    },
    [
      createdYearInclude,
      createdDayRangePercent,
      filterRules,
      selectedColumns,
      columnOrder,
      presets,
    ]
  );

  const handleExportCsv = () => {
    const cols = visibleColDefs;
    const headers = cols.map((c) => c.label);
    const rows = filteredTickets.map((t) =>
      cols.map((c) => escapeCsvCell(getValue(t, c.key, { categoryMap }))).join(",")
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

  const handleExportXlsx = () => {
    const cols = visibleColDefs;
    const headers = cols.map((c) => c.label);
    const rows = filteredTickets.map((t) =>
      cols.map((c) => getValue(t, c.key, { categoryMap }))
    );
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "티켓");
    XLSX.writeFile(wb, `it-desk-tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const primaryBtnStyle = {
    background: "linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%)",
  };
  const secondaryBtnStyle = {
    borderColor: "var(--border-default)",
    backgroundColor: "var(--bg-card)",
    color: "var(--text-secondary)",
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      <PageHeader
        title="데이터 추출"
        subtitle="티켓 메타정보를 확인하고 엑셀(CSV)로 다운로드할 수 있습니다"
        icon={<BarChart3 className="h-7 w-7" strokeWidth={2} />}
      />

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={secondaryBtnStyle}
        >
          <ArrowLeft className="h-4 w-4" />
          대시보드로
        </Link>
      </div>

      {/* 상단 프리셋 바 */}
      <PresetBar
        presets={presets}
        currentPresetId={currentPresetId}
        onSelectPreset={(id) => {
          setCurrentPresetId(id);
          if (id) {
            const p = presets.find((x) => x.id === id);
            if (p) {
              setCreatedYearInclude(p.createdYearInclude ?? []);
              setCreatedDayRangePercent(p.createdDayRangePercent ?? [0, 100]);
              setFilterRules(p.filterRules ?? []);
              setSelectedColumns(new Set(p.selectedColumns ?? defaultColumnOrder));
              setColumnOrder(p.columnOrder?.length ? p.columnOrder : defaultColumnOrder);
            }
          }
        }}
        onSaveCurrent={saveCurrentPreset}
      />

      {/* 2컬럼: 필터 설정(높이 자동 증가, 스크롤 없음) / 출력 열 구성(필터와 동일 높이, 스크롤 가능) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <div className="min-w-0 min-h-[280px] overflow-x-hidden rounded-lg border flex flex-col" style={{ borderColor: "var(--border-default)" }}>
          <FilterBuilder
            className="min-h-[280px] flex-1"
            createdYearInclude={createdYearInclude}
            setCreatedYearInclude={setCreatedYearInclude}
            createdDayRangePercent={createdDayRangePercent}
            setCreatedDayRangePercent={setCreatedDayRangePercent}
            filterRules={filterRules}
            setFilterRules={setFilterRules}
            distinctValues={distinctValues}
          />
        </div>
        <div className="min-w-0 min-h-[280px] overflow-y-auto rounded-lg border flex flex-col" style={{ borderColor: "var(--border-default)" }}>
          <ColumnConfig
            className="min-h-full"
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            selectedColumns={selectedColumns}
            setSelectedColumns={setSelectedColumns}
          />
        </div>
      </div>

      {/* 하단 액션 & 미리보기 */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-card)",
        }}
      >
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Total: <strong style={{ color: "var(--text-primary)" }}>{filteredTickets.length}</strong>건
          {filteredTickets.length !== tickets.length && ` (전체 ${tickets.length}건 중 필터 적용)`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleColDefs.length === 0 || filteredTickets.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={primaryBtnStyle}
          >
            <Download className="h-4 w-4" />
            CSV 다운로드
          </button>
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={visibleColDefs.length === 0 || filteredTickets.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
            style={{
              ...secondaryBtnStyle,
              borderColor: "var(--color-primary-500)",
              color: "var(--color-primary-600)",
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            XLSX 다운로드
          </button>
        </div>
      </div>

      {/* 테이블 미리보기: 20개씩, 이전/다음 페이지 */}
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
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-default)", backgroundColor: "var(--bg-elevated)" }}>
                    {visibleColDefs.map((c) => (
                      <th key={c.key} className="px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={visibleColDefs.length} className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>
                        {tickets.length === 0 ? "티켓 데이터가 없습니다." : "조건에 맞는 티켓이 없습니다. 필터를 조정해 보세요."}
                      </td>
                    </tr>
                  )}
                  {tablePageItems.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                      {visibleColDefs.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 max-w-[200px] truncate" style={{ color: "var(--text-primary)" }}>
                          {getValue(t, c.key, { categoryMap })}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredTickets.length > 0 && (
              <div
                className="flex flex-wrap items-center justify-end gap-4 px-4 py-3 border-t"
                style={{ borderColor: "var(--border-default)" }}
              >
                <Pagination
                  page={tablePageSafe}
                  total={tableTotal}
                  pageSize={tablePageSize}
                  onChange={(p) => setTablePage(p)}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
