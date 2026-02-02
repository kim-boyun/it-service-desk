"use client";

import { useCallback, useState } from "react";
import { GripVertical } from "lucide-react";
import { Card } from "@/components/ui";
import {
  COLUMN_DEFS,
  SECTION_ORDER,
  type ColDef,
} from "./data-extract-types";

export function ColumnConfig({
  columnOrder,
  setColumnOrder,
  selectedColumns,
  setSelectedColumns,
  className,
}: {
  columnOrder: string[];
  setColumnOrder: (v: string[] | ((prev: string[]) => string[])) => void;
  selectedColumns: Set<string>;
  setSelectedColumns: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  className?: string;
}) {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedColumns(new Set(COLUMN_DEFS.map((c) => c.key)));
  };

  const deselectAll = () => {
    setSelectedColumns(new Set());
  };

  const keyToDef = useCallback((key: string): ColDef | undefined => {
    return COLUMN_DEFS.find((c) => c.key === key);
  }, []);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedKey(key);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.setData("application/x-column-key", key);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    setDragOverKey(null);
    setDraggedKey(null);
    const sourceKey = e.dataTransfer.getData("application/x-column-key");
    if (!sourceKey || sourceKey === targetKey) return;
    setColumnOrder((prev) => {
      const idx = prev.indexOf(sourceKey);
      const targetIdx = prev.indexOf(targetKey);
      if (idx === -1 || targetIdx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      next.splice(targetIdx, 0, sourceKey);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDraggedKey(null);
    setDragOverKey(null);
  };

  // Build list by columnOrder, grouped by section for display
  const bySection = useCallback(() => {
    const result: { section: string; keys: string[] }[] = [];
    for (const section of SECTION_ORDER) {
      const keys = columnOrder.filter((k) => keyToDef(k)?.section === section);
      if (keys.length > 0) result.push({ section, keys });
    }
    // any keys not in columnOrder (e.g. new columns)
    const orderedSet = new Set(columnOrder);
    const rest = COLUMN_DEFS.map((c) => c.key).filter((k) => !orderedSet.has(k));
    if (rest.length > 0) result.push({ section: "기타", keys: rest });
    return result;
  }, [columnOrder, keyToDef]);

  return (
    <Card padding="lg" className={`flex flex-col min-h-0 ${className ?? ""}`}>
      <h3
        className="text-sm font-semibold mb-3 pb-2 border-b shrink-0"
        style={{ color: "var(--text-secondary)", borderColor: "var(--border-default)" }}
      >
        출력 열 구성
      </h3>
      <p className="text-xs mb-3 shrink-0" style={{ color: "var(--text-tertiary)" }}>
        CSV/테이블에 포함할 컬럼을 선택하세요. 드래그하여 순서를 변경할 수 있습니다.
      </p>
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <button
          type="button"
          onClick={selectAll}
          className="text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          전체 선택
        </button>
        <button
          type="button"
          onClick={deselectAll}
          className="text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          전체 해제
        </button>
      </div>
      <div className="space-y-4 flex-1 min-h-0 overflow-y-auto">
        {bySection().map(({ section, keys }) => (
          <div key={section}>
            <div
              className="text-xs font-semibold uppercase tracking-wide mb-1.5"
              style={{ color: "var(--text-tertiary)" }}
            >
              {section}
            </div>
            <ul className="space-y-0.5">
              {keys.map((key) => {
                const def = keyToDef(key);
                if (!def) return null;
                const selected = selectedColumns.has(key);
                const isDragging = draggedKey === key;
                const isDragOver = dragOverKey === key;
                return (
                  <li
                    key={key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, key)}
                    onDragOver={(e) => handleDragOver(e, key)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, key)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 py-2 px-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${
                      isDragging ? "opacity-50" : ""
                    } ${isDragOver ? "ring-1 ring-[var(--color-primary-500)]" : ""}`}
                    style={{
                      borderColor: selected ? "var(--color-primary-400)" : "var(--border-subtle)",
                      backgroundColor: selected ? "var(--color-primary-50)" : "transparent",
                    }}
                  >
                    <span
                      className="shrink-0 touch-none"
                      style={{ color: "var(--text-tertiary)" }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <label className="flex-1 flex items-center gap-2 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleColumn(key)}
                        className="rounded shrink-0"
                      />
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: selected ? "var(--text-primary)" : "var(--text-secondary)" }}
                      >
                        {def.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
