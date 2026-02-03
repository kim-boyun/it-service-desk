"use client";

import { useState, useEffect } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui";
import { DateRangeBar } from "./DateRangeBar";
import {
  FILTERABLE_FIELDS,
  COLUMN_DEFS,
  getDisplayLabel,
  formatDayOfYearPercent,
  parseMonthDayOrDayOfYear,
  dayOfYearToPercent,
  type FilterRule,
} from "./data-extract-types";

const fieldLabels: Record<string, string> = {};
COLUMN_DEFS.filter((c) => c.hasDataFilter === true).forEach((c) => {
  fieldLabels[c.key] = c.label;
});

function FilterRuleRow({
  rule,
  distinctValues,
  onUpdate,
  onRemove,
}: {
  rule: FilterRule;
  distinctValues: Record<string, string[]>;
  onUpdate: (rule: FilterRule) => void;
  onRemove: () => void;
}) {
  const [valueDropdownOpen, setValueDropdownOpen] = useState(false);
  const options = distinctValues[rule.field] ?? [];
  const selectedSet = new Set(rule.values);

  const toggleValue = (v: string) => {
    const next = new Set(rule.values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onUpdate({ ...rule, values: Array.from(next) });
  };

  return (
    <div
      className="flex flex-wrap items-start gap-2 py-2 border-b last:border-b-0"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <select
        value={rule.field}
        onChange={(e) => onUpdate({ ...rule, field: e.target.value, values: [] })}
        className="rounded-lg border px-2 py-1.5 text-sm shrink-0"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-card)",
          color: "var(--text-primary)",
          minWidth: "120px",
        }}
      >
        {FILTERABLE_FIELDS.map((key) => (
          <option key={key} value={key}>
            {fieldLabels[key] ?? key}
          </option>
        ))}
      </select>
      <select
        value={rule.mode}
        onChange={(e) => onUpdate({ ...rule, mode: e.target.value as "include_only" | "exclude" })}
        className="rounded-lg border px-2 py-1.5 text-sm shrink-0"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-card)",
          color: "var(--text-primary)",
          minWidth: "110px",
        }}
      >
        <option value="include_only">포함할 값만</option>
        <option value="exclude">제외할 값만</option>
      </select>
      <div className="relative flex-1 min-w-[140px]">
        <button
          type="button"
          onClick={() => setValueDropdownOpen((o) => !o)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm text-left flex items-center justify-between gap-1"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
          }}
        >
          <span>
            {rule.values.length === 0
              ? "값 선택"
              : `${rule.values.length}개 선택`}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${valueDropdownOpen ? "rotate-180" : ""}`} />
        </button>
        {valueDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              aria-hidden
              onClick={() => setValueDropdownOpen(false)}
            />
            <div
              className="absolute left-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border py-1 shadow-lg min-w-[180px]"
              style={{
                borderColor: "var(--border-default)",
                backgroundColor: "var(--bg-card)",
              }}
            >
              {options.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  데이터 없음
                </div>
              ) : (
                options.map((v) => {
                  const label = getDisplayLabel(rule.field, v);
                  const checked = selectedSet.has(v);
                  return (
                    <label
                      key={v}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--bg-subtle)]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(v)}
                        className="rounded"
                      />
                      {label}
                    </label>
                  );
                })
              )}
            </div>
          </>
        )}
        {rule.values.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {rule.values.slice(0, 5).map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs"
                style={{
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                {getDisplayLabel(rule.field, v)}
              </span>
            ))}
            {rule.values.length > 5 && (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                +{rule.values.length - 5}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded border shrink-0"
        style={{
          borderColor: "var(--border-default)",
          color: "var(--text-tertiary)",
          backgroundColor: "var(--bg-card)",
        }}
        aria-label="조건 제거"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function FilterBuilder({
  createdYearInclude,
  setCreatedYearInclude,
  createdDayRangePercent,
  setCreatedDayRangePercent,
  filterRules,
  setFilterRules,
  distinctValues,
  className,
}: {
  createdYearInclude: string[];
  setCreatedYearInclude: (v: string[]) => void;
  createdDayRangePercent: [number, number];
  setCreatedDayRangePercent: (v: [number, number]) => void;
  filterRules: FilterRule[];
  setFilterRules: (v: FilterRule[] | ((prev: FilterRule[]) => FilterRule[])) => void;
  distinctValues: Record<string, string[]>;
  className?: string;
}) {
  const yearOptions = distinctValues.created_at_year ?? [];
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");

  useEffect(() => {
    setStartInput(formatDayOfYearPercent(createdDayRangePercent[0]));
    setEndInput(formatDayOfYearPercent(createdDayRangePercent[1]));
  }, [createdDayRangePercent[0], createdDayRangePercent[1]]);

  const commitStart = (raw: string) => {
    const v = parseMonthDayOrDayOfYear(raw);
    if (v != null) {
      const pct = dayOfYearToPercent(v);
      setCreatedDayRangePercent([Math.min(pct, createdDayRangePercent[1]), createdDayRangePercent[1]]);
      setStartInput(formatDayOfYearPercent(dayOfYearToPercent(v)));
    } else {
      setStartInput(formatDayOfYearPercent(createdDayRangePercent[0]));
    }
  };
  const commitEnd = (raw: string) => {
    const v = parseMonthDayOrDayOfYear(raw);
    if (v != null) {
      const pct = dayOfYearToPercent(v);
      setCreatedDayRangePercent([createdDayRangePercent[0], Math.max(pct, createdDayRangePercent[0])]);
      setEndInput(formatDayOfYearPercent(dayOfYearToPercent(v)));
    } else {
      setEndInput(formatDayOfYearPercent(createdDayRangePercent[1]));
    }
  };

  const toggleYear = (yearStr: string) => {
    const set = new Set(createdYearInclude);
    if (set.has(yearStr)) set.delete(yearStr);
    else set.add(yearStr);
    setCreatedYearInclude(Array.from(set));
  };

  const addRule = () => {
    const id = `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setFilterRules((prev) => [
      ...prev,
      { id, field: FILTERABLE_FIELDS[0] ?? "status", mode: "include_only", values: [] },
    ]);
  };

  const updateRule = (index: number, rule: FilterRule) => {
    setFilterRules((prev) => {
      const next = [...prev];
      next[index] = rule;
      return next;
    });
  };

  const removeRule = (index: number) => {
    setFilterRules((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card padding="lg" className={`flex flex-col ${className ?? ""}`}>
      <h3
        className="text-sm font-semibold mb-3 pb-2 border-b shrink-0"
        style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
      >
        필터 설정
      </h3>

      <div>
      {/* 작성일시: 기본 필터 */}
        <div className="mb-4">
        <div className="text-xs font-medium mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          작성일시 (기본 필터)
        </div>
        <div className="mb-2">
          <div className="text-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            년도 (체크한 연도만 포함, 비워두면 전체)
          </div>
          <div className="flex flex-wrap gap-2">
            {yearOptions.map((yearStr) => {
              const checked = createdYearInclude.includes(yearStr);
              return (
                <label
                  key={yearStr}
                  className="inline-flex items-center gap-1.5 cursor-pointer text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleYear(yearStr)}
                    className="rounded"
                  />
                  {yearStr}년
                </label>
              );
            })}
            {yearOptions.length === 0 && (
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                데이터 없음
              </span>
            )}
          </div>
        </div>
        <div className="max-w-md">
          <div className="text-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            월·일 범위 (바 드래그 또는 직접 입력: M/d, M-d, 1~366)
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <label className="flex items-center gap-2 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>시작</span>
              <input
                type="text"
                className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-input)",
                  color: "var(--text-primary)",
                }}
                placeholder="1/1 또는 1~366"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={(e) => commitStart(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitStart((e.target as HTMLInputElement).value)}
              />
            </label>
            <span style={{ color: "var(--text-tertiary)" }}>~</span>
            <label className="flex items-center gap-2 text-sm">
              <span style={{ color: "var(--text-secondary)" }}>종료</span>
              <input
                type="text"
                className="w-24 rounded-lg border px-2 py-1.5 text-sm"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-input)",
                  color: "var(--text-primary)",
                }}
                placeholder="12/31 또는 1~366"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                onBlur={(e) => commitEnd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitEnd((e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
          <DateRangeBar value={createdDayRangePercent} onChange={setCreatedDayRangePercent} />
        </div>
      </div>

      {/* 동적 조건 행 */}
      <div className="border-t pt-3 mt-0" style={{ borderColor: "var(--border-default)" }}>
        <div className="text-xs font-medium mb-2" style={{ color: "var(--text-tertiary)" }}>
          추가 조건 (항목 · 포함/제외 · 값)
        </div>
        <div className="space-y-0">
          {filterRules.map((rule, index) => (
            <FilterRuleRow
              key={rule.id}
              rule={rule}
              distinctValues={distinctValues}
              onUpdate={(r) => updateRule(index, r)}
              onRemove={() => removeRule(index)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={addRule}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--border-default)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-secondary)",
          }}
        >
          <Plus className="h-4 w-4" />
          조건 추가
        </button>
      </div>
      </div>
    </Card>
  );
}
